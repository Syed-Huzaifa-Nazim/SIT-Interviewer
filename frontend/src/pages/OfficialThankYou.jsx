import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import BrandLogo from '../components/layout/BrandLogo';
import InterviewFeedbackForm from '../components/feedback/InterviewFeedbackForm';
import { CheckCircle2 } from 'lucide-react';

/**
 * Post-interview screen for one-time candidates — §3.3 steps 7–8.
 *
 * Shown INSTEAD of the report page when a one-time session's interview concludes. It exits
 * full-screen, collects optional feedback, then closes the session server-side (revoking
 * every token issued for this login) so the one-time credential can never be reused.
 *
 * ORDERING MATTERS. This page used to close the session on mount, which made collecting
 * feedback here impossible: the candidate had no valid token left to submit it with. The
 * close is now deferred until they submit or skip. To keep that from weakening anything:
 *
 *  - localStorage is still cleared immediately on mount, so no other tab or later visit can
 *    pick the credential up. The token is held only in a ref for the two requests this page
 *    makes itself, sent with raw axios rather than the shared instance.
 *  - The session is closed on submit, on skip, on the Back-button trap, on tab close
 *    (pagehide, via a keepalive fetch that survives unload), and by a hard timeout — so an
 *    abandoned tab cannot hold the login open indefinitely.
 *  - closeSession is idempotent; whichever of those fires first wins and the rest no-op.
 */

// How long an untouched feedback form keeps the session open before it is closed anyway.
// Long enough to actually write something, short enough that walking away still ends it.
const AUTO_CLOSE_MS = 5 * 60 * 1000;

const OfficialThankYou = () => {
  const { id: interviewId } = useParams();
  const tokenRef = useRef(null);
  const capturedRef = useRef(false);
  const closedRef = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [gaveFeedback, setGaveFeedback] = useState(false);

  // Close the session server-side. Idempotent — the first caller wins.
  // `viaBeacon` uses fetch with keepalive because the page is being torn down at that point
  // and a normal XHR would be cancelled before it left the browser.
  const closeSession = useCallback((viaBeacon = false) => {
    if (closedRef.current) return;
    closedRef.current = true;
    const token = tokenRef.current;
    tokenRef.current = null;
    if (!token) return;

    const url = `${api.defaults.baseURL}/candidate/official-interview/complete`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (viaBeacon) {
      try {
        fetch(url, { method: 'POST', headers, body: '{}', keepalive: true });
      } catch {
        /* the tab is going away regardless; the auto-close timeout is the backstop */
      }
      return;
    }
    // Raw axios (not the shared api instance) so the response interceptor can never bounce
    // this page to /login on a stray 401.
    axios.post(url, {}, { headers }).catch(() => {});
  }, []);

  // Mount: take the credential out of localStorage at once and leave full-screen. The
  // session itself stays open until the feedback step resolves (see the note above).
  useEffect(() => {
    if (capturedRef.current) return;
    capturedRef.current = true;

    tokenRef.current = localStorage.getItem('access_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Backstops: tab close and an abandoned form.
  useEffect(() => {
    const onPageHide = () => closeSession(true);
    window.addEventListener('pagehide', onPageHide);
    const timer = setTimeout(() => closeSession(), AUTO_CLOSE_MS);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      clearTimeout(timer);
    };
  }, [closeSession]);

  // Trap the browser Back button: this is a terminal page — the credentials are wiped, so
  // going "back" must never re-render the interview or rules page. Push a sentinel history
  // entry and, on Back, close the session and hard-redirect to /login. A full
  // location.replace (not SPA navigate) reloads the app so any stale in-memory auth state
  // is discarded and there is no way to resume the one-time interview.
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      closeSession(true);
      window.location.replace('/login');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeSession]);

  const finish = useCallback(() => {
    setDone(true);
    closeSession();
  }, [closeSession]);

  const handleSubmit = async (values) => {
    if (submitting) return;
    setSubmitting(true);

    const token = tokenRef.current;
    if (token) {
      try {
        await axios.post(
          `${api.defaults.baseURL}/feedback`,
          { ...values, interview_id: interviewId ? Number(interviewId) : null },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        // Never block the candidate on feedback delivery — they have finished their
        // interview and the session still needs closing either way.
      }
    }
    setSubmitting(false);
    setGaveFeedback(true);
    finish();
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans">
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <BrandLogo />
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-xl space-y-4 animate-fade-in">
          <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent-500/15 text-accent-500 flex items-center justify-center animate-check-pop">
              <CheckCircle2 size={38} />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Thank you for giving the interview!
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Our HR team will review your performance and proceed with the next steps.
            </p>
          </div>

          {done ? (
            <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {gaveFeedback ? 'Thank you — your feedback has been recorded.' : 'You can close this tab now.'}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
                You have been securely signed out. Your one-time credentials are no longer valid.
              </p>
            </div>
          ) : (
            <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  How was your experience?
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Optional, and never shown to anyone assessing you. It only helps us improve
                  the platform.
                </p>
              </div>

              <InterviewFeedbackForm
                onSubmit={handleSubmit}
                submitting={submitting}
                secondaryAction={
                  <button
                    type="button"
                    onClick={finish}
                    disabled={submitting}
                    className="rounded-lg px-4 py-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50 dark:hover:text-slate-200"
                  >
                    Skip &amp; finish
                  </button>
                }
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default OfficialThankYou;
