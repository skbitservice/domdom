import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, TextField } from '@domdom/ui';
import { signInWithEmail } from '@domdom/api';
import { getErrorMessage, isValidEmail } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../components/ThemeToggle';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      navigate('/app/home', { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="text-lg font-black tracking-tight text-indigo-600 dark:text-indigo-400"
        >
          DOMDOM
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
            <h1 className="text-center text-2xl font-bold">Log in</h1>

            {notice && (
              <p
                role="status"
                className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              >
                {notice}
              </p>
            )}
            {formError && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
              >
                {formError}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <TextField
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
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
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" loading={loading} className="w-full">
                Log in
              </Button>
            </form>
          </div>

          <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No account?{' '}
            <Link
              to="/register"
              className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
