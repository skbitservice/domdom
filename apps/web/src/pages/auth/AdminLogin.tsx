import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextField } from '@domdom/ui';
import { signInWithEmail } from '@domdom/api';
import { getErrorMessage, isValidEmail } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../components/ThemeToggle';
import { isAdmin } from '@domdom/api';

export function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('skbcomputer@gmail.com');
  const [password, setPassword] = useState('Kannu@1984');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!isValidEmail(email)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setFieldError('Enter your password.');
      return;
    }
    setFieldError(null);
    setLoading(true);

    try {
      await signInWithEmail(supabase!, { email, password });

      // Verify admin access after login
      const adminCheck = await isAdmin(supabase!);
      if (!adminCheck) {
        // Sign out if not admin
        await supabase!.auth.signOut();
        setFormError('Access denied. Admin privileges required.');
        setLoading(false);
        return;
      }

      navigate('/app/admin', { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <svg
            className="h-8 w-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
            DOMDOM Admin
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15">
                <svg
                  className="h-7 w-7 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold">Admin Sign In</h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Access the administration dashboard
              </p>
            </div>

            {formError && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
              >
                {formError}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <TextField
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldError && !email ? fieldError : null}
                required
              />
              <TextField
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldError && !password ? fieldError : null}
                required
              />
              <Button type="submit" loading={loading} className="w-full">
                Sign in to Admin
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-amber-600 dark:text-amber-400">
                skbcomputer@gmail.com
              </span>{' '}
              /{' '}
              <span className="font-mono text-xs">Kannu@1984</span>
            </p>

            <div className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                After first login, run this SQL in Supabase to grant admin rights:
              </p>
              <pre className="mt-2 rounded bg-zinc-100 p-2 text-[11px] font-mono text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 overflow-x-auto">
{`INSERT INTO public.admin_users (user_id, role)
SELECT id, 'admin' FROM public.profiles
WHERE username = (SELECT username FROM public.profiles WHERE id = auth.uid());`}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}