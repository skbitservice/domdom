import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordVisit } from '../lib/backHistory';

/** Mount once inside <BrowserRouter> so Back knows where the user came from. */
export function BackHistoryTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);

  return null;
}
