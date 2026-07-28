# Development Log

Running day-by-day record of what changed on this project. Newest day on top. One line per
change — see git log / commit messages for full detail on any entry.

---

## 2026-07-28
- Added a camera-stall watchdog for the live interview feed: detects both an instant camera drop (track ended/muted) and a silent freeze (no frame processed for 6s), then automatically re-acquires the webcam so proctoring resumes without restarting the interview
- Added a calm "reconnecting" banner during recovery, and a persistent notice if the camera truly can't be restored — the interview continues rather than penalizing the candidate, with the gap logged as a technical incident for admin review (not counted as misconduct)
- Hardened the Admin Hub's session-recording player: an in-player playback failure (e.g. an expired signed URL) now shows a clear error with a one-click retry instead of a silently frozen video

## 2026-07-23
- Secured the downloaded Google OAuth credentials file so it can never be committed to git
- Fixed production emails linking to `localhost` instead of the live Vercel site
- Replaced the blocking browser "confirm" popup on all admin delete buttons with a proper non-blocking themed modal
- Fixed a ~300ms-per-keystroke lag in the admin delete-user confirm modal (isolated its input state so typing no longer re-renders the whole user table)
- Fixed proctor termination taking a long time (was blocking navigation on the full session-video upload finishing first)
- Fixed a webcam hang and missed violations right at interview start (three ML models were all initializing at once; staggered phone-detection to start a few seconds later)
- Added failure-audit logging for video uploads — a failed upload previously left zero trace anywhere; now logged with the specific reason, same as email failures already were
- Replaced the blocking "confirm" popup on the admin Send Invite button with the same non-blocking modal pattern

## 2026-07-22
- Merged in Saqib's proctoring work: mandatory full-screen-share requirement, GPU-based phone detection (fixed interview hang), admin table pagination, DB indexes + health check
- Added full PWA support: installable app, offline-safe caching (never caches live API data), branded launch splash, update-available prompt
- Deployed the backend to Render and the frontend to Vercel with proper deploy configs
- Pointed the live frontend at the deployed Render backend
- Discovered and fixed broken email delivery — Render blocks outbound SMTP, switched to Gmail API over HTTPS
- Added a "waking up" banner so Render's free-tier cold start (30-50s) doesn't look like a broken app
