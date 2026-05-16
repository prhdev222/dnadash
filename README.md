# DNA Dashboard

Local-first admin dashboard and patient portal for Turso/libSQL data, prepared for Cloudflare Pages Functions.

## Files

- `public/index.html`: landing page
- `public/admin/index.html`: admin dashboard UI
- `public/patient/index.html`: patient portal UI
- `functions/api/query.js`: server-side Turso proxy
- `dna_schema.sql`: schema only, safe for creating a new empty database

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Fill in:

```dotenv
TURSO_DATABASE_URL=libsql://your-database-name.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-admin-password
```

4. Run locally:

```bash
npx wrangler pages dev
```

Open `http://localhost:8788`.

Admin area:

```text
/admin/
```

Patient portal:

```text
/patient/
```

## Create a new empty database

Use `dna_schema.sql` when you want to create the tables without importing any patient data.

With Turso CLI:

```bash
turso db shell <your-db-name> < dna_schema.sql
```

## Cloudflare Pages deployment

1. Create a Pages project.
2. Set the build output directory to `public`.
3. Add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` in `Settings > Variables and Secrets`.
4. Deploy with:

```bash
npx wrangler pages deploy public
```

You can also connect the repo to Cloudflare Pages with Git integration and keep the same output directory: `public`.
