#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql to the remote project via the
 * Supabase Management API — no CLI or Docker required.
 *
 * Applied files are tracked in public.domdom_migrations, so re-running the
 * script only executes files that have not been applied yet.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN = "<your personal access token>"
 *   npm run db:push
 *
 * Create the token at: https://supabase.com/dashboard/account/tokens
 * REVOKE the token after running — it has account-wide power.
 * The token is read from the environment only; it is never written to disk.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRef = process.env.SUPABASE_PROJECT_REF ?? 'gtpmftsvnqznpnljchkt';
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set. Create one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const api = async (sql, params = []) => {
  const body = params.length > 0 ? { query: sql, params } : { query: sql };
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let responseBody = null;
  try {
    responseBody = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { ok: res.ok, status: res.status, body: responseBody };
};

const runOrDie = async (label, sql, params = []) => {
  const { ok, status, body } = await api(sql, params);
  if (!ok) {
    console.error(`FAIL ${label} (HTTP ${status})`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
};

// 1. Migration-tracking table
await runOrDie(
  'create tracking table',
  `create table if not exists public.domdom_migrations (
     filename text primary key,
     applied_at timestamptz not null default now()
   );`,
  [],
);

// 2. Which files are already applied?
const appliedResult = await api('select filename from public.domdom_migrations', []);
if (!appliedResult.ok) {
  console.error('FAIL read tracking table');
  console.error(JSON.stringify(appliedResult.body, null, 2));
  process.exit(1);
}
const applied = new Set(
  (appliedResult.body ?? []).flatMap((row) =>
    Array.isArray(row.filename) ? row.filename : row.filename ? [row.filename] : [],
  ),
);

// 3. Apply pending files in order
const migrationsDir = path.resolve('supabase', 'migrations');
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.error('No .sql files found in supabase/migrations');
  process.exit(1);
}

let ran = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`SKIP ${file} (already applied)`);
    continue;
  }

  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  await runOrDie(file, sql);
  // Use parameterized query to avoid SQL injection via filename
  const { ok, status, body } = await api({
    query: 'insert into public.domdom_migrations (filename) values ($1) on conflict do nothing;',
    params: [file],
  });
  if (!ok) {
    console.error(`FAIL record ${file} (HTTP ${status})`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(`OK   ${file}`);
  ran += 1;
}

console.log(
  ran === 0
    ? '\nNothing to do — all migrations were already applied.'
    : `\nApplied ${ran} migration(s) to ${projectRef}.`,
);
