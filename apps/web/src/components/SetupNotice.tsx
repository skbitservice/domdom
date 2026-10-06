/**
 * Shown instead of the app when .env is missing.
 * This is real configuration feedback — never fake a working backend.
 */
export function SetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          DOMDOM — connect Supabase to continue
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          The app has no Supabase configuration yet, so authentication and data
          are disabled. Nothing is faked.
        </p>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            Create a free project at{' '}
            <a
              className="font-medium text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              supabase.com/dashboard
            </a>{' '}
            (name it <code className="font-mono">domdom</code>).
          </li>
          <li>
            Copy <code className="font-mono">apps/web/.env.example</code> to{' '}
            <code className="font-mono">apps/web/.env</code>.
          </li>
          <li>
            Fill in <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code>{' '}
            from Project Settings → API.
          </li>
          <li>Restart the dev server (npm run dev:web).</li>
        </ol>
      </div>
    </main>
  );
}
