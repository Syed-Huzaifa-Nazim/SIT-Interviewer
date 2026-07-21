import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import api from '../services/api';
import BrandLogo from '../components/layout/BrandLogo';
import { CheckCircle2 } from 'lucide-react';

/**
 * Post-interview screen for one-time candidates — §3.3 steps 7–8.
 *
 * Shown INSTEAD of the report page when a one-time session's interview concludes.
 * On mount it closes the session server-side (revoking every token issued for this
 * login), exits full-screen, and wipes local credentials — so refreshing, reopening,
 * or navigating back can never resume the session.
 */
const OfficialThankYou = () => {
  const closedRef = useRef(false);

  useEffect(() => {
    if (closedRef.current) return;
    closedRef.current = true;

    const token = localStorage.getItem('access_token');

    // Forced logout: wipe credentials immediately so no other tab/request can use them.
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // Close the session server-side. Raw axios (not the shared api instance) so the
    // response interceptor can never bounce this page to /login on a stray 401.
    if (token) {
      axios.post(
        `${api.defaults.baseURL}/candidate/official-interview/complete`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => {});
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Trap the browser Back button: this is a terminal page — the session is closed and
  // credentials are wiped, so going "back" must never re-render the interview or rules
  // page. Push a sentinel history entry and, on Back, hard-redirect to /login. A full
  // location.replace (not SPA navigate) reloads the app so any stale in-memory auth
  // state is discarded and there is no way to resume the one-time interview.
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      window.location.replace('/login');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans">
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <BrandLogo />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-5 animate-fade-in">
          <div className="w-20 h-20 mx-auto rounded-full bg-accent-500/15 text-accent-500 flex items-center justify-center animate-check-pop">
            <CheckCircle2 size={44} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Thank you for giving the interview!
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Our HR team will review your performance and proceed with the next steps.
            You can close this tab now.
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
            You have been securely signed out. Your one-time credentials are no longer valid.
          </p>
        </div>
      </main>
    </div>
  );
};

export default OfficialThankYou;
