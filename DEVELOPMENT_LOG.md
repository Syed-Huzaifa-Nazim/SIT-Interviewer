# Development Log

Running day-by-day record of what changed on this project. Newest day on top. One line per
change — see git log / commit messages for full detail on any entry.

---

## 2026-08-11
- Converted the remaining ~89 route handlers from `async def` to `def` — they were doing entirely synchronous work (DB queries, Supabase uploads, subprocess-run code execution, bcrypt, LLM calls) while declared `async`, which pins that work to the single uvicorn event loop and serializes the whole backend behind whichever request got there first; now dispatched to FastAPI's worker threadpool so requests actually overlap
- Report generation for the last MCQ answer in an interview moved off the request path into a background thread, matching how verbal-answer scoring has always worked — it was blocking the candidate's final "submit answer" on a live LLM call
- Replaced the coding sandbox's plain textarea with a syntax-highlighted CodeMirror 6 editor (shared between the interview and admin sandboxes), lazy-loaded so it doesn't add to the main bundle for anyone who never opens a coding question
- Merged Saqib's MCQ-round and identity-check-speed work into main
- Reconnected the Vercel project's GitHub integration, which was lost when the project had been deleted and recreated; found that Vercel refuses to build any deployment whose tip commit's author isn't a member of the Vercel team

## 2026-08-10
- Added the pre-interview MCQ round (10 questions, deterministic scoring) and an intro/rules screen shown before questions begin
- Enforced answer timers server-side instead of trusting the client's timed-out flag
- Sped up mid-interview identity re-verification from ~60s to ~4s worst case
- Restructured the coding sandbox into a compact, no-scroll two-column layout
- Fixed camera preview, violation banners, intro replaying on reload, and the violation badge cap found while testing the above

## 2026-08-08
- Migrated the Supabase project from Mumbai to Singapore to cut cross-region query latency
- Fixed the admin shell's sidebar detaching from the page while scrolling, and consolidated the per-column filter icons into the one search-bar filter
- Patched a nanoid dependency advisory that was failing CI

## 2026-08-07
- Closed three admin-account-takeover paths (forgot-password OTP flow, hardcoded JWT fallback secret, seeded admin password left in docs)
- Fixed a boot-time database session leak that was blocking `ALTER TABLE` migrations on deploy
- Moved session-recording assembly server-side instead of relying on the candidate's browser finishing the upload before logout
- Stopped the admin lists issuing one query per row

## 2026-07-29
- Fixed the interview camera freezing: removed phone/object detection (TensorFlow.js + COCO-SSD) from the session — it was an entire extra model whose repeated inference blocked the main thread, and since the video feed renders on that same thread the camera visibly froze each time. Face count, look-away, eye/gaze, hands and identity verification all still run
- Tightened the detection loop and doubled how often hand detection runs, so hand/eye/face warnings fire promptly instead of lagging behind the candidate
- The violation strike count now updates the instant a violation is detected rather than waiting for the cross-region server round trip; the authoritative count still reconciles immediately after, and termination remains server-decided
- Camera recovery now triggers only on genuine device loss reported by the browser (with a grace period for transient blips) — the earlier frame-progress freeze detection was misreading a busy main thread as a dead camera, causing spurious "reconnecting" states and truncating session recordings to a few seconds
- Fixed the 4-strike termination silently never firing: deliberate acts (tab switch, focus loss, copy/paste, blocked shortcuts) were sharing the same 5-second same-type throttle built for continuous conditions like "no face detected" — so four quick tab switches only registered two strikes and the count stalled at 3 forever. Discrete violations now count every time; continuous ones keep their throttle

## 2026-07-28
- Hardened the Admin Hub's session-recording player: an in-player playback failure (e.g. an expired signed URL) now shows a clear error with a one-click retry instead of a silently frozen video

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
