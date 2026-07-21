# Interviewer.AI — Project Status & Progress Log

> **Purpose of this file:** This is the single source of truth for where the project
> stands. Read this FIRST before starting any new task — it tells you what is already
> done, what tech was used, what problems came up and how they were solved, what is
> committed vs pending, and where to pick up next. **Update it at the end of every
> working day** (add a dated entry under "Daily Log" + update the relevant sections).

---

## 1. Project Overview
AI-powered mock + official proctored interview platform.
- **Frontend:** React 19 + Vite + Tailwind CSS 4 + React Router 7 + Axios + Recharts + lucide-react (lint: oxlint)
- **Backend:** FastAPI + SQLAlchemy + Uvicorn + PyJWT + bcrypt + pypdf + pydub
- **DB:** PostgreSQL / Supabase (prod). **No SQLite fallback** (removed) — `DATABASE_URL` must be set.
- **AI:** Mixtral (LLM scoring) + Whisper (STT). Modes: mock / api.
- **Proctoring (client-side):** MediaPipe FaceMesh (+ iris/refineLandmarks) + MediaPipe Hands + TensorFlow.js COCO-SSD (phone detection), all loaded from CDN.
- **Storage:** Supabase Storage (private buckets). Refs stored as `supabase://bucket/path`, served to admin via short-lived signed URLs.
- **Git:** GitHub repo `SyedHuzaifaNazim/Interviewer.ai`. Working branch: `saqib-colab`. Main: `main`.

## 2. Standing Rules (IMPORTANT — always follow)
- **Do NOT push to GitHub until the user explicitly says so.**
- **Do ONLY what the user asks — no self-initiated extra features/refactors.** If something extra seems useful, mention it and ask first.
- **Communicate in Roman Urdu.**
- Ask before any big/ambiguous work; don't ask about deleting features during merges.
- Commit messages must NOT contain any AI/Claude co-author line (user wants history to look team-authored). Author identity is `SAQIBKHAN1020`.

## 3. Environment / Setup Notes
- **Two Python installs on the machine:** default `python` = Windows Store Python (deps installed here); Anaconda at `/c/Users/Texon/anaconda3/python`. Use default `python` for this project.
- **Run backend:** `cd backend && python main.py` (Uvicorn).
- **Run frontend:** `cd frontend && npm run dev`.
- **Verify backend loads:** `python -c "from app import create_app; create_app(); print('OK')"`.
- **Verify frontend builds:** `npx vite build`.
- **Auto-schema:** new tables are created by `create_all` on startup; missing columns added by `app/database/migrate.py` `ensure_schema()`.
- **Supabase buckets (all private except profile-pictures):**
  - `profile-pictures` (public) — avatars
  - `interview-audio` — per-answer voice recordings
  - `interview-recordings` — full-session videos
  - `proctor-snapshots` — proctoring images (webcam + screen), foldered `user_<id>/<date>/`. **Created via API on 2026-07-21.**
- Supabase credentials are configured in the backend env (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`).
- `getDisplayMedia` (screen share) requires HTTPS or localhost.

## 4. Completed Features (with key files)

### Proctoring — official interview flow
- **Pre-interview gate** `frontend/src/pages/OfficialInterviewStart.jsx`: device check now requires Camera + Mic + **Screen share** (getDisplayMedia) before "Begin Interview" enables. Screen stream handed to session via singleton `frontend/src/services/proctorScreen.js`.
- **Session** `frontend/src/pages/InterviewSession.jsx`:
  - Violations: MULTIPLE_FACES, NO_FACE, LOOK_AWAY (head), GAZE_AWAY (eyes), EYES_NOT_VISIBLE (soft), FULL_FACE (soft), TAB_SWITCH, FOCUS_LOSS, COPY_PASTE, phone, hands.
  - **Eye/gaze detection**: hard violation, ~1s off-screen → counts. Thresholds: `GAZE_AWAY_MS=1000`, bounds `hAvg<0.36||>0.64 || vAvg<0.20||>0.82`.
  - **Global violation cooldown** `VIOLATION_COOLDOWN_MS=3000`: at most 1 counted violation per 3s across ALL types (prevents lag-spike from stacking 2-3 strikes → instant termination).
  - Termination = 4 violations (backend: count > 3).
  - **Warning banner**: fixed, top-center, prominent (red hard / amber soft), z-index high, visible in fullscreen.
- **Snapshots**: on EVERY counted violation (1,2,3,4) the client captures a **webcam** frame + a **screen** frame and POSTs to `/interviews/{id}/proctor-snapshot` → archived in `proctor-snapshots` bucket + `ProctorSnapshot` DB row. The 4th (terminating) webcam frame is ALSO archived server-side (`kind='termination'`) and set on the report for the admin review card.
- **Admin viewing** `frontend/src/pages/AdminLogsPage.jsx`: new **"Proctor Snapshots"** tab — list (candidate, interview, type, context) with per-image lazy signed-URL "View" + delete.

### Backend proctoring/snapshot infra
- `backend/app/models/models.py`: `ProctorSnapshot` model (user_id, candidate_email, interview_id, kind ['termination'/'screen'/'webcam'], label, storage_ref, captured_at).
- `backend/app/config/config.py`: `SUPABASE_SNAPSHOT_BUCKET='proctor-snapshots'`.
- `backend/app/utils/supabase_service.py`: `upload_proctor_image(user_id, interview_id, kind, bytes)` → `user_<id>/<date>/<kind>_int_<id>_<ms>.jpg`.
- `backend/app/routes/interview_routes.py`: `archive_proctor_snapshot()` helper; `POST /{id}/proctor-snapshot` (accepts kind screen/webcam; does NOT reject just-completed interview so the terminating frame is kept); termination hook in `mark_interview_as_failed_proctoring`.
- `backend/app/routes/admin_routes.py`: `GET /proctor-snapshots`, `GET /proctor-snapshots/{id}/url` (signed), `DELETE /proctor-snapshots/{id}` (deletes storage + row).

### Recordings (video) — pre-existing + fixed
- Full-session video recorded client-side, uploaded to `interview-recordings` (`Interview.video_path`).
- Admin playback: `ReportDetailPage.jsx` shows the video player **below the compliance snapshot** (Compliance Audit tab), lazy signed URL via `GET /admin/interviews/{id}/video-url`.
- **RecordingLog** audit + 20-day auto-delete worker (`interview_routes.py`). Video uploads now also create a RecordingLog row (previously missing → empty Recordings tab; fixed).

### Auth / UX
- **Login** `LoginPage.jsx`: strips spaces from identifier + password (avoids false "invalid credentials"). CNIC auto-dash. Gmail-only enrollment note.
- **OfficialThankYou.jsx**: after interview completion, Back button → hard-redirect to `/login` (traps back so the one-time interview can't resume).
- One-time (OTP) candidates: locked to official flow, no dashboard; forced logout after interview.

## 5. Problems Faced & How Resolved
- **Interview UI hang (severe):** 3 heavy ML models on main thread (FaceMesh+iris+Hands at 16fps + COCO mobilenet_v2 at 280ms). **Fix:** face loop → 5fps (200ms), Hands every 3rd frame, COCO → `lite_mobilenet_v2` at 700ms.
- **Lag spike caused 2-3 violations at once → instant termination.** **Fix:** global `VIOLATION_COOLDOWN_MS=3000` gating all hard violations.
- **Eye detection "not working":** it was soft + 5s threshold, rarely fired, and hang stopped the loop. **Fix:** hard violation, 1s threshold, more sensitive bounds; hang fix made the loop run smoothly.
- **Snapshots not saving:** `proctor-snapshots` bucket didn't exist yet (created it), AND the screen-capture effect ran on mount before the hidden `<video>` was in the DOM. **Fix:** created bucket; effect re-runs on `questions.length` with a guard.
- **Warning showed faintly:** it was inline in document flow and scrolled off. **Fix:** fixed top-center banner, high z-index.
- **Snapshot timing confusion (user iterated):** final requirement = snapshot on EVERY violation (1,2,3,4) saved to DB (webcam + screen).
- **Commit history had Claude co-author line:** removed via soft-reset re-commit + `git push --force-with-lease` (author was already `SAQIBKHAN1020`).
- **Merge conflicts from `origin/huzaifa`** (video recording feature): resolved keeping BOTH sides' features (unified `completion_snapshot` + `video_path`; kept both `delete_interview_audio` and `upload_interview_video`/`get_signed_url`).
- **`ModuleNotFoundError: sqlalchemy`:** default `python` is Windows Store Python — installed requirements there.

## 6. Git State (as of 2026-07-21)
- **Committed & pushed** (branch `saqib-colab`): video player below snapshot (`ce445dd`), recording-log fix for videos (`df71e49`). History cleaned of AI co-author line (force-pushed).
- **UNCOMMITTED (local only, awaiting user's OK to commit/push):**
  - `LoginPage.jsx` (space strip)
  - `OfficialThankYou.jsx` (back → login)
  - `InterviewSession.jsx` (eye detection, hang fixes, per-violation snapshots, warning banner, screen capture)
  - `OfficialInterviewStart.jsx` (screen-share grant)
  - `AdminLogsPage.jsx` (Proctor Snapshots tab)
  - `services/proctorScreen.js` (new)
  - Backend: `models.py`, `models/__init__.py`, `config.py`, `supabase_service.py`, `interview_routes.py`, `admin_routes.py`

## 7. Next Steps / Pending
- **User to test on real machine (needs webcam + screen):** eye detection (~1s → count), hang gone, warnings visible, snapshots on all 4 violations appearing in admin "Proctor Snapshots" tab (webcam + screen). During testing keep violations ~3s apart (cooldown).
- After user confirms → commit each logical change separately (clean English messages, NO AI co-author) and push when told.
- Possible tuning knobs if user asks: `GAZE_AWAY_MS`, gaze bounds, `VIOLATION_COOLDOWN_MS`, COCO scan interval / base model.

## 8. Daily Log
### 2026-07-21
- Moved admin video player below compliance snapshot; fixed video RecordingLog (committed + pushed).
- Removed AI co-author from 2 commits; force-pushed clean history.
- Login page space stripping; OfficialThankYou Back → login.
- Eye/gaze detection made a direct-counting violation (1s); tuned bounds.
- Built screen monitoring (screen share in device check) + per-violation snapshot archive (webcam + screen) to new `proctor-snapshots` Supabase bucket (created the bucket, tested upload/sign/delete end-to-end); added admin "Proctor Snapshots" tab.
- Fixed severe interview hang (reduced ML load) + added global violation cooldown to stop instant multi-strike termination.
- Made proctor warning a prominent fixed top banner.
- Iterated snapshot behavior per user → final: snapshot on every violation (1,2,3,4) saved to DB.
- Created this PROJECT_STATUS.md.
