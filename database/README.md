# WSRMS Database Setup

This guide covers the PostgreSQL schema, the Express API, and testing requests in Insomnia. PostgreSQL 13 or newer and Node.js 18 or newer are recommended.

## Create the database with SQL Shell

Open **SQL Shell (psql)**. At the connection prompts, press Enter to accept each default:

```text
Server [localhost]:             Enter
Database [postgres]:            Enter
Port [5432]:                    Enter
Username [postgres]:            Enter
Password for user postgres:     type your PostgreSQL password, then Enter
```

The password is not displayed while you type. After login, the prompt should look like `postgres=#`. Enter:

```sql
CREATE DATABASE wsrms;
```

Connect to the new database:

```psql
\c wsrms
```

The prompt should now look like `wsrms=#`. Apply the schema using the project's absolute Windows path:

```psql
\i 'C:/Codingshits/WORMS/wsrms-app/database/schema.sql'
```

Successful output contains `CREATE TABLE`, `CREATE INDEX`, `CREATE FUNCTION`, and `CREATE TRIGGER`. Notices saying that a trigger does not exist and is being skipped are expected on the first run; the script removes old triggers before recreating them so it can be reapplied.

If the project folder is moved, update the path in the `\i` command. The schema enables `pgcrypto` for UUID generation, so the database user applying it needs permission to create that extension.

## Verify the setup

List the created tables:

```psql
\dt
```

You should see `users`, `categories`, `parcels`, `transactions`, and `audit_events`. Check that the database is selected and empty to start:

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

From the `wsrms-app` folder, install dependencies and make a local environment file:

```powershell
npm install
Copy-Item .env.example .env
```

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

Edit `.env` and set `DATABASE_URL` to the API role's actual password. Set `JWT_SECRET` to a private random value of at least 32 characters. One way to generate it in PowerShell is:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start both the Express API and React frontend from `wsrms-app`:

```powershell
npm run dev
```

The API listens on `http://localhost:3001`; the frontend is served at `http://localhost:5173` and proxies `/api` requests to the API. The API verifies passwords, requires approved accounts for sign-in, and enforces admin access for user review. For audit attribution it sets `app.user_id` from the verified token inside the same database transaction; it never accepts the actor ID from the browser.

## Test with Insomnia

1. In Insomnia, choose **Import** and select `insomnia/WSRMS-Insomnia.json`.
2. Send **Health check** first; a successful response contains `"status": "ok"` and `"database": "wsrms"`.
3. Send **Sign in** with the approved account email and password. The admin account created earlier uses `vince@wsrms.local`; replace the request's password placeholder with the password you set.
4. Copy the returned `token` into the Insomnia environment's `token` field. Authenticated requests use it as a Bearer token.
5. Send **Create parcel**, copy its returned `parcel.id` into the `parcel_id` environment field, then try **Check in parcel**, **Dispatch parcel**, **List inventory**, and **List transactions**.

The access-request endpoint creates pending staff accounts. Only an approved account can sign in. Inventory and transaction requests require a token; **List users (admin)** requires an administrator token.