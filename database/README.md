# WSRMS Database Setup

This guide covers the PostgreSQL schema, the Express API, and testing requests in Insomnia. PostgreSQL 13 or newer and Node.js 18 or newer are recommended. For the application overview and a quick local setup, see the [project README](../README.md).

## Create the database and apply the schema

From the project root, use `psql` to create the database and apply the schema.
The commands assume PostgreSQL is running and `psql` is available on your
`PATH`:

```sh
psql -U postgres -d postgres -c "CREATE DATABASE wsrms;"
psql -U postgres -d wsrms -f database/schema.sql
```

Enter the PostgreSQL administrator password when prompted. If `wsrms` already
exists, skip the first command. Successful schema output contains `CREATE
TABLE`, `CREATE INDEX`, `CREATE FUNCTION`, and `CREATE TRIGGER`. Notices saying
that a trigger does not exist and is being skipped are expected on the first
run; the script removes old triggers before recreating them so it can be
reapplied. The schema enables `pgcrypto` for UUID generation, so the database
role applying it needs permission to create that extension.

## Verify the setup

Connect to the database:

```sh
psql -U postgres -d wsrms
```

At the `wsrms=#` prompt, list the created tables:

```psql
\dt
```

You should see `users`, `categories`, `parcels`, `transactions`, and
`audit_events`. Check that the database is selected and empty to start:

```sql
SELECT current_database();
SELECT count(*) FROM parcels;
```

The first query should return `wsrms`; the second should return `0` unless you have already added parcel records.

## Tables and behavior

| Table | Purpose |
| --- | --- |
| `users` | Staff and administrator accounts, role, approval status, and password hash. |
| `categories` | Product or parcel categories. |
| `parcels` | Parcel identifiers, company, storage location, quantity, and reorder threshold. Stock status is calculated from quantity and threshold. |
| `transactions` | Check-in and dispatch history, quantity, staff member, and recipient. Rows cannot be edited or deleted. |
| `audit_events` | Before-and-after snapshots for changes to users, categories, parcels, and transactions. Password hashes are excluded. |

Insert a row into `transactions` to record a check-in or dispatch; a database trigger updates the parcel quantity automatically. Dispatching more than the available quantity fails. Use a database transaction in the API when an operation spans multiple writes.

## Configure and start the API

From the project root, install dependencies and create a local `.env` file:

```powershell
npm ci
New-Item -ItemType File -Path .env
```

There is no committed `.env.example`. Edit `.env` and set `DATABASE_URL` to the connection string for the API database role and `JWT_SECRET` to a private random value of at least 32 characters. For local development, the project README documents the connection string format. Keep `.env` private and do not commit it.

Use a dedicated PostgreSQL login for the API rather than the `postgres` superuser. If you have not already created the role, connect to `wsrms` as the database administrator and run the grants below. Replace the example password with a strong password; do not commit it to source control.

```sql
CREATE ROLE wsrms_app LOGIN PASSWORD 'replace-with-a-strong-password';
GRANT CONNECT ON DATABASE wsrms TO wsrms_app;
GRANT USAGE ON SCHEMA public TO wsrms_app;
GRANT SELECT, INSERT, UPDATE ON users TO wsrms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO wsrms_app;
GRANT SELECT, DELETE ON parcels TO wsrms_app;
GRANT INSERT (parcel_code, category_id, company, supplier, storage_location, fragile, quantity, weight_kg, reorder_threshold, notes, received_at, created_by)
    ON parcels TO wsrms_app;
GRANT UPDATE (parcel_code, category_id, company, supplier, storage_location, fragile, weight_kg, reorder_threshold, notes, received_at)
    ON parcels TO wsrms_app;
GRANT SELECT, INSERT ON transactions TO wsrms_app;
GRANT SELECT ON audit_events TO wsrms_app;
```

One way to generate the secret in PowerShell is:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start both the Express API and React frontend from `wsrms-app`:

```powershell
npm run dev
```

The API listens on `http://localhost:3001`; the frontend is served at `http://localhost:5173` and proxies `/api` requests to the API. The API verifies passwords, requires approved accounts for sign-in, and enforces admin access for user review. For audit attribution it sets `app.user_id` from the verified token inside the same database transaction; it never accepts the actor ID from the browser.

## Test with Insomnia

1. In Insomnia, choose **Import** and select `insomnia/WSRMS-Insomnia.json`.
2. Send **Health check** first; a successful response contains `"status": "ok"` and `"database": "wsrms"`.
3. The schema does not seed an administrator account. Submit an access request through the app, then have a database administrator approve and promote that account before signing in. See the project README for the first-administrator SQL step.
4. Copy the returned `token` into the Insomnia environment's `token` field. Authenticated requests use it as a Bearer token.
5. Send **Create parcel**, copy its returned `parcel.id` into the `parcel_id` environment field, then try **Check in parcel**, **Dispatch parcel**, **List inventory**, and **List transactions**.

The access-request endpoint creates pending staff accounts. Only an approved account can sign in. Inventory and transaction requests require a token; **List users (admin)** requires an administrator token.