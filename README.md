# TesBareng

TesBareng is a React + Vite app backed by a local Supabase stack during development.
No hosted Supabase project or credentials are needed to run it locally.

## Requirements

- Node.js 22 or newer and npm
- Docker Desktop installed and running

## Start locally

From the repository root:

```sh
npm install
npm --prefix web install
npm run db:start
npm run seed
```

In another terminal, start the web app:

```sh
npm --prefix web run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). To sign in as the
seeded admin without Google OAuth, open:

```text
http://localhost:5173/apps?devLogin=yusuf.hidayat.dev@gmail.com
```

The seed command clears and recreates the local sample data. It refuses to run
against a non-local Supabase URL. Local Supabase Studio is at
`http://127.0.0.1:54323`.

## Useful commands

```sh
npm run db:reset  # Reapply migrations to an empty local database; deletes its data
npm test          # Run integration tests; local Supabase must be running
npm run db:stop   # Stop the local Supabase stack
```

## Without Docker: cloud Supabase dev project

Use a separate, disposable Supabase project (not production):

1. Log in and link it: `npx supabase login`, then `npx supabase link --project-ref <ref>`.
2. Apply the schema: `npx supabase db push --remote`.
3. Create `web/.env.local` (gitignored) from `web/.env.example` with the project URL and anon key.
4. Optional sample data. It clears the target database, so it needs explicit opt-in:

   ```sh
   SEED_REMOTE_URL=https://<ref>.supabase.co \
   SEED_REMOTE_CONFIRM=https://<ref>.supabase.co \
   SEED_REMOTE_SERVICE_ROLE_KEY=<service role key> npm run seed
   ```

5. `?devLogin=` does not work here. In the Supabase dashboard, enable the Google provider with an OAuth client whose redirect URI is `https://<ref>.supabase.co/auth/v1/callback`, and add `http://127.0.0.1:5173/**` and `http://localhost:5173/**` as redirect URLs.
6. After your first sign-in, make yourself admin in the SQL editor: `update profiles set role = 'admin' where id = (select id from auth.users where email = '<your email>');`

Keep email sign-in disabled and never commit keys or the service role key.

## Local defaults

The app defaults to the local Supabase URL and public anon key. Do not copy
`web/.env.example` for local development; it is a template for a hosted project.
For local Google OAuth, configure credentials in `supabase/.env` using
`supabase/.env.example`. The `?devLogin=` shortcut does not need OAuth credentials.
