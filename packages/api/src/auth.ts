import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth API.
 *
 * Every function takes the Supabase client as its first argument so the same
 * business logic runs on web (VITE_ env) and mobile (EXPO_PUBLIC_ env) without
 * this package ever reading environment variables itself.
 *
 * Errors are re-thrown as-is; callers format them with `getErrorMessage`
 * from @domdom/utils.
 */

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpParams extends Credentials {
  /** Where Supabase redirects after the user clicks the verification link. */
  emailRedirectTo?: string;
}

export interface PasswordResetParams {
  email: string;
  redirectTo?: string;
}

/** Create an account. Email verification is required before sign-in works. */
export async function signUpWithEmail(client: SupabaseClient, params: SignUpParams) {
  const { data, error } = await client.auth.signUp({
    email: params.email.trim(),
    password: params.password,
    options: params.emailRedirectTo ? { emailRedirectTo: params.emailRedirectTo } : undefined,
  });
  if (error) throw error;
  return data;
}

/** Sign in with email + password. */
export async function signInWithEmail(client: SupabaseClient, params: Credentials) {
  const { data, error } = await client.auth.signInWithPassword({
    email: params.email.trim(),
    password: params.password,
  });
  if (error) throw error;
  return data;
}

/** Sign out and clear the local session. */
export async function signOut(client: SupabaseClient) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** Send a password-reset link to the user's email. */
export async function requestPasswordReset(client: SupabaseClient, params: PasswordResetParams) {
  const { error } = await client.auth.resetPasswordForEmail(params.email.trim(), {
    redirectTo: params.redirectTo,
  });
  if (error) throw error;
}

/** Read the currently persisted session (null when signed out). */
export async function getCurrentSession(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}
