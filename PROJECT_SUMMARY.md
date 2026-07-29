# Interviewer.AI — Project Summary

An AI-powered mock interview platform. Candidates take voice-driven technical/HR/behavioral interviews against an LLM interviewer, get AI-transcribed and AI-scored answers, receive a full performance report, and can also analyze their resume against a job description. Admins get a full back-office: user management, platform analytics, revenue tracking, and an LLM-scoring audit dashboard. The live UI is branded **"SMIT Assessment Portal" / "SIT Interviewer[Admin]"**, suggesting this is a bootcamp capstone project.

---

## 1. Tech Stack

### Backend
- **Framework**: FastAPI (ASGI) served via **Uvicorn** — despite the README/Dockerfile still describing this as a Flask app (stale docs, see [§6](#6-known-inconsistencies--technical-debt)).
- **ORM**: Raw SQLAlchemy, wrapped in a hand-rolled `db` shim (`app/database/db.py`) that mimics the Flask-SQLAlchemy API (`db.Model`, `db.Column`, `scoped_session`) so model code reads like a Flask app even though it isn't one.
- **Database**: SQLite for local dev (`interviewer.db`), PostgreSQL in Docker/production (`psycopg2-binary`), auto-created tables on startup (no Alembic migrations).
- **Auth**: Hand-rolled JWT (`pyjwt`) — 12-hour access tokens, 7-day refresh tokens, `bcrypt` password hashing.
- **AI providers**: OpenAI-compatible chat completion APIs — **Groq** (default), Together AI, OpenAI, or OpenRouter — for the LLM, plus **Groq/OpenAI Whisper** for speech-to-text. All AI calls are optional: an `AI_MODE=mock` switch runs the entire platform on deterministic, hand-authored fallback logic with zero API keys.
- **File handling**: `pypdf` (resume parsing), `pydub` + FFmpeg (audio transcoding), Supabase Storage REST API for profile pictures (falls back to Base64 data URIs if unconfigured).
- **Other**: `python-dotenv`, `pydantic`, `python-multipart`, `gunicorn` (prod process manager).

### Frontend
- **React 19** + **Vite 8** (dev server / build tool).
- **React Router 7** for client-side routing.
- **Axios** for HTTP, with interceptors for auth-token injection, error-shape normalization, and silent token refresh on 401.
- **Tailwind CSS 4** (CSS-first `@theme` config in `index.css` rather than a classic JS theme file) — custom brand palette ("SMIT Blue" `#0d6db7`, "SMIT Green" `#8dc63f`), dark mode via a `.dark` class, glassmorphism/corporate panel utilities, custom animations.
- **Recharts** for the admin scoring-analytics bar charts.
- **lucide-react** for icons.
- **oxlint** for linting.

### Infrastructure
- `docker-compose.yml` orchestrates 3 services: `db` (Postgres 15), `backend` (FastAPI/Uvicorn), `frontend` (Nginx serving the Vite build).

---

## 2. Backend Functionality

### 2.1 Application Bootstrap (`app/__init__.py`)
- Builds the FastAPI app, enables permissive CORS (`allow_origins=["*"]`), and registers a teardown middleware that closes the DB session after every request.
- Registers 9 routers under `/api/*`: auth, users, tokens, interviews, resume-jd, notifications, feedback, admin, coding.
- Auto-creates all database tables on startup and **seeds a default admin account** (`admin@interviewer.com` / `admin123`) with 999 tokens if one doesn't already exist.
- Exposes `GET /health` for liveness checks.

### 2.2 Configuration (`app/config/config.py`)
Centralizes all environment-driven settings: database URL, JWT secrets/expiry, upload/report folder paths, allowed file extensions (pdf/txt/audio/image, 32MB cap), and a multi-provider AI configuration block that auto-derives the correct API URL and default model name based on `AI_PROVIDER` (Groq/Together/OpenAI/OpenRouter) and `WHISPER_PROVIDER` (Groq/OpenAI only).

### 2.3 Data Model (`app/models/models.py`)
| Model | Purpose |
|---|---|
| **User** | Account record — name, email, password hash, country, experience level, job role, `role` (candidate/admin), ban `status`/`banned_until`, profile picture URL. Owns tokens, interviews, resume/JD analyses, notifications, feedback. |
| **Token** | 1:1 wallet per user — available/consumed/purchased token counts. |
| **Transaction** | Ledger of token movements (signup bonus, purchase, refund, admin adjustment, consumption). |
| **Interview** | A single interview session — type, job role, difficulty, question count, status, overall score, and **proctoring fields** (violation count, failure flag, JSON violation log). |
| **InterviewQuestion** | An individual question within an interview (conceptual/scenario/coding/HR/behavioral). |
| **InterviewResponse** | A candidate's answer to a question — transcript, audio path, duration, per-axis scores (technical/communication/confidence), AI feedback text (flaggable for manual review). |
| **InterviewReport** | The final generated report for a completed interview — all scores, strengths/weaknesses/missing concepts/recommendations, PDF path, and an optional proctoring violation snapshot image. |
| **ResumeAnalysis** | Stored result of an uploaded resume being parsed and scored against known skills. |
| **JdAnalysis** | Stored result of a job description being parsed for requirements/skills. |
| **Notification** | In-app notification feed item (interview/token/activity/recommendation). |
| **Feedback** | User-submitted platform feedback/rating, optionally tied to an interview. |
| **CodeSubmission** | A coding-sandbox run/submission — code, language, per-test-case results, pass count, score. |
| **AdminLog** | Audit trail of admin actions (bans, token overrides, auto-bans, rejected domains). |

### 2.4 API Surface (by router)

**Auth** (`/api/auth`, public)
- `POST /register` — creates account, grants 5 free tokens + welcome notification, returns JWTs.
- `POST /login` — validates credentials, auto-lifts expired bans, returns JWTs + token balance.
- `POST /refresh` — issues a new access token from a refresh token.
- `POST /forgot-password` / `POST /reset-password` — mock OTP flow (hardcoded OTP `123456`, no real email sent).
- `POST /logout` — stateless no-op.

**Users** (`/api/users`, authenticated)
- `GET/PUT /profile` — view/update profile.
- `GET /achievements` — gamification badges + a leaderboard (partly hardcoded/mocked) with the current user ranked in.
- `POST /profile/picture` — uploads avatar via Supabase (or Base64 fallback).

**Tokens** (`/api/tokens`, authenticated)
- `GET /balance`, `POST /purchase` (simulated, no real payment gateway), `GET /transactions`.

**Interviews** (`/api/interviews`, authenticated) — the core feature
- `POST /start` — validates the requested domain is "technical" via the AI domain classifier, deducts 1 token, generates questions (AI or JD-driven or mock bank).
- `GET /history`, `GET /stats/summary`, `GET /{id}/details`.
- `POST /transcribe` — standalone speech-to-text.
- `POST /{id}/submit-answer` — the core pipeline: transcribes audio if needed, scores the answer with the LLM, and once all questions are answered, generates the full AI interview report.
- `GET /{id}/report` — full report + Q&A breakdown.
- `POST /evaluate-code` — ad-hoc code execution + AI code review (separate from the coding sandbox module).
- `POST /{id}/proctor-log` — logs an integrity violation; auto-terminates the interview after 3+ violations and auto-bans the user (until end of day) after 3 terminated interviews.
- `POST /{id}/fail-proctoring` — manual force-fail for integrity violations.

**Resume & JD** (`/api/resume-jd`, authenticated)
- `POST /analyze-resume` — parses an uploaded PDF/TXT resume, validates it looks like a real resume, and scores it.
- `POST /analyze-jd` — extracts requirements/skills from pasted JD text.
- `POST /match` — matches resume against JD, returning match %, skill gaps, and 3 tailored interview questions.
- `POST /extract-file-text` — generic file → text extraction utility.

**Coding Sandbox** (`/api/coding`, **admin-only**) — a soft-launched feature not yet exposed to regular candidates
- `GET /problems`, `GET /problems/{id}` — problem bank (**18** LeetCode-style problems: 10 Easy, 6 Medium, 2 Hard; 106 test cases). Every problem's expected values are verified against a reference solution in `backend/tests/test_problem_bank.py`.
- `POST /run` — executes code against visible sample tests only.
- `POST /submit` — executes against sample + hidden tests, persists a `CodeSubmission`.

**Admin** (`/api/admin`, admin-only)
- `GET /stats` — platform dashboard: user/interview counts, revenue, token totals, recent feedback/logs.
- `GET /users`, `POST /users/{id}/ban`, `POST /users/{id}/tokens` — user management.
- `GET /interviews`, `GET /transactions`, `GET /feedback`, `GET /logs` — platform-wide listings.
- `GET /scoring/analytics`, `GET /scoring/interviews/{id}` — an **LLM-scoring audit dashboard**: average scores, score-distribution buckets, and a count of answers flagged for manual review, with per-question drill-down.

**Notifications** (`/api/notifications`, authenticated) — list + mark-read (single or all).

**Feedback** (`/api/feedback`, authenticated) — submit a 1–5 rating with free-text comments, optionally tied to an interview.

### 2.5 AI Services (`app/ai/`)

- **`MixtralService`** (name is legacy branding — actual default models are Llama-3.3-70B class via Groq): a single service class providing domain classification, question generation (role-driven or JD-driven), answer evaluation (technical/communication/confidence scoring), full report generation, and resume/JD analysis. Every method has a robust, hand-authored mock fallback so the platform runs fully offline with no API key. Low-confidence or failed evaluations are explicitly flagged `needs_manual_review` rather than silently guessed — never fabricates a score.
- **`WhisperService`**: speech-to-text via Groq (`whisper-large-v3`) or OpenAI (`whisper-1`), with automatic webm/ogg/wav → mp3 conversion. In mock mode returns context-aware canned transcripts; in live mode, raises an error on failure instead of ever fabricating a transcript.

### 2.6 Coding Sandbox Engine (`app/coding/`)
A real, working code-execution engine (`runner.py`): wraps candidate Python/JavaScript code in a generated driver script, executes it via `subprocess` with a per-test timeout to guard against infinite loops, and parses the result through a sentinel marker to separate program stdout from the actual return value. Explicitly documented as a placeholder for a future sandboxed (Docker/Judge0) backend — it currently runs directly on the host with only a timeout guard.

### 2.7 Utilities (`app/utils/`)
- `security.py` — JWT issuance/verification and FastAPI dependency guards (`get_current_user`, `admin_required`).
- `pdf_parser.py` — PDF text extraction via `pypdf`.
- `supabase_service.py` — profile picture upload to Supabase Storage, with a Base64 data-URI fallback.

---

## 3. Frontend Functionality

### 3.1 Routing (`App.jsx`)
Three route tiers, each with its own layout shell:
- **Public** (marketing site): Landing, Features, Technology, Pricing, Contact, Demo, Login, Register, Forgot Password.
- **Candidate** (`ProtectedRoute` + `DashboardLayout`): Dashboard, Start Interview, Interview Setup/Session/Report, Coding Sandbox (UI present but disabled for non-admins, matching the backend's admin-only gate), Resume & JD Match, History, Profile.
- **Admin** (`AdminRoute` + `AdminLayout`): Overview, Manage Users, Interviews, Scoring Analytics, Transactions, Feedback, Logs.

### 3.2 Key Pages
- **Dashboard** — recent interviews + stats summary.
- **InterviewConfig** — configure a new interview (type/role/experience/difficulty, or paste/upload a JD).
- **InterviewSetup / InterviewSession** — pre-flight checks and the live interview UI: question flow, audio recording, real-time transcription, and webcam/tab-switch proctoring/integrity monitoring.
- **ReportDetailPage** — full post-interview report with scores, strengths/weaknesses, recommendations, and a feedback submission form.
- **CodingInterview** — coding sandbox UI (problem list, code editor, run/submit).
- **ResumeJdAnalyzer** — resume upload + JD paste + match scoring.
- **InterviewHistory** — past interviews list.
- **ProfilePage** — profile editing, achievements/leaderboard, token purchase, transaction history, avatar upload.
- **AdminDashboard / AdminUsersPage / AdminInterviewsPage / AdminTransactionsPage / AdminFeedbackPage / AdminLogsPage** — back-office management screens.
- **AdminScoringPage** — LLM-scoring analytics: aggregate score/confidence stats, a Recharts score-distribution bar chart, flagged-answer count, and per-interview drill-down.
- **Public marketing pages** (`pages/public/`) — Features, Technology, Pricing, Contact, Demo, sharing a common hero component.

### 3.3 Shared Components
- **`components/ui/`** — a small design system: Alert, Badge, Button, Card, EmptyState, Input, PageHeader, SearchBar, Spinner, StatCard — all Tailwind-styled with dark-mode variants.
- **`components/layout/`** — BrandLogo, GlowBackground (ambient decorative blobs), ThemeToggle (light/dark switch).
- **Layouts** — `DashboardLayout` (candidate sidebar shell with token balance + notifications), `AdminLayout` (admin sidebar shell with a hard access-restriction screen for non-admins), `PublicLayout` (marketing navbar/footer shell).

### 3.4 State & Services
- **`AuthContext`** — manages the logged-in user, token balance, and notifications; handles login/register/logout and localStorage-based JWT persistence.
- **`ThemeContext`** — manages light/dark mode via a `.dark` class on `<html>`.
- **`services/api.js`** — a shared Axios instance that attaches the bearer token to every request, normalizes FastAPI error responses, and silently refreshes an expired access token on a 401 before retrying the original request (redirecting to `/login` if refresh also fails).

---

## 4. Core User Flows

1. **Sign up → free tokens** — registering grants 5 free tokens and a welcome notification.
2. **Start an interview** — pick a role/type/difficulty (or paste a JD); the AI validates the domain, deducts a token, and generates a tailored question set.
3. **Take the interview** — answer by voice; each response is transcribed, scored on technical/communication/confidence axes, and the session is monitored for proctoring violations (auto-terminates after repeated violations, can lead to an account ban).
4. **Get a report** — once all questions are answered, an AI-generated report scores the full session and surfaces strengths, weaknesses, and recommendations.
5. **Resume/JD matching** — upload a resume and/or paste a JD to get a skill-gap analysis and tailored practice questions.
6. **Admin oversight** — admins manage users (ban/unban, token overrides), monitor platform-wide activity/revenue, and audit AI scoring quality (including manually-flagged low-confidence evaluations).

---

## 5. Design Themes Worth Noting

- **Mock-first AI design**: every AI touchpoint (questions, scoring, reports, resume/JD analysis, transcription) has a deterministic, hand-authored fallback, so the entire platform is demoable with zero API keys via `AI_MODE=mock`.
- **Multi-provider LLM abstraction**: one config layer supports Groq/Together/OpenAI/OpenRouter for chat and Groq/OpenAI for speech-to-text, with automatic endpoint/model selection.
- **Anti-fabrication safety rails**: the AI services are built to flag or fail rather than silently invent a transcript or score when a live API call fails.
- **Proctoring/integrity system**: violation tracking with escalating consequences, up to automatic account bans.
- **Coding sandbox is feature-complete but soft-launched**: fully working code execution and hidden test cases, deliberately gated to admins only pending integration into the live interview flow.

---

## 6. Known Inconsistencies / Technical Debt

> **Accuracy note (2026-07-28):** parts of this document have drifted from the code. Seven
> specific discrepancies are catalogued as D1–D7 at the top of **`TEST_CASES.md`**, which was
> written against the actual code. The most important: registration also requires
> `cnic`/`course_category`/`course_status`; proctoring terminates on the **4th** violation
> (`> 3`), not the 3rd, and auto-bans for **30 days** after a **single** termination;
> `submit-answer` scores on a **background thread** rather than inline. Two further findings
> (F1: the offline domain keyword list misses job-title forms like "Dentist"; F2: mock
> question generation is **not** deterministic — it calls `random.shuffle`) are pinned by
> tests in `backend/tests/`. Treat `TEST_CASES.md` and the code as authoritative where they
> disagree with this file.

- **README.md and `backend/Dockerfile` still describe a Flask stack** (`Flask-SQLAlchemy`, `gunicorn app:app`), but the codebase has migrated to **FastAPI** (`main.py`, `uvicorn`). The Dockerfile's `CMD` should target `main:app` with a Uvicorn worker class for Gunicorn to serve it correctly.
- No formal DB migration tool (tables are created via `create_all` on startup) — schema changes require manual care in production.
- The coding-sandbox execution engine runs directly on the host with only a timeout guard (no memory/process isolation) — intended as a placeholder for a future Docker/Judge0-based sandbox.
