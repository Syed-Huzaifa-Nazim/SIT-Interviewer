# Interviewer.AI — Project Summary

> **Last verified:** 2026-08-15, against `huzaifa` @ `b3902e2`. Every claim in this document
> was checked against the running code on that date, not carried forward from an older
> version — see `DEVELOPMENT_LOG.md` for the day-by-day history behind it.

An AI-powered interview platform with two tracks that share the same core engine: **mock
practice interviews** any registered candidate can run on demand, and **official proctored
interviews** that an admin invites completed-course candidates to via one-time credentials.
Candidates take voice-driven technical/HR/behavioral interviews (plus a closing 10-question
MCQ round, and a hands-on coding exercise for course graduates) against an LLM interviewer,
get AI-transcribed and AI-scored answers, and receive a full performance report. Admins get a
full back-office: user management with per-candidate interview deadlines, bulk-invite
cohorts, platform analytics, revenue tracking, session-recording review, and an LLM-scoring
audit dashboard. The live UI is branded **"SMIT Assessment Portal" / "SIT Interviewer
[Admin]"** — a bootcamp capstone project, live at **sit-interviewer.vercel.app** (frontend)
and **interviewerai-production-b311.up.railway.app** (backend).

> The backend moved to a new Railway account on 2026-08-24 when the previous account
> expired. The service's **Root Directory must be `backend`** — the repo is a monorepo, and
> with that unset Railway analyses the repo root, finds no application, and the build fails
> before it starts. That is what happened on the first attempt.

---

## 1. Tech Stack

### Backend
- **Framework**: FastAPI (ASGI) served via **Uvicorn**, single worker process.
- **Every route handler is a plain `def`, not `async def`.** Nothing in the app is
  genuinely asynchronous — synchronous SQLAlchemy, blocking `requests` calls to Supabase
  Storage, `subprocess`-run candidate code, bcrypt, and the LLM/Whisper/SMTP clients all
  block. An `async def` handler runs that work directly on the single event loop and
  serializes the entire backend behind whichever request got there first; `def` handlers are
  dispatched to FastAPI's worker threadpool instead, so requests genuinely overlap. This was
  a deliberate migration (2026-08-11) across all ~89 handlers, guarded by a test
  (`backend/tests/test_route_concurrency.py`) that fails the suite if any handler is
  ever declared `async` again.
- **ORM**: Raw SQLAlchemy, wrapped in a hand-rolled `db` shim (`app/database/db.py`) that
  mimics the Flask-SQLAlchemy API (`db.Model`, `db.Column`, `scoped_session`).
- **Database**: **PostgreSQL only, hosted on Supabase (Singapore region).** No SQLite
  anywhere, including local dev — `db.py` fails fast on a missing or `sqlite://`
  `DATABASE_URL`. Connects via Supabase's **transaction pooler** (port 6543), pool sized
  `pool_size=25, max_overflow=35` (see `db.py` for the incident that drove that number up
  from an earlier `5+5`). No Alembic — `app/database/migrate.py`'s `ensure_schema()` diffs
  each SQLAlchemy model against the live table on boot and adds any missing column with a
  lock-timeout-and-retry loop, so a schema change ships as a normal code change with no
  manual migration step.
- **Auth**: Hand-rolled JWT (`pyjwt`), `bcrypt` password hashing. Two parallel credential
  systems: a normal email+password account, and a one-time OTP login for official-interview
  candidates (`User.must_use_otp`, `otp_hash`, `otp_expires_at` — the deadline an admin sets
  per bulk-invite row).
- **AI providers**: OpenAI-compatible chat completion APIs — Groq (default), Together AI,
  OpenAI, or OpenRouter — for the LLM, plus Groq/OpenAI Whisper for speech-to-text. An
  `AI_MODE=mock` switch runs the entire platform on deterministic, hand-authored fallback
  logic with zero API keys — every AI touchpoint (questions, MCQs, scoring, reports,
  resume/JD analysis, transcription) has one.
- **File handling**: `pypdf` (resume parsing), `pydub` + FFmpeg *not shipped* (Whisper
  accepts raw webm/ogg directly; ffmpeg conversion is best-effort and no-ops if absent —
  the Docker image deliberately omits it to stay small), Supabase Storage REST API for
  profile pictures, session/answer recordings, and proctoring snapshots (private buckets,
  short-lived signed URLs for admin playback).
- **Other**: `python-dotenv`, `pydantic`, `python-multipart`.

### Frontend
- **React 19** + **Vite 8**.
- **React Router 7**, **Axios** (shared instance with auth-token injection, error-shape
  normalization, silent token refresh on 401 — deliberately bypassed with a *raw* axios call
  on the small set of requests that fire after a session-clearing navigation, e.g. the
  post-interview thank-you screen, so a stray 401 there can't hard-redirect the whole tab).
- **Tailwind CSS 4** (CSS-first `@theme` config), dark mode via a `.dark` class.
- **CodeMirror 6** (`@uiw/react-codemirror` + Python/JavaScript/SQL language packages) for
  the coding sandbox editor — syntax highlighting, bracket matching, autocomplete.
  Lazy-loaded (`React.lazy`) behind a thin `CodeEditor` wrapper so its ~550KB chunk is never
  in the entry bundle for anyone who doesn't open a coding question.
- **Recharts** for admin analytics charts. **lucide-react** for icons. **oxlint** for
  linting (not ESLint).
- **vite-plugin-pwa**: installable app, precached shell, network-only `/api`.

### Infrastructure
- **Frontend hosted on Vercel** (project `sit-interviewer`), connected to GitHub for
  auto-deploy on push to `main`. **Vercel refuses to build any deployment whose tip commit's
  author is not a member of the Vercel team** — this bit production twice (2026-08-11,
  2026-08-13) when a merge from a non-team collaborator became `main`'s tip; the standing
  workaround is a small commit under a team member's identity on top before pushing to
  `main`, rather than inviting the collaborator or disabling the restriction (open decision,
  see `PROJECT_STATUS.md`).
- **Backend hosted on Railway** (`railway.toml`, Dockerfile-based build), also auto-deploys
  on push to `main`. `.github/workflows/keep-alive.yml` pings `/health` every 10 minutes so
  the backend never cold-sleeps on Railway's tier — this only fires from commits that have
  reached `main`, since GitHub only evaluates `schedule:` triggers off a repo's default
  branch.
- `.github/workflows/ci.yml` — build/lint/audit on every push to `main`/`huzaifa`/
  `development`/`saqib-colab`, plus PRs into `main`.
- A local `docker-compose.yml` also exists (Postgres + backend + frontend-via-nginx) for
  fully offline dev, independent of the Vercel/Railway/Supabase trio above.

---

## 2. Backend Functionality

### 2.1 Application Bootstrap (`app/__init__.py`)
- Builds the FastAPI app, restricts CORS to `CORS_ORIGINS` (wildcard + a loud `[SECURITY]`
  boot-log warning only when unset). A single `db_session_middleware` stamps a per-request
  session identity *before* `call_next` so it propagates into the worker thread a sync
  handler runs on, and tears it down in a `finally` after.
- Auto-creates tables + runs `ensure_schema()` on startup; seeds/rotates the admin account
  from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (revokes existing sessions on a password rotation).
- Starts two background workers: session-recording assembly (joins uploaded video parts
  server-side, so a candidate's browser finishing an upload is never a dependency for
  playback existing) and recording retention (auto-deletes recordings past 20 days).
- Exposes `GET /health` (checks DB connectivity).

### 2.2 Data Model (`app/models/models.py`) — 18 tables
| Model | Purpose |
|---|---|
| **User** | Account record — includes CNIC (candidate identity), `course_category`/`course_status`, `interview_status` lifecycle, one-time OTP fields (`must_use_otp`, `otp_hash`, `otp_expires_at`), `bulk_batch_id` (which invite batch created this account, if any), `admin_remarks`, ban status. |
| **Token** | 1:1 wallet — available/consumed/purchased. |
| **Transaction** | Ledger of token movements. |
| **Interview** | A session — type, job role, difficulty, `scoring_status` (pending/finalizing/complete, atomically claimed to prevent double-report-generation), proctoring fields, `terminated_reason`, intro-segment video bookmark (`intro_video_start_seconds`/`_end_seconds`, for the admin player's "Jump to Introduction"). |
| **InterviewQuestion** | One question — conceptual/scenario/coding formats/HR/behavioral, **or `question_type='mcq'`** (the closing 10-question round: `mcq_options` JSON list, `mcq_correct_index` never exposed to the candidate), server-anchored `time_limit_seconds`. |
| **InterviewResponse** | An answer — transcript, audio path, per-axis scores, `scoring_status`. |
| **InterviewReport** | Final report — scores, strengths/weaknesses/recommendations, optional termination snapshot. |
| **ResumeAnalysis** / **JdAnalysis** | Stored resume/JD parse results. |
| **Notification** | In-app feed item — **now carries an optional `link`** (an in-app route path, validated client-side against being an absolute/protocol-relative URL before navigation) so a notification opens the thing it's about instead of leaving the candidate to find it. |
| **Feedback** | Rating + free text, **plus `category_ratings`** (JSON object of up to 6 category keys — questions/ai_interviewer/audio_video/proctoring/platform/coding_sandbox — each 1-5, any subset). Collected from *every* candidate now, not just official-interview ones (see §3). |
| **CodeSubmission** | A coding-sandbox run/submission. |
| **SecondInterviewRequest** | A candidate's request for a re-interview, with an admin approve/reject flow. |
| **EmailLog** | Audit trail of emails sent (invites, clearance, HR handoff). |
| **RecordingLog** | Lifecycle audit for every audio/video recording, backing the 20-day retention worker. |
| **ProctorSnapshot** | Webcam/screen frames archived on each proctoring violation. |
| **AdminLog** | Audit trail of admin actions. |
| **BulkEmailBatch** | One run of the Bulk Email Module — **`batch_name`** (admin-chosen cohort label, e.g. "Spring 2026 Intake", falls back to `subject` for older/unnamed batches) plus send-progress counts. Powers the Manage Users "Bulk Invited" cohort filter chips. |

### 2.3 API Surface (by router) — 11 routers under `/api/*`

**Auth** (`/api/auth`) — register, login (password or one-time OTP), refresh, forgot/reset
password (real emailed random code, bcrypt-hashed, 15-minute expiry — not the old hardcoded
mock OTP), logout.

**Users** (`/api/users`) — profile, achievements/leaderboard, avatar upload, online-presence
heartbeat.

**Tokens** (`/api/tokens`) — balance, purchase (simulated), transactions.

**Interviews** (`/api/interviews`) — the core feature:
- `POST /start` — generates the 5 main questions synchronously; the **MCQ round generates in
  a background thread** (the candidate has several minutes of intro + main questions as
  cover; `get_interview_details` self-heals and `submit_answer`'s completion check compares
  against an *expected* total rather than counting MCQ rows, so a slow/failed background
  generation can never freeze or wrongly early-end the interview — this was a real bug, fixed
  2026-08-15, see `DEVELOPMENT_LOG.md`).
- `POST /{id}/submit-answer` — transcribes, scores (background thread for verbal answers,
  instant deterministic compare for MCQs), finalizes the report once every question is
  resolved.
- `POST /{id}/mark-intro-segment` — records the intro screen's position inside the one
  continuous session recording, for the admin "Jump to Introduction" player control.
- `POST /{id}/proctor-log`, `/identity-failed`, `/fail-proctoring` — violation tracking,
  identity-mismatch hard-termination, manual force-fail.
- Video upload endpoints (`/upload-video-part`, `/finalize-video`) — incremental, so an
  abrupt disconnect never loses the whole recording.

**Resume & JD** (`/api/resume-jd`) — resume parse+score, JD parse, resume↔JD match with
tailored practice questions.

**Coding Sandbox** (`/api/coding`) — problem bank (18 problems, SQL problems execute against
an in-memory SQLite dataset, everything else through a `subprocess`-isolated runner with a
per-test timeout). `GET /problems`, `/run`, `/submit` are admin-only practice tools;
`GET /interview-problem/{id}`, `/interview-run`, `/interview-submit` are **candidate-facing**
— completed-course candidates open their interview on a hands-on coding exercise instead of
a verbal Question 1 (sandbox-first flow).

**Admin** (`/api/admin`) — user management (list/detail/ban/token-override/edit,
per-candidate `otp_expires_at` deadline visible and cleared on re-invite), platform stats,
interviews/transactions/feedback/logs listings, scoring-analytics audit dashboard,
bulk-email batch history.

**Bulk Email** (`/api/admin/bulk-email`) — validate + send an invite batch (CSV or manual
rows), optional cohort name, per-row deadline, live send-progress polling.

**Notifications** (`/api/notifications`) — list + mark-read.

**Feedback** (`/api/feedback`) — submit rating + optional per-category ratings, tied to an
interview.

**Candidate** (`/api/candidate`) — one-time official-interview session lifecycle
(`/official-interview/complete` closes the session server-side).

### 2.4 AI Services (`app/ai/`)
- **`MixtralService`**: domain classification, main-question generation, **MCQ generation**
  (always Hard difficulty regardless of the interview's own difficulty — a deliberate
  product decision), answer evaluation, report generation, resume/JD analysis. Every method
  has a deterministic mock fallback. Low-confidence evaluations are flagged
  `needs_manual_review` rather than guessed.
- **`WhisperService`**: speech-to-text via Groq/OpenAI, raises rather than fabricating a
  transcript on failure.

### 2.5 Coding Sandbox Engine (`app/coding/`)
`runner.py` wraps candidate Python/JavaScript in a generated driver, executes via
`subprocess` with a per-test timeout (guards infinite loops; no memory/process isolation
beyond that — a documented placeholder for a future Docker/Judge0 sandbox). SQL problems run
against an isolated in-memory SQLite dataset seeded per test case. Both paths return
`runtime_ms` and captured `stdout` per test, now surfaced in the candidate-facing UI.

---

## 3. Frontend Functionality

### 3.1 Routing (`App.jsx`)
Three tiers: **Public** (marketing), **Candidate** (`DashboardLayout`), **Admin**
(`AdminLayout`, hard-blocked for non-admins). A one-time official-interview candidate is
routed to `OfficialThankYou` instead of the normal report page on completion.

### 3.2 Key Pages (post-2026-08 redesign)
- **DashboardLayout** — candidate shell. Sidebar nav items are hoisted to module scope and
  memoized (`NavLink`), fixing an INP regression Vercel flagged: URL-driven state (search
  text, active tab) on `/history` and `/admin/users` was re-rendering the whole layout on
  every keystroke, which previously remounted the sidebar and replayed its active-item
  animation.
- **NotificationsMenu** (`components/layout/`) — every row is clickable, navigating to the
  notification's stored `link` or a type-based fallback route; relative timestamps
  (`utils/datetime.js`) with the exact moment on hover; closes on outside-click/Escape.
- **InterviewHistory** ("Mock Assessment History") — rebuilt on the shared admin page
  furniture (`AdminPageHeader`/`AdminSearch`/`StatGrid`/`AdminEmpty`) rather than one-off
  candidate widgets, with session-count/completed/average/best stat cards.
- **ProfilePage** — same shared header treatment; added an "Account Activity" card
  (member-since / last-active / profile-updated, relative + exact-on-hover) where the page
  previously carried no time information beyond a bare transaction date.
- **InterviewSession** — question flow, incremental video upload, MCQ round UI (renders once
  the background-generated rows land, polling `GET /interviews/{id}/details` if it runs off
  the end of what it loaded at start), intro-segment bookmark capture, full proctoring
  (MediaPipe FaceMesh/Hands, face-api identity verification, screen-share requirement).
- **InterviewCodingSandbox** / **CodingInterview** — share one `CodeEditor` component
  (CodeMirror 6, lazy-loaded) rather than two independent plain-textarea implementations;
  reset-to-starter, `Ctrl+Enter` to run, per-test runtime + captured stdout shown in the
  console.
- **ReportDetailPage** — report + Q&A, session-recording playback with a "Jump to
  Introduction" control (seeks correctly around the `<video>` `readyState`/`loadedmetadata`
  race that made an early version appear to hang), and a **universal post-interview feedback
  prompt** (categories from §2.2) shown once per interview, gated on a server-computed
  `feedback_submitted` flag rather than client-side state so it survives a refresh or a
  different device.
- **OfficialThankYou** — one-time candidates' terminal screen. Session close (token
  revocation) is now *deferred* until feedback is submitted or skipped — it used to fire on
  mount, which made collecting feedback here structurally impossible since the credential
  was already gone. Closes on submit/skip/Back-button-trap/tab-close(`pagehide` + keepalive
  fetch)/a 5-minute hard timeout, whichever fires first.
- **AdminUsersPage** — Access column shows each candidate's interview deadline
  (`otp_expires_at`, red once past); Bulk Invited tab has per-cohort filter chips built from
  named `BulkEmailBatch` rows.
- **AdminLayout** — same nav-remount/INP fix as the candidate sidebar (`NavItems`/
  `SidebarInner` hoisted to module scope, guarded by
  `frontend/src/layouts/AdminLayout.test.jsx`).

### 3.3 State & Services
- **`AuthContext`** — user, token balance, notifications, login/register/logout.
- **`ThemeContext`** — light/dark via a `.dark` class.
- **`services/api.js`** — shared Axios instance; a "still working" banner (renamed from a
  Render-era "waking up the server" message that no longer applied once the backend moved to
  Railway) fires past a 12s threshold rather than 4s, since several legitimate requests
  (interview creation, final-answer scoring) exceed 4s by design.
- **`utils/datetime.js`** — the one place relative/absolute timestamp formatting lives
  (`timeAgo`, `formatDateTime`, `formatDate`, `formatDuration`), used by notifications,
  history, and profile rather than each page rolling its own `toLocaleDateString()`.

---

## 4. Core User Flows

1. **Sign up → free tokens**, or **admin bulk-invites a cohort** (named batch, per-row
   deadline, one-time OTP credentials emailed).
2. **Start an interview** — 5 main questions generate immediately; a closing 10-question MCQ
   round generates in the background and is normally ready before the candidate reaches it;
   completed-course candidates open on a hands-on coding exercise instead of a verbal
   Question 1.
3. **Take the interview** — voice answers (transcribed, scored technical/communication/
   confidence) or MCQ selects; full proctoring with escalating violations and
   identity-mismatch hard-termination; the intro screen's position is bookmarked inside the
   one continuous session recording.
4. **Finish → feedback → report/thank-you.** Every candidate is asked for a rating plus
   optional per-category scores before the report (enrolled candidates) or before their
   session closes (one-time candidates). A report generates once every question — main and
   MCQ — is resolved.
5. **Resume/JD matching** — skill-gap analysis, tailored practice questions.
6. **Admin oversight** — user management with deadlines and cohorts, platform analytics,
   session-recording review (with the intro bookmark), and an LLM-scoring audit trail.

---

## 5. Design Themes Worth Noting

- **Mock-first AI design**: every AI touchpoint has a deterministic fallback (`AI_MODE=mock`).
- **Anti-fabrication safety rails**: AI services flag or fail rather than invent a score or
  transcript.
- **Background work never blocks a candidate-facing request**: verbal-answer scoring,
  MCQ-round generation, and (as of 2026-08-11) report generation all run off the request
  thread — each of those was, at some point, found blocking a `submit-answer` call and fixed.
- **All backend I/O is threadpool-dispatched, not event-loop-blocking** — the single most
  consequential architectural fix in the project's history (2026-08-11): every route handler
  had been `async def` over synchronous work, serializing the whole backend behind one slow
  request at a time.
- **Proctoring/integrity system**: violation tracking with escalating consequences, identity
  verification, session-recording bookmarks for admin review.
- **Coding sandbox is fully live**, not soft-launched: admin practice tools plus a
  candidate-facing sandbox-first interview flow, sharing one syntax-highlighted editor.

---

## 6. Known Inconsistencies / Technical Debt

- **`README.md` and `backend/Dockerfile`'s comments may still carry Flask-era language** in
  places — verify against `main.py`/`app/__init__.py` (FastAPI/Uvicorn) rather than trusting
  prose describing the stack.
- **No formal DB migration tool.** `ensure_schema()`'s add-only diffing handles new/missing
  columns safely but cannot rename or drop one — a destructive schema change still needs
  hand-written care.
- **Coding-sandbox execution has no memory/process isolation** beyond the per-test timeout —
  documented placeholder for a future Docker/Judge0-based sandbox.
- **`_generate_and_save_mcqs`'s idempotency check is a plain row-count, not the atomic claim
  pattern `_finalize_report_if_ready` uses for the identical class of race** — noted
  2026-08-12, not yet hardened. Low probability in practice (the background call is a single
  LLM request that normally finishes in the many minutes a candidate spends on the main
  round) but worth fixing if it's ever observed to double-write MCQ rows.
- **The Vercel git-author production-deploy block is a standing operational hazard, not
  resolved.** See §1 (Infrastructure) — every merge from a non-team-member collaborator that
  becomes `main`'s tip re-blocks the production build until a team-member commit lands on
  top. `PROJECT_STATUS.md` has the two resolution options that are still pending a decision.
- `TEST_CASES.md` predates several of the changes described here (written 2026-07-28) — treat
  the code, this file, and `DEVELOPMENT_LOG.md` as authoritative over it where they disagree.
