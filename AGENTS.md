# Agent guidance

## Project overview

- Rhitusworld Photography's internal gift-certificate studio issues, previews, prints, and manages vouchers, balances, redemptions, expiration, voiding, and audit history.
- `frontend/` is a Vite/React application. Most UI, certificate state, API calls, local persistence, and embedded setup/schema examples live in `frontend/src/App.jsx`; styling and print layout live in `frontend/src/App.css` and `frontend/src/index.css`.
- `backend/server.js` is an Express REST API using PostgreSQL through `pg`. `backend/db/schema.sql` defines certificates and audit logs. The frontend uses camelCase while the database uses snake_case.

## Development

- Use Node.js 18+ and PostgreSQL 15+. Install dependencies separately in `frontend/` and `backend/` with `npm install` or `npm ci`.
- Create the database and apply `backend/db/schema.sql` with `psql`; there is no migration script. Copy each directory's `.env.example` to `.env` and configure it without committing credentials.
- From `backend/`, run `npm run dev` (default port 4000) or `npm start`. From `frontend/`, run `npm run dev` (default port 5173); `npm run build` builds the frontend.
- The frontend defaults to `http://localhost:4000/api`. Its current URL resolver checks `window.__VITE_API_URL__` and `process.env.VITE_API_URL`, not Vite's `import.meta.env`; verify configuration behavior before relying on the documented `.env` setting.
- Neither package currently defines a test script. For changes, add or run appropriate targeted checks; for UI changes, also verify the relevant workflows and print layout manually.

## Change guidelines

- Keep the API contract aligned across frontend, server, and schema: `GET` and `POST /api/certificates`, `POST /api/certificates/:id/redeem`, and `PATCH /api/certificates/:id`.
- Preserve transaction and audit behavior when changing issuance, redemption, expiration, or voiding. Pay particular attention to money, dates, status calculations, and database constraints.
- The frontend falls back to browser-local cache and seed data when the API is unavailable. Local changes are not guaranteed to synchronize to PostgreSQL; do not imply otherwise or silently discard data.
- Schema and API examples are also embedded in `App.jsx`; keep relevant examples consistent when changing the actual implementation.
- Preserve certificate themes and the `#react-print-stage` print isolation when modifying the UI. Follow existing code style and keep changes focused.
- The API currently enables global CORS and has no apparent authentication or explicit request validation. Do not assume it is safe to expose publicly; consider security implications of backend changes.