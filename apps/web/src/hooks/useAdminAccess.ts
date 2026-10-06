import { useEffect, useState } from 'react';
import { isAdmin } from '@domdom/api';
import { supabase } from '../lib/supabase';

export type AdminAccess = 'loading' | 'denied' | 'granted';

/**
 * Cosmetic gate for admin pages: it only decides what to render while the
 * request is in flight. The real gate is `public.is_admin()` — inside every
 * RLS policy and inside the admin functions (migration 00012) — so opening
 * an admin URL without admin rights just yields empty reads or a 42501.
 */
export function useAdminAccess(): AdminAccess {
  const [access, setAccess] = useState<AdminAccess>('loading');

  useEffect(() => {
    if (!supabase) {
      setAccess('denied');
      return;
    }
    let cancelled = false;
    isAdmin(supabase)
      .then((admin) => {
        if (!cancelled) setAccess(admin ? 'granted' : 'denied');
      })
      .catch(() => {
        if (!cancelled) setAccess('denied');
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return access;
}
