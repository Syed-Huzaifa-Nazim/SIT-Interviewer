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
- **Proctoring (client-side):** MediaPipe FaceMesh (+ iris/refineLandmarks) + MediaPipe Hands + TensorFlow.js COCO-SSD (phone detection) + `@vladmandic/face-api` (identity verification), all loaded from CDN.
- **Storage:** Supabase Storage (private buckets). Refs stored as `supabase://bucket/path`, served to admin via short-lived signed URLs.
- **Git:** GitHub repo `SyedHuzaifaNazim/Interviewer.ai`. Working branch: `saqib-colab`. Main: `main`.

## 2. Standing Rules (IMPORTANT — always follow)
- **Do NOT push to GitHub until the user explicitly says so.**
- **Do ONLY what the user asks — no self-initiated extra features/refactors.** If something extra seems useful, mention it and ask first.
- **Communicate in Roman Urdu.**
- **Never add a new library without asking first.** Tell the user what it is and why, get approval, then implement.
- **Nothing may slow down or crash the live backend** (FastAPI on Render) — it is deployed from `main`.
- **The interview must never hang.** Heavy ML work belongs on the pre-interview gate or deferred, never at interview start.
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

### Identity verification (added 2026-07-24)
- **New pre-interview step**, after the device check and before "Begin Interview"
  (`OfficialInterviewStart.jsx`, stage `identity_check`): captures ONE photo of the candidate
  and turns it into a 128-d face descriptor — the session **baseline**.
- **Library:** `@vladmandic/face-api` @1.7.15 from jsdelivr (approved by the user). Models:
  `tiny_face_detector` (193KB) + `face_landmark_68` (357KB) + `face_recognition` (6.4MB).
  All CDN paths and file sizes were verified before use — note this fork ships **single
  `.bin` files, NOT sharded `-shard1` weights** (the sharded paths 404).
- **Why a separate model:** MediaPipe FaceMesh only returns face *geometry* — it can locate a
  face but can never say *who* it is. Identity needs an embedding model.
- **Hang safety:** library + all models download on the pre-interview gate (a static screen
  with a spinner), never during the interview. In-interview re-checks run once every 30s
  (`IDENTITY_CHECK_INTERVAL_MS`) as a single small inference, so the session cost is ~zero.
- **Monitoring:** every 30s the webcam descriptor is compared with the baseline. Distance
  above `IDENTITY_MATCH_THRESHOLD` (0.6) counts a mismatch; `IDENTITY_MISMATCH_STRIKES` (2)
  consecutive mismatches hard-terminate. "No face found" is NOT a mismatch (that is already
  the NO_FACE violation) so an honest candidate looking away is never terminated.
- **Termination is NOT a violation:** `POST /interviews/{id}/identity-failed` terminates the
  interview, leaves `proctor_violations_count` untouched, sets
  `terminated_reason='identity_mismatch'`, archives an `identity` snapshot of the mismatching
  frame, and writes an **`IDENTITY_VERIFICATION_FAILED` AdminLog** carrying candidate email +
  interview id + timestamp, so the admin can see exactly why the session ended.
- **Refresh-proof:** the baseline descriptor is mirrored into `sessionStorage`
  (`frontend/src/services/identityCheck.js`) — otherwise reloading the page would silently
  switch identity monitoring off and hand the candidate an easy bypass.
- **NOTE — enrolled photos do not exist.** Of 9 candidates only 1 has a `profile_pic_url`, and
  `RegisterPage.jsx` captures no photo at signup, so "match against the enrolled photo" was
  not buildable. The baseline is therefore captured at the start of each session instead.

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

### Open decisions from 2026-07-24 (need the user's call)
- **If the face-api CDN is unreachable**, the candidate currently cannot pass the identity
  check (Retry only, no bypass) and therefore cannot start their one-time interview. Chosen
  deliberately — a visible "skip" button would defeat the feature — but it is an operational
  risk worth a decision.
- **No ban on identity failure.** A proctoring termination triggers a 30-day auto-ban;
  identity failure currently does not (it was not requested, and face matching can produce
  false positives). Say the word if it should ban too.
- **Threshold tuning:** `IDENTITY_MATCH_THRESHOLD` (0.6) and `IDENTITY_MISMATCH_STRIKES` (2)
  live in `frontend/src/services/identityCheck.js` — raise the threshold if honest candidates
  are ever wrongly flagged.

- **User to test on real machine (needs webcam + screen):** eye detection (~1s → count), hang gone, warnings visible, snapshots on all 4 violations appearing in admin "Proctor Snapshots" tab (webcam + screen). During testing keep violations ~3s apart (cooldown).
- After user confirms → commit each logical change separately (clean English messages, NO AI co-author) and push when told.
- Possible tuning knobs if user asks: `GAZE_AWAY_MS`, gaze bounds, `VIOLATION_COOLDOWN_MS`, COCO scan interval / base model.

## 8. Daily Log
### 2026-07-25
- **New animated landing page APPLIED** to the real frontend (light corporate + SMIT
  blue/green, interviewer.ai-inspired; hero live product console + lower-half live visuals:
  radar, scoring ring, proctor chips/strikes, filmstrip, admin-log ticker, interactive
  walkthrough, count-up stats, blur-in scroll reveals).
  - `frontend/src/pages/landingContent.js` (new) — `LANDING_CSS`+`LANDING_HTML`, ALL selectors
    scoped under `.lp` so nothing leaks app-wide; dark mode via `html.dark .lp` (global theme).
  - `frontend/src/pages/LandingPage.jsx` — PublicLayout kept (shared nav/footer); one useEffect
    drives all animations with cleanup; `a[data-route]` clicks routed via React Router; old
    Three.js NeuralHero import removed (lighter bundle).
  - Verified: `vite build` clean, oxlint clean, dev server returns 200. Not committed/pushed.

### 2026-07-24
- **Interview-start hang:** deferred the COCO-SSD phone model by 5s (it is the heaviest —
  weights download + expensive warm-up) so it no longer competes with FaceMesh/Hands at t=0.
  Phone inference also moved back to the **CPU** backend per the user's request (WebGL
  reverted). Face/gaze/hands proctoring still starts immediately.
- **Identity verification** built end-to-end (see §4). Approach was confirmed with the user
  first; the enrolled-photo blocker was found by querying the real DB (only 1 of 9 candidates
  has a photo) — so the baseline is captured per session instead.
- **Snapshot cascade-delete bug FIXED** (`admin_routes.py`). Two independent causes:
  1. `_collect_user_storage_refs()` never queried `ProctorSnapshot`, so the bucket files were
     never collected for deletion;
  2. `ProctorSnapshot.user_id` is `ON DELETE SET NULL` with no ORM cascade, so the DB rows
     survived as orphans with a nulled user_id.
  Both fixed, plus the same gap in `delete_interview`. **Tested end-to-end against the real
  DB + Supabase: dummy candidate → snapshot uploaded → delete → row gone, bucket file gone.**
  Watch out: `db.or_` does NOT exist on this project's custom `db` class — import `or_` from
  `sqlalchemy` directly (using `db.or_` would have crashed the backend).
- **Camera-off toggle FIXED** (`InterviewSession.jsx`). Turning the camera off was a full
  proctoring bypass: every detection loop is gated on `cameraOn`, so switching it off disabled
  face, gaze, hands, phone AND identity checks for the rest of the session. The camera can no
  longer be turned off — the attempt is refused and counted immediately as a `CAMERA_OFF`
  violation through the existing flow (snapshot + strike + the same 4-strike termination).
- **Duplicate snapshot FIXED.** The 4th (terminating) violation produced THREE rows — client
  webcam + client screen + a server-side `kind='termination'` copy — so 4 violations wrote 9
  snapshots instead of 8. Removed the server-side duplicate in
  `mark_interview_as_failed_proctoring`; the report's inline `snapshot_image` (which powers the
  Compliance Audit card) is unaffected. Now exactly 1 webcam + 1 screen per violation.
- Verified: backend imports clean, frontend builds clean, oxlint shows no new warnings.
- **Not committed / not pushed** — awaiting the user's go-ahead.

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

---

## 9. Additional Completed Work — `huzaifa` branch (reconciled 2026-07-20)

> Added during a §7 status reconciliation: the sections above were written from the
> `saqib-colab` side and did not yet reflect the work completed on the `huzaifa` branch.
> Everything below is done, tested, and merged into `huzaifa` (which now also contains all
> of the `saqib-colab` proctoring/snapshot work via a clean merge).

### Database — Supabase/PostgreSQL migration (no local storage anywhere)
- **SQLite fully removed.** `DATABASE_URL` is mandatory; the app fails fast on a missing or
  `sqlite://` URL (`backend/app/database/db.py`). No local/file persistence in any
  environment, including dev.
- **Live data moved to Supabase-hosted Postgres.** One-shot migration
  (`backend/scripts/migrate_to_supabase.py`) copied all 15 tables preserving IDs and
  uploaded 49 legacy local audio files into the `interview-audio` bucket. Verified row-for-row.
- **App connects via the Supabase _transaction_ pooler (port 6543)**, not the session pooler
  (5432) — the session pooler's 15-client cap was exhausting connections. Session-pooler
  string kept in `.env` (commented) for pgAdmin / migration scripts.
- **Connection-leak fix:** FastAPI runs sync endpoints in worker threads, but the DB-session
  cleanup ran on the event-loop thread → leaked a connection per request → pool died after
  ~5 calls. Fixed with request-scoped sessions (contextvar propagated into the worker thread)
  so `db.session.remove()` closes the exact session the query used. Verified 70/70 sequential
  requests + concurrent burst with zero pool errors.

### Session video recording + storage
- Full-session 480p video-only WebM recorded client-side from the proctoring stream, uploaded
  to the **private** `interview-recordings` bucket; admin plays it back via short-lived signed
  URLs in the report's Compliance tab. Failed upload leaves `video_path` NULL (no phantom
  recording shown).

### Storage-aware cascade deletion + retained-anonymized logs
- Deleting a user removes their DB rows in one transaction **and** every Supabase Storage
  object (answer audio, session video, profile picture); cleanup failures are logged as
  `STORAGE_CLEANUP_NEEDED` admin rows. Email/admin logs are **retained but anonymized**
  (`[deleted-user]`), not deleted. Verified 24/24 against the real buckets.

### Recording lifecycle audit + retention
- `RecordingLog` model tracks every recording (per-answer audio + full-session video) from
  creation to deletion; a background worker auto-purges recordings past a 20-day window from
  Supabase Storage and clears the dead pointer so playback UI stops offering it. Admin gets a
  Recordings tab (list + delete).

### Async scoring + coding-question formats (earlier huzaifa work)
- LLM scoring decoupled from question progression: answers are stored and the candidate
  advances instantly while scoring runs on a background thread; the report shows a
  "scoring in progress" state and finalizes atomically. Four coding-question formats
  (scenario / logic / concept / debug) added to live generation.

### Public site redesign
- Three.js hero on the Home page, new About page, and polished Features / Technology /
  Pricing / Contact pages; navbar and hero layout fixes.

### PWA (in progress — this task)
- `vite-plugin-pwa` (Workbox): installable app, precached shell, **network-only `/api`**,
  cross-origin ML-model CDN bypassed, prompt-to-refresh update flow, branded standalone-only
  launch splash. Full analysis + reliability constraints documented separately.

### Ops notes discovered on the `huzaifa` machine
- The `py` launcher here defaults to a **broken free-threaded Python 3.13t** build (corrupt
  `pydantic_core`). Use **`py -3.13`** (regular 3.13) to run backend scripts on this machine.
