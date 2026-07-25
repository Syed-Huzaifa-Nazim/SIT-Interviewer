# Development Log

Running day-by-day record of what changed on this project. Newest day on top. One line per
change — see git log / commit messages for full detail on any entry.

---

## 2026-07-25
- Root-caused a persistent Railway healthcheck failure to a stale start command saved on the service (`--port $PORT` run without a shell, so `$PORT` was passed as a literal string); fixed by starting via `python main.py`, which reads `PORT` from the environment in-process instead
- Pointed the live frontend at the new Railway backend URL and verified the full chain live: login, JWT auth, admin routes, and CORS from the Vercel origin all confirmed working end-to-end

## 2026-07-24
- Migrated the backend off Render (delay-prone free tier) to Railway — removed `render.yaml`, added `backend/railway.toml`
- Fixed the backend Dockerfile: it still targeted the old Flask app (`gunicorn app:app`, hardcoded port 5000) from before the FastAPI migration, so it could never have actually run
- Removed the unused `openai` package from `requirements.txt` (nothing in the codebase imports it — all AI calls go through raw `requests`)
- Slimmed the Docker image (~1GB to ~200MB) by dropping `ffmpeg`/`build-essential` — nothing compiles from source, and Whisper transcription already accepts raw webm without local conversion
- Switched the Docker `CMD` to exec form so the server receives shutdown signals directly for clean restarts
- Added DB connection timeout + keepalives so an unreachable database fails fast with a clear log instead of hanging the whole startup silently

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
