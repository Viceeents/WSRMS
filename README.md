# WSRMS

WSRMS is a web application for managing warehouse inventory and day-to-day parcel
handling. Staff can check parcels in and dispatch them, review transaction
history, and view operational summaries. Administrators can also manage user
access.

> [!IMPORTANT]
> **The warehouse inventory grid is not finished.** The grid/map visualization
> is still under development and is not yet a complete or production-ready
> representation of the warehouse. Do not rely on it as the authoritative
> warehouse layout. Parcel records and their stored location fields are managed
> separately in Inventory.

## Features

- Sign-in and staff access requests with administrator approval.
- Dashboard with warehouse activity and stock summaries.
- Inventory and category management, including stock status.
- Parcel check-in and dispatch, with transaction history.
- Reports and a warehouse grid/map visualization (the grid is unfinished; see
  the notice above).
- Administrator-only user management.
- PostgreSQL-backed API with audit records for supported data changes.

## Technology

- React, TypeScript, and Vite for the web client.
- Node.js and Express for the API.
- PostgreSQL for persistent data.
- Insomnia request collection at `insomnia/WSRMS-Insomnia.json`.

## Requirements

- Node.js 18 or newer and npm.
- PostgreSQL 13 or newer.
- `psql` command-line tools, available on your `PATH`, for database setup.

## Installation and local development

Run the commands below from the project root (the folder containing
`package.json`).

### 1. Install dependencies

```sh
npm ci
```

### 2. Create the database and apply the schema

Start PostgreSQL, then create an empty database named `wsrms` and apply the
project schema:

```sh
psql -U postgres -c "CREATE DATABASE wsrms;"
psql -U postgres -d wsrms -f database/schema.sql
```

Enter the PostgreSQL administrator password when prompted. If the database
already exists, skip the `CREATE DATABASE` command. The schema enables
`pgcrypto` for UUID generation, so the database role applying it must be
allowed to create that extension.

For a dedicated, least-privilege API database role and more database details,
see the [database setup guide](database/README.md).

### 3. Configure environment variables

Create a local `.env` file in the project root. There is no committed
`.env.example`; use this template and replace the database password and secret:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/wsrms
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
```

Generate a suitable random secret with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `JWT_SECRET`. Keep `.env` private and never
commit it. The example connection string uses the PostgreSQL administrator
account for local development only; use a dedicated, least-privilege database
role outside local development. If your database password contains URL-reserved
characters, percent-encode them in `DATABASE_URL`.

The API defaults to port `3001`, and the Vite development server defaults to
port `5173`. Optional overrides are `PORT` and `CLIENT_ORIGIN` (the API's
allowed frontend origin).

### 4. Start the app

```sh
npm run dev
```

Open <http://localhost:5173> for the web app. The Express API listens at
<http://localhost:3001>; Vite proxies `/api` requests to it. Check API and
database connectivity at <http://localhost:3001/api/health>.

### 5. Create and approve the first administrator

The schema does **not** create a default administrator or seed account. New
access requests create pending staff accounts, which cannot sign in until
approved.

1. In the web app, submit an access request using the name, email, and password
   you want to use for the first administrator.
2. Connect to the `wsrms` database as a PostgreSQL administrator (not as the
   application role) and promote that exact account:

   ```sql
   UPDATE users
   SET role = 'admin', status = 'approved'
   WHERE lower(email) = lower('admin@example.com');
   ```

   Replace `admin@example.com` with the email address used in the request.
   Confirm PostgreSQL reports `UPDATE 1`, then sign in with the same email and
   password. If it reports `UPDATE 0`, verify the request was submitted and the
   email matches.

Afterward, an administrator can review and approve staff access requests in
the Users section.

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API and frontend for local development. |
| `npm run dev:api` | Start only the API in watch mode. |
| `npm run dev:web` | Start only the Vite frontend. |
| `npm run build` | Type-check TypeScript and create a production frontend build in `dist/`. |
| `node --test tests/placement.test.mjs tests/routing.test.mjs` | Run the placement and routing tests. |
| `npm run preview` | Preview the built frontend locally. Run `npm run build` first. |

## Insomnia API requests

Import `insomnia/WSRMS-Insomnia.json` into Insomnia to try the API. Start the
app and database first, then send **Health check**. Sign-in and authenticated
requests require an approved account; user-management requests require an
administrator account.

## Project layout

```text
database/     PostgreSQL schema and database setup guide
insomnia/     Insomnia API request collection
public/       Static public assets
server/       Express API
src/          React/TypeScript frontend
tests/        Warehouse placement and routing tests
```

## Notes

- `.env`, `node_modules/`, and `dist/` are excluded from Git.
- Transaction records are designed to be immutable; parcel quantities are
  adjusted by database triggers when transactions are recorded.
- The warehouse grid/map remains incomplete and should be treated as a
  development visualization, not as a finished warehouse-planning tool.
