import { Link } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { ThemeToggle } from '../components/ThemeToggle';

const features = [
  { title: 'Photos & posts', body: 'Share moments with friends, likes and threaded comments.' },
  { title: 'Stories', body: '24-hour stories that expire on their own.' },
  { title: 'Reels', body: 'Vertical short video with a fast, thumb-first feed.' },
  { title: 'Messages', body: 'Real-time direct messages that work on every device.' },
];

export function Landing() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
          DOMDOM
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session ? (
            <Link
              to="/app/home"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
            Share your world with <span className="text-indigo-600 dark:text-indigo-400">DOMDOM</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            A social home for photos, stories, reels and messages — built light,
            fast and friendly.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/register"
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Get started
            </Link>
            <Link
              to="/login"
              className="rounded-xl px-6 py-3 text-sm font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-900"
            >
              Log in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {feature.body}
              </p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        DOMDOM — built on the free tier: React + Supabase.
      </footer>
    </div>
  );
}
