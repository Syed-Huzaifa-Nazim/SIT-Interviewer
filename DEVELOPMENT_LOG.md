# Development Log

Running day-by-day record of what changed on this project. Newest day on top. One line per
change — see git log / commit messages for full detail on any entry.

---

## 2026-08-15
- Added the **Resume-Based Interview** category: the candidate uploads a CV at enrolment instead of picking a domain, and the whole question set is generated from the skills and projects extracted from it. Like Instructor, it carries no course status — rather than adding a second `!= 'completed'` special case, the statusless categories are now a set with a `requires_course_status()` helper, since that guard lives independently in `auth_routes`, `bulk_email_routes` and `admin_routes`
- The CV is parsed at enrolment and never again: `/auth/signup-resume` (public) analyses it and parks the result in a new `pending_resumes` table against a single-use token, which `/register` claims onto the new account. Interview start only reads the stored result, so no model call ever sits on the interview path — same rule the FaceMesh/COCO work established
- Reused `MixtralService.analyze_resume` unchanged: it was already fully JD-free, so the "where does parsing end and JD matching begin" question had no boundary to find. It now also extracts `extracted_projects` as its own list — blended into the experience bullets, projects could not be asked about individually
- Question generation gained a `resume_profile` path beside the existing instructor/JD ones. Each question carries `derived_from`, the resume entry it came from — and the model's claim is verified against the real skills/projects list rather than trusted, so a question that traces to nothing is shown as untraceable instead of looking sourced. That drift is the one failure mode this category has and no other does
- Coding-sandbox opener: already applied to any one-time candidate who is not an Instructor, so this category got it with no change to that condition — only the problem choice moved, matching the resume's own skills since there is no domain to match against
- Admin Hub: dedicated **Resume-Based** tab in Manage Users (split out first, so the three tab counts still cover every account exactly once), a Resume panel on the report showing extracted skills/projects plus the full text, per-question resume traceability, and one-click flagging of a bad parse
- Bulk invites refuse this category — a spreadsheet row cannot carry a CV, so a bulk-invited resume candidate would be an account that could never start an interview
- Re-interview lock needed no new mechanism: the existing `SecondInterviewRequest` trigger depends on CNIC and interview status, not course status. A re-signup now carries the freshly uploaded CV onto the account as a new analysis row, so an approved second attempt uses the resume just submitted rather than a stale one
- Parsing moved to `app/utils/resume_text.py`, shared with the Resume & JD Analyzer, which now calls it too — one pipeline rather than two that drift. The Analyzer keeps its own behaviour: no size cap (it never had one) and no raw-text retention (it has always discarded the document)
- **Verified:** backend `pytest` 276 passed (was 239 — 37 new), same 15 pre-existing `test_problem_bank.py` SQL failures and no others; frontend `vitest` 150 passed across 13 files (was 139/12 — 11 new), `oxlint` clean of errors, `vite build` clean. Every other category's generation path re-checked unchanged — `derived_from` is set on the resume path only
- **Note:** running `create_app()` locally to smoke-test imports ran the boot-time auto-migration against the live Supabase database, adding the six new nullable columns and the empty `pending_resumes` table to production. Additive and nullable, the deployed code does not read them, and `/health` was confirmed healthy — the next deploy would have applied exactly this. Worth knowing that any local `create_app()` reaches production, since the pytest suite has a hard guard against it and ad-hoc scripts do not
- `.vercel/` was committed by accident and removed in the same commit; it is now gitignored, per Vercel's own README that it contains project/org IDs and should not be shared

## 2026-08-12
- Moved MCQ-round generation off the interview-creation request path: `Start Interview` used to wait on both the 5 main questions and the 10 MCQs before responding, now only the main questions are generated synchronously and the MCQ round generates in a background thread, using the several minutes a candidate spends on the intro screen and main questions as cover. `submit_answer` has a synchronous fallback for the rare case a candidate finishes the main round before the background generation lands
- Noted for follow-up: that fallback and the background generator both do a plain row-count check before writing MCQ rows, not the atomic claim `_finalize_report_if_ready` already uses in the same file for the identical class of race — if both ever land on the same interview at once it could double the MCQ rows

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
