import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-black text-indigo-600 dark:text-indigo-400">404</p>
      <p className="text-zinc-600 dark:text-zinc-400">This page doesn&apos;t exist.</p>
      <Link
        to="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Back to home
      </Link>
    </div>
  );
}
