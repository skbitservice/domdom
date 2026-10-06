import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, TextField } from '@domdom/ui';
import { signUpWithEmail } from '@domdom/api';
import { getErrorMessage, isValidEmail, passwordError } from '@domdom/utils';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../components/ThemeToggle';

export function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const nextErrors: typeof errors = {};
    if (!isValidEmail(email)) nextErrors.email = 'Enter a valid email address.';
    const pwdIssue = passwordError(password);
    if (pwdIssue) nextErrors.password = pwdIssue;
    if (confirm !== password) nextErrors.confirm = 'Passwords do not match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const data = await signUpWithEmail(supabase!, {
        email,
        password,
        emailRedirectTo: `${window.location.origin}/login`,
      });

      // With email confirmation ON there is no session yet — send them to
      // log in after confirming. With it OFF (local dev) we are signed in.
      if (data.session) {
        navigate('/app/home', { replace: true });
      } else {
        navigate('/login', {
          state: { notice: 'Account created. Check your inbox to verify your email, then log in.' },
        });
      }
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
            <h1 className="text-center text-2xl font-bold">Create your account</h1>

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
                error={errors.email}
                required
              />
              <TextField
                label="Password"
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                required
              />
              <TextField
                label="Confirm password"
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={errors.confirm}
                required
              />
              <Button type="submit" loading={loading} className="w-full">
                Sign up
              </Button>
            </form>
          </div>

          <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
