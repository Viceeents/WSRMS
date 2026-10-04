import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure it.');
}

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function requireAuth(request, response, next) {
  const authorization = request.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ error: 'A bearer token is required.' });
  }

  try {
    request.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return response.status(401).json({ error: 'The token is invalid or expired.' });
  }
}

function requireAdmin(request, response, next) {
  if (request.user?.role !== 'admin') {
    return response.status(403).json({ error: 'Administrator access is required.' });
  }

  return next();
}

async function withActorTransaction(actorId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [actorId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function createTransactionCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return `TXN-${date}-${suffix}`;
}

app.get('/api/health', asyncRoute(async (_request, response) => {
  const result = await pool.query('SELECT current_database() AS database, now() AS server_time');
  response.json({ status: 'ok', ...result.rows[0] });
}));

app.post('/api/auth/request-access', asyncRoute(async (request, response) => {
  const { fullName, email, password } = request.body ?? {};
  if (typeof fullName !== 'string' || !fullName.trim() || typeof email !== 'string' || !email.trim()) {
    return response.status(400).json({ error: 'Full name and email are required.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, status)
     VALUES ($1, lower($2), $3, 'staff', 'pending')
     RETURNING id, full_name, email, status`,
    [fullName.trim(), email.trim(), passwordHash],
  );

  response.status(201).json({
    message: 'Access request submitted for administrator review.',
    user: result.rows[0],
  });
}));

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const { email, password } = request.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return response.status(400).json({ error: 'Email and password are required.' });
  }

  const result = await pool.query(
    `SELECT id, full_name, email, password_hash, role, status
     FROM users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.status !== 'approved') {
    return response.status(403).json({ error: 'This account has not been approved.' });
  }

  const token = jwt.sign({ role: user.role }, jwtSecret, {
    subject: user.id,
    expiresIn: '8h',
  });

  response.json({
    token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
  });
}));

app.get('/api/auth/me', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `SELECT id, full_name, email, role, status FROM users WHERE id = $1`,
    [request.user.sub],
  );
  const user = result.rows[0];
  if (!user || user.status !== 'approved') {
    return response.status(401).json({ error: 'This account is no longer approved.' });
  }
  response.json({ user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
}));

app.get('/api/categories', requireAuth, asyncRoute(async (_request, response) => {
  const result = await pool.query('SELECT id, name, description FROM categories ORDER BY name');
  response.json({ items: result.rows });
}));

app.post('/api/admin/categories', requireAuth, requireAdmin, asyncRoute(async (request, response) => {
  const { name, description = null } = request.body ?? {};
  if (typeof name !== 'string' || !name.trim()
    || (description !== null && typeof description !== 'string')) {
    return response.status(400).json({ error: 'A category name and an optional description are required.' });
  }

  const result = await withActorTransaction(request.user.sub, (client) => client.query(
    `INSERT INTO categories (name, description) VALUES ($1, $2)
     RETURNING id, name, description`,
    [name.trim(), description?.trim() || null],
  ));
  response.status(201).json({ category: result.rows[0] });
}));

app.patch('/api/admin/categories/:id', requireAuth, requireAdmin, asyncRoute(async (request, response) => {
  const { name, description = null } = request.body ?? {};
  if (typeof name !== 'string' || !name.trim()
    || (description !== null && typeof description !== 'string')) {
    return response.status(400).json({ error: 'A category name and an optional description are required.' });
  }

  const result = await withActorTransaction(request.user.sub, (client) => client.query(
    `UPDATE categories SET name = $1, description = $2 WHERE id = $3
     RETURNING id, name, description`,
    [name.trim(), description?.trim() || null, request.params.id],
  ));
  if (result.rowCount === 0) return response.status(404).json({ error: 'Category not found.' });
  response.json({ category: result.rows[0] });
}));

app.delete('/api/admin/categories/:id', requireAuth, requireAdmin, asyncRoute(async (request, response) => {
  const result = await withActorTransaction(request.user.sub, (client) => client.query(
    'DELETE FROM categories WHERE id = $1 RETURNING id',
    [request.params.id],
  ));
  if (result.rowCount === 0) return response.status(404).json({ error: 'Category not found.' });
  response.status(204).end();
}));

app.get('/api/inventory', requireAuth, asyncRoute(async (request, response) => {
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const status = typeof request.query.status === 'string' ? request.query.status : '';
  const validStatuses = new Set(['in_stock', 'low_stock', 'out_of_stock']);
  if (status && !validStatuses.has(status)) {
    return response.status(400).json({ error: 'Status must be in_stock, low_stock, or out_of_stock.' });
  }

  const result = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM parcels p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ($1 = '' OR p.parcel_code ILIKE '%' || $1 || '%' OR p.company ILIKE '%' || $1 || '%')
       AND ($2 = '' OR p.status = $2)
     ORDER BY p.updated_at DESC
     LIMIT 250`,
    [search, status],
  );
  response.json({ items: result.rows });
}));

app.post('/api/inventory', requireAuth, asyncRoute(async (request, response) => {
  const {
    parcelCode, categoryId = null, company, supplier = null,
    storageLocation, fragile = false, quantity = 0, weightKg = null,
    reorderThreshold = 0, notes = null,
  } = request.body ?? {};
  if (typeof parcelCode !== 'string' || !parcelCode.trim()
    || typeof company !== 'string' || !company.trim()
    || typeof storageLocation !== 'string' || !storageLocation.trim()) {
    return response.status(400).json({ error: 'Parcel code, company, and storage location are required.' });
  }
  if (!Number.isInteger(quantity) || quantity < 0
    || !Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
    return response.status(400).json({ error: 'Quantity and reorder threshold must be non-negative whole numbers.' });
  }

  const result = await withActorTransaction(request.user.sub, async (client) => {
    const inserted = await client.query(
      `INSERT INTO parcels (
         parcel_code, category_id, company, supplier, storage_location, fragile,
         quantity, weight_kg, reorder_threshold, notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10)
       RETURNING *`,
      [parcelCode.trim(), categoryId, company.trim(), supplier, storageLocation.trim(), Boolean(fragile), weightKg, reorderThreshold, notes, request.user.sub],
    );
    let initialTransaction = null;
    if (quantity > 0) {
      initialTransaction = await client.query(
        `INSERT INTO transactions (transaction_code, parcel_id, type, quantity, staff_id, note)
         VALUES ($1, $2, 'check_in', $3, $4, 'Initial stock')
         RETURNING *`,
        [createTransactionCode(), inserted.rows[0].id, quantity, request.user.sub],
      );
    }
    return { parcel: inserted.rows[0], initialTransaction: initialTransaction?.rows[0] ?? null };
  });

  response.status(201).json(result);
}));

app.patch('/api/admin/inventory/:id', requireAuth, requireAdmin, asyncRoute(async (request, response) => {
  const editableColumns = {
    company: 'company',
    categoryId: 'category_id',
    supplier: 'supplier',
    storageLocation: 'storage_location',
    fragile: 'fragile',
    weightKg: 'weight_kg',
    reorderThreshold: 'reorder_threshold',
    notes: 'notes',
  };
  const assignments = [];
  const values = [];

  for (const [field, column] of Object.entries(editableColumns)) {
    if (!Object.hasOwn(request.body ?? {}, field)) continue;
    const value = request.body[field];
    const valid = field === 'company' || field === 'storageLocation'
      ? typeof value === 'string' && value.trim().length > 0
      : field === 'categoryId'
        ? value === null || (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
        : field === 'supplier' || field === 'notes'
          ? value === null || typeof value === 'string'
          : field === 'fragile'
            ? typeof value === 'boolean'
            : field === 'weightKg'
              ? value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
              : Number.isInteger(value) && value >= 0;
    if (!valid) return response.status(400).json({ error: `Invalid value for ${field}.` });

    values.push(typeof value === 'string' && ['company', 'storageLocation', 'supplier', 'notes'].includes(field) ? value.trim() : value);
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) {
    return response.status(400).json({ error: 'At least one editable parcel field is required.' });
  }
  values.push(request.params.id);
  const result = await withActorTransaction(request.user.sub, (client) => client.query(
    `UPDATE parcels SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  ));
  if (result.rowCount === 0) return response.status(404).json({ error: 'Parcel not found.' });
  response.json({ parcel: result.rows[0] });
}));

app.delete('/api/admin/inventory/:id', requireAuth, requireAdmin, asyncRoute(async (request, response) => {
  const result = await withActorTransaction(request.user.sub, (client) => client.query(
    `DELETE FROM parcels p WHERE p.id = $1
     AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.parcel_id = p.id)
     RETURNING p.id`,
    [request.params.id],
  ));
  if (result.rowCount === 0) {
    const exists = await pool.query('SELECT 1 FROM parcels WHERE id = $1', [request.params.id]);
    if (exists.rowCount === 0) return response.status(404).json({ error: 'Parcel not found.' });
    return response.status(409).json({ error: 'Parcels with transaction history cannot be deleted.' });
  }
  response.status(204).end();
}));

app.get('/api/transactions', requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `SELECT t.*, p.parcel_code, p.company, u.full_name AS staff_name
     FROM transactions t
     JOIN parcels p ON p.id = t.parcel_id
     LEFT JOIN users u ON u.id = t.staff_id
     ORDER BY t.occurred_at DESC
     LIMIT 250`,
  );
  response.json({ items: result.rows });
}));

app.post('/api/transactions', requireAuth, asyncRoute(async (request, response) => {
  const { parcelId, type, quantity, recipient = null, note = null } = request.body ?? {};
  if (typeof parcelId !== 'string' || !/^[0-9a-f-]{36}$/i.test(parcelId)) {
    return response.status(400).json({ error: 'A valid parcelId is required.' });
  }
  if (!['check_in', 'dispatch'].includes(type) || !Number.isInteger(quantity) || quantity <= 0) {
    return response.status(400).json({ error: 'Type must be check_in or dispatch and quantity must be a positive whole number.' });
  }
  if (type === 'dispatch' && (typeof recipient !== 'string' || !recipient.trim())) {
    return response.status(400).json({ error: 'A recipient is required for dispatch.' });
  }

  const result = await withActorTransaction(request.user.sub, async (client) => {
    const inserted = await client.query(
      `INSERT INTO transactions (transaction_code, parcel_id, type, quantity, staff_id, recipient, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [createTransactionCode(), parcelId, type, quantity, request.user.sub, recipient?.trim() || null, note],
    );
    return inserted.rows[0];
  });

  response.status(201).json({ transaction: result });
}));

app.get('/api/admin/users', requireAuth, requireAdmin, asyncRoute(async (_request, response) => {
  const result = await pool.query(
    `SELECT id, full_name, email, role, status, created_at
     FROM users ORDER BY created_at DESC LIMIT 250`,
  );
  response.json({ items: result.rows });
}));

app.patch('/api/admin/users/:id/status', requireAuth, requireAdmin, asyncRoute(async (request, response) => {
  const { status } = request.body ?? {};
  if (!['approved', 'rejected'].includes(status)) {
    return response.status(400).json({ error: 'Status must be approved or rejected.' });
  }

  const result = await withActorTransaction(request.user.sub, async (client) => client.query(
    `UPDATE users SET status = $1 WHERE id = $2
     RETURNING id, full_name, email, role, status`,
    [status, request.params.id],
  ));
  if (result.rowCount === 0) {
    return response.status(404).json({ error: 'User not found.' });
  }
  response.json({ user: result.rows[0] });
}));

app.use((error, _request, response, _next) => {
  if (error.code === '23505') {
    return response.status(409).json({ error: 'A record with that unique value already exists.' });
  }
  if (error.code === '23503' || error.code === '23514' || error.code === '22P02') {
    return response.status(400).json({ error: error.message });
  }
  if (error.code === 'P0001') {
    return response.status(409).json({ error: error.message });
  }

  console.error(error);
  return response.status(500).json({ error: 'An unexpected server error occurred.' });
});

const server = app.listen(port, () => {
  console.log(`WSRMS API listening at http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);