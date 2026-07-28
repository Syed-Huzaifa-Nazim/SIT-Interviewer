# Interviewer.AI — Manual Test-Case Checklist

**Version:** 1.0 (draft — pending review)
**Date:** 2026-07-27
**Scope:** Backend (FastAPI) + Frontend (React 19 / Vite)
**Reference:** `PROJECT_SUMMARY.md`, verified against the current code on branch `saqib-colab`

---

## How to read this document

| Field | Meaning |
|---|---|
| **Test ID** | Stable identifier. Automated tests reference it in a comment (`# covers TC-AUTH-003`). |
| **Priority** | **High** = must pass before any release. **Med** = should pass. **Low** = nice to have. |
| **Pre-conditions** | State that must exist before the steps run. |
| **Expected Result** | The single, observable outcome that decides pass/fail. |

**Environment for all tests:** `AI_MODE=mock`, isolated SQLite test DB (`sqlite:///test_interviewer.db`), no real API keys, no network calls to AI providers. **The dev/production database is never touched.**

> ### ⚠️ Discrepancies found between `PROJECT_SUMMARY.md` and the actual code
> These test cases are written against the **actual code**, not the summary. Please confirm which is authoritative — see [§10 Open Questions](#10-open-questions--please-confirm).
>
> | # | `PROJECT_SUMMARY.md` says | Actual code does |
> |---|---|---|
> | D1 | Register takes name/email/password/country/experience_level | Also **requires** `cnic`, `course_category`, `course_status` |
> | D2 | Register returns JWTs | Only for **Ongoing** candidates. Completed/Instructor get an emailed OTP and **no JWTs** |
> | D3 | Proctoring auto-terminates after **3+** violations | Terminates when count **> 3**, i.e. on the **4th** violation |
> | D4 | Auto-ban after **3** terminated interviews, **until end of day** | Auto-ban after **1** termination, for **30 days** (`PROCTOR_BAN_DAYS = 30`) |
> | D5 | `submit-answer` scores + generates report inline | Scoring/report run on a **background thread**; the endpoint returns `scoring_status: 'processing'` immediately |
> | D6 | Login by email | Login by **email OR CNIC**; one-time OTP accounts are **single-use** |
> | D7 | Endpoint list | Summary omits `proctor-snapshot`, `identity-failed`, `/api/candidate/*`, admin cascade-delete, re-interview approvals, email/recording logs |

---

## 1. Auth (`/api/auth`)

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-AUTH-001 | Ongoing candidate registers successfully | `ONGOING_CATEGORY_ENABLED=true`; CNIC + email unused | POST `/register` with name, email, password (≥6), valid CNIC, category, `course_status=ongoing` | 200; `status='ongoing_registered'`; `access_token` + `refresh_token` returned; user role `candidate` | High |
| TC-AUTH-002 | Registration grants exactly 5 free tokens | TC-AUTH-001 done | Read `Token` row for the new user | `tokens_available=5`, `tokens_consumed=0`, `tokens_purchased=0` | High |
| TC-AUTH-003 | Registration creates a welcome notification | TC-AUTH-001 done | Read `Notification` rows for the user | Exactly one notification, `type='token'`, title contains "Welcome" | High |
| TC-AUTH-004 | Registration writes a signup-bonus ledger entry | TC-AUTH-001 done | Read `Transaction` rows for the user | One row, `transaction_type='signup_bonus'`, `tokens_added=5`, `amount=0.0` | High |
| TC-AUTH-005 | Register rejects a malformed email | — | POST `/register` with `email='not-an-email'` | 400, detail "Invalid email format"; no user created | High |
| TC-AUTH-006 | Register rejects a missing/invalid CNIC | — | POST `/register` with `cnic` omitted or `'123'` | 400, detail mentions a valid CNIC is required | High |
| TC-AUTH-007 | Register rejects an unknown course category | — | POST `/register` with `course_category='Astrology'` | 400, "Please select a valid category" | Med |
| TC-AUTH-008 | Register rejects a short password (Ongoing only) | `course_status=ongoing` | POST `/register` with `password='123'` | 400, "Password must be at least 6 characters long" | High |
| TC-AUTH-009 | Duplicate email is rejected | A user with that email exists | POST `/register` with the same email, a **different** CNIC | 409, "Account with this email already exists" | High |
| TC-AUTH-010 | Duplicate CNIC (no completed interview) is rejected | User exists with `interview_status='not_interviewed'` | POST `/register` with the same CNIC | 409, "An account with this CNIC already exists" | High |
| TC-AUTH-011 | Ongoing signup blocked when the feature flag is off | `ONGOING_CATEGORY_ENABLED=false` | POST `/register` with `course_status=ongoing` | 400, message mentions "coming soon"; no user created | Med |
| TC-AUTH-012 | Completed-course signup issues an OTP, not JWTs | — | POST `/register` with `course_status=completed` | 200; `status='completed_pending_login'`; **no** `access_token`; user has `must_use_otp=True`, `interview_status='invited'` | High |
| TC-AUTH-013 | Instructor signup ignores course_status | — | POST `/register` with the instructor category, no `course_status` | 200; `status='instructor_pending_login'`; `must_use_otp=True` | Med |
| TC-AUTH-014 | Re-signup after a completed interview queues admin approval | User has `interview_status='interview_completed'` | POST `/register` with the same CNIC | 200; `status='reinterview_pending'`; a `SecondInterviewRequest` row created; admins notified | High |
| TC-AUTH-015 | Duplicate re-interview request is not queued twice | A pending `SecondInterviewRequest` exists | POST `/register` again with the same CNIC | 200; message says already awaiting approval; **still only one** request row | Med |
| TC-AUTH-016 | Login with valid email + password | TC-AUTH-001 done | POST `/login` with email + password | 200; `access_token` **and** `refresh_token`; `one_time=false`; token balance included | High |
| TC-AUTH-017 | Login with CNIC instead of email | TC-AUTH-001 done | POST `/login` with `email=<the CNIC>` + password | 200, same shape as TC-AUTH-016 | High |
| TC-AUTH-018 | Login with a wrong password | User exists | POST `/login` with a bad password | 401, "Invalid credentials…"; no tokens returned | High |
| TC-AUTH-019 | Login with an unknown identifier | — | POST `/login` with an email that does not exist | 401, **same** message as TC-AUTH-018 (no user enumeration) | High |
| TC-AUTH-020 | Login with missing fields | — | POST `/login` with no password | 400, "Email/CNIC and password are required" | Med |
| TC-AUTH-021 | One-time OTP login succeeds once | `must_use_otp=True`, `otp_used=False` | POST `/login` with the OTP as password | 200; `one_time=true`; `refresh_token` is **null**; `otp_used` becomes `True` | High |
| TC-AUTH-022 | The same OTP cannot be reused | TC-AUTH-021 done | POST `/login` again with the same OTP | 401, message says credentials already used | High |
| TC-AUTH-023 | Banned user is blocked while the ban is live | `status='banned'`, `banned_until` in the future | POST `/login` with correct credentials | 403; message names the auto-reopen date | High |
| TC-AUTH-024 | Expired ban auto-lifts on login | `status='banned'`, `banned_until` in the past | POST `/login` with correct credentials | 200; `status` becomes `'active'`, `banned_until` becomes `NULL` | High |
| TC-AUTH-025 | Banned **admin** is not blocked | Admin user with `status='banned'` | POST `/login` | 200 (admins bypass the ban gate) | Low |
| TC-AUTH-026 | Refresh issues a new access token | Valid refresh token held | POST `/refresh` with the refresh token in the body | 200; a new `access_token` returned | High |
| TC-AUTH-027 | Refresh accepts the token via Authorization header | Valid refresh token | POST `/refresh` with `Authorization: Bearer <refresh>` and empty body | 200; new `access_token` | Med |
| TC-AUTH-028 | Refresh rejects a garbage token | — | POST `/refresh` with `refresh_token='abc'` | 401, "Invalid refresh token" | High |
| TC-AUTH-029 | Refresh rejects an expired token | Expired refresh JWT | POST `/refresh` | 401, "Refresh token expired" | Med |
| TC-AUTH-030 | Refresh rejects a token issued before session revocation | `user.session_revoked_at` is after the token's `iat` | POST `/refresh` | 401, "Session has been revoked" | High |
| TC-AUTH-031 | Forgot-password returns the mock OTP | User exists | POST `/forgot-password` with the email | 200; `debug_otp='123456'` | Med |
| TC-AUTH-032 | Forgot-password does not leak unknown emails | Email not registered | POST `/forgot-password` | 200; generic "if the email exists" message; **no** `debug_otp` key | High |
| TC-AUTH-033 | Reset password with the correct OTP | User exists, not `must_use_otp` | POST `/reset-password` with otp `123456` + new password | 200; the new password works on `/login`, the old one does not | High |
| TC-AUTH-034 | Reset password with a wrong OTP | — | POST `/reset-password` with otp `000000` | 400, "Invalid OTP code"; password unchanged | High |
| TC-AUTH-035 | Reset password rejects missing fields | — | POST `/reset-password` with no `new_password` | 400, "Email, OTP, and new password are required" | Med |
| TC-AUTH-036 | OTP accounts cannot self-reset to a persistent password | `must_use_otp=True` | POST `/reset-password` with otp `123456` | 403, mentions administration-issued credentials | High |
| TC-AUTH-037 | Reset password for a non-existent user | Correct OTP, unknown email | POST `/reset-password` | 404, "User not found" | Low |
| TC-AUTH-038 | Logout is a stateless no-op | — | POST `/logout` | 200; the previously issued access token **still works** | Low |
| TC-AUTH-039 | Protected route rejects a request with no token | — | GET `/api/tokens/balance` with no `Authorization` header | 401 | High |
| TC-AUTH-040 | Protected route rejects a tampered token | — | GET `/api/tokens/balance` with a corrupted bearer token | 401 | High |

---

## 2. Interview Core (`/api/interviews`)

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-INT-001 | Start a technical interview successfully | Candidate logged in, ≥1 token | POST `/start` `{type:'technical', job_role:'Software Engineer', experience_level:'Entry', num_questions:5}` | 200; `interview.status='active'`; exactly 5 questions returned, ordered `order_num` 1..5 | High |
| TC-INT-002 | Starting deducts exactly one token | Balance = 5 | POST `/start` | Balance becomes 4; `tokens_consumed` becomes 1 | High |
| TC-INT-003 | Starting writes a consumption ledger entry | TC-INT-002 done | Read `Transaction` rows | A row with `transaction_type='consumption'`, `tokens_added=-1` | High |
| TC-INT-004 | Start fails with zero tokens | Balance = 0 | POST `/start` | **402**, "Insufficient tokens…"; **no** interview row created; balance stays 0 | High |
| TC-INT-005 | Start fails when a required field is missing | — | POST `/start` with no `job_role` | 400, "Interview type, job role, and experience level are required" | High |
| TC-INT-006 | Non-technical domain is rejected before charging | Balance = 5 | POST `/start` with `job_role='Dentist'` | **422**, "interviews cannot currently be conducted for this domain"; **balance unchanged**; no interview created | High |
| TC-INT-007 | Rejected domain is written to the admin log | TC-INT-006 done | Read `AdminLog` rows | A row with `action='REJECTED_DOMAIN'`, details naming the user and the domain | Med |
| TC-INT-008 | A known technical role short-circuits the classifier | — | POST `/start` with `job_role='Software Engineer'` | 200; classification source is `preset`; no LLM call attempted | Med |
| TC-INT-009 | An unrecognised domain is allowed as best-effort | — | POST `/start` with `job_role='Quantum Widget Tuner'` | 200 (confidence 40 < 50 threshold, so not blocked) | Med |
| TC-INT-010 | JD-driven start skips domain validation | — | POST `/start` with `custom_jd` of ≥30 chars and a non-technical `job_role` | 200; interview created (JD implies a real role) | Med |
| TC-INT-011 | Mock mode generates the requested question count | `AI_MODE=mock` | POST `/start` with `num_questions:7` | 7 `InterviewQuestion` rows, each with non-empty `question_text` and a `time_limit_seconds` | High |
| TC-INT-012 | Instructor account is forced onto the instructor question set | User's category is Instructor | POST `/start` with `type='technical', job_role='Chef'` | 200; stored interview has `type='instructor'`, `job_role='Instructor'`; domain classifier skipped | Med |
| TC-INT-013 | One-time candidate resumes instead of starting a second session | `must_use_otp=True`, an `active` interview exists | POST `/start` | 200; message "Resuming your official interview session"; **no** new interview, **no** extra token charged | High |
| TC-INT-014 | One-time candidate cannot start after completing | `must_use_otp=True`, interview `completed` | POST `/start` | **403**, "already been completed" | High |
| TC-INT-015 | Submit a text answer | Active interview, valid `question_id` | POST `/{id}/submit-answer` form with `response_text` | 200; `is_completed=false`; `scoring_status='processing'`; an `InterviewResponse` row exists with `scoring_status='pending'` | High |
| TC-INT-016 | Submit rejects an empty non-timeout answer | Active interview | POST `/{id}/submit-answer` with no text and no audio, `timed_out=false` | 400, "Response content is empty…" | High |
| TC-INT-017 | A timed-out question may be an empty skip | Active interview | POST `/{id}/submit-answer` with no text, `timed_out=true` | 200; stored `response_text` is `'[No answer recorded — time expired]'` | High |
| TC-INT-018 | Submit rejects a question from another interview | Two interviews exist | POST `/{idA}/submit-answer` with a `question_id` from interview B | 400, "Question does not belong to this interview" | High |
| TC-INT-019 | Submit rejects a completed interview | Interview `status='completed'` | POST `/{id}/submit-answer` | 400, "Interview has already been completed" | High |
| TC-INT-020 | Re-submitting the same question overwrites, not duplicates | One response already stored for Q1 | POST `/{id}/submit-answer` for Q1 again | Still exactly **one** `InterviewResponse` row for Q1; text updated; `scoring_status` reset to `'pending'` | High |
| TC-INT-021 | The final answer marks the interview completed | 4 of 5 questions answered | Submit the 5th answer | 200; `is_completed=true`; interview `status='completed'`, `scoring_status='pending'` | High |
| TC-INT-022 | Typed answer wins over the browser fallback transcript | — | POST with both `response_text='typed'` and `fallback_text='spoken'` | Stored `response_text` is `'typed'` | Med |
| TC-INT-023 | Fallback transcript is used when no typed text is sent | — | POST with only `fallback_text='spoken'` | Stored `response_text` is `'spoken'` | Med |
| TC-INT-024 | Final submission stores the completion snapshot | Last question | POST with `snapshot_image=<base64>` | `interview.completion_snapshot` is populated | Med |
| TC-INT-025 | One-time candidate is marked completed on the last answer | `must_use_otp=True` | Submit the final answer | `user.interview_status` becomes `'interview_completed'` | High |
| TC-INT-026 | Report returns "in progress" while scoring runs | Interview completed, `scoring_status='pending'`, no report row | GET `/{id}/report` | 200; `report=null`; `scoring_status='in_progress'`; `qna` array present | High |
| TC-INT-027 | Report returns full data once generated | An `InterviewReport` row exists | GET `/{id}/report` | 200; `scoring_status='complete'`; `report` populated; `qna` pairs every question with its response (or `null`) | High |
| TC-INT-028 | Report 404s for an unstarted/unknown interview | — | GET `/99999/report` | 404, "Interview session not found" | Med |
| TC-INT-029 | A candidate cannot read another candidate's report | Interview belongs to user B | GET `/{idB}/report` as user A | 404 (not 403 — no existence leak) | High |
| TC-INT-030 | An admin can read any report | Admin logged in | GET `/{idB}/report` as admin | 200 | Med |
| TC-INT-031 | `evaluate-code` rejects empty code | — | POST `/evaluate-code` `{code:'   '}` | 400, "Code cannot be empty" | Med |
| TC-INT-032 | `evaluate-code` returns a review for valid code | — | POST `/evaluate-code` with a small Python function | 200; `ai_review` has `rating`, `bugs`, `suggestions`, complexity fields | Med |
| TC-INT-033 | `evaluate-code` flags a comments-only submission | — | POST `/evaluate-code` with only `# comment` lines | `rating=0.0`; bugs mention "No active code logic" | Med |
| TC-INT-034 | `evaluate-code` flags an infinite loop pattern | — | POST `/evaluate-code` with `while True:` and no `break` | Bugs include "Potential infinite loop detected"; rating reduced | Med |
| TC-INT-035 | `evaluate-code` flags `eval()` as a security risk | — | POST `/evaluate-code` with `eval(...)` | Bugs include the `eval()` security warning | Low |
| TC-INT-036 | History returns only the caller's interviews | Users A and B each have interviews | GET `/history` as A | Only A's interviews, newest first | High |
| TC-INT-037 | Stats summary aggregates completed interviews only | Mix of active + completed | GET `/stats/summary` | Counts/averages exclude `active` sessions | Med |
| TC-INT-038 | Details returns questions in order | Active interview | GET `/{id}/details` | Questions ordered by `order_num`; `responses_count` correct | Med |

---

## 3. Proctoring & Integrity

> **Threshold note:** termination fires when `proctor_violations_count > 3` — i.e. on the **4th** hard violation. Three warnings are allowed.

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-PROC-001 | A hard violation increments the counter | Active interview, count 0 | POST `/{id}/proctor-log` `{type:'NO_FACE', details:'…'}` | 200; `violations_count=1`; `auto_terminate=false` | High |
| TC-PROC-002 | Violations 1–3 do **not** terminate | Active interview | Log 3 hard violations | After each: `auto_terminate=false`; interview still `active`; `is_proctor_failed=False` | High |
| TC-PROC-003 | The 4th violation auto-terminates | 3 violations already logged | Log a 4th violation | 200; `auto_terminate=true`; `violations_count=4` | High |
| TC-PROC-004 | Termination zeroes the interview and writes a report | TC-PROC-003 done | Read the interview + report | `is_proctor_failed=True`, `status='completed'`, `overall_score=0.0`, `scoring_status='complete'`; an `InterviewReport` exists with all scores `0.0` | High |
| TC-PROC-005 | Termination notifies the candidate | TC-PROC-003 done | Read `Notification` rows | A notification titled "Interview Terminated" | Med |
| TC-PROC-006 | A single termination bans the user for 30 days | TC-PROC-003 done | Read the user row | `status='banned'`; `banned_until` ≈ now + **30 days** | High |
| TC-PROC-007 | Auto-ban is written to the admin log | TC-PROC-006 done | Read `AdminLog` | A row with `action='AUTO_BAN_USER'` naming the user and the 30-day window | Med |
| TC-PROC-008 | A re-termination extends but never shortens a ban | User already banned until now+30d | Terminate a second interview | `banned_until` is **≥** the previous value (never reduced) | Med |
| TC-PROC-009 | An admin is never auto-banned | Admin takes an interview and is terminated | Log 4 violations as admin | `user.status` stays `'active'` | Low |
| TC-PROC-010 | A soft violation is logged but never counts | Active interview | POST `/{id}/proctor-log` `{type:'FACE_NOT_FULL', soft:true}` | 200; `soft=true`; `auto_terminate=false`; `violations_count` **unchanged**; entry still appears in `proctor_logs` | High |
| TC-PROC-011 | Soft violations never terminate, even in bulk | Active interview | Log 10 soft violations | Interview still `active`; `proctor_violations_count=0` | High |
| TC-PROC-012 | A missing violation type is rejected | — | POST `/{id}/proctor-log` `{}` | 400, "Violation type is required" | Med |
| TC-PROC-013 | Logging against a completed interview is a no-op | Interview `completed` | POST `/{id}/proctor-log` | 200; `auto_terminate=false`; counter unchanged | Med |
| TC-PROC-014 | A NULL violation counter coerces to 0 before incrementing | Legacy row with `proctor_violations_count=NULL` | Log one violation | `violations_count=1` (no crash) | Med |
| TC-PROC-015 | Every violation is appended to the JSON log | 3 violations logged | Read `interview.proctor_logs` | 3 entries, each with `timestamp`, `type`, `details`, `soft` | Med |
| TC-PROC-016 | Manual force-fail terminates immediately | Active interview, 0 violations | POST `/{id}/fail-proctoring` | 200; `is_proctor_failed=True`, `status='completed'`, score `0.0`; user banned 30 days | High |
| TC-PROC-017 | Force-fail stores the snapshot on the report | — | POST `/{id}/fail-proctoring` with `snapshot_image` + `snapshot_description` | Both persisted on the `InterviewReport` row | Med |
| TC-PROC-018 | Force-fail 404s for another user's interview | Interview belongs to B | POST `/{idB}/fail-proctoring` as A | 404 | High |
| TC-PROC-019 | A proctor snapshot is archived with the right kind | Active interview | POST `/{id}/proctor-snapshot` `{image, kind:'webcam', label:'NO_FACE'}` | 200 `{stored:true}`; a `ProctorSnapshot` row with `kind='webcam'`, correct `label`, `candidate_email`, `interview_id` | High |
| TC-PROC-020 | An unknown snapshot kind falls back to `screen` | — | POST `/{id}/proctor-snapshot` with `kind:'hacker'` | Stored row has `kind='screen'` | Med |
| TC-PROC-021 | Snapshot upload requires an image | — | POST `/{id}/proctor-snapshot` `{}` | 400, "Snapshot image is required" | Med |
| TC-PROC-022 | Snapshots are still accepted for a just-completed interview | Interview `completed` | POST `/{id}/proctor-snapshot` | 200 (the terminating violation's frame must not be dropped) | High |
| TC-PROC-023 | Exactly 2 snapshots per counted violation — no duplicates | Fresh interview | Drive 4 violations, each sending 1 webcam + 1 screen snapshot | Exactly **8** `ProctorSnapshot` rows (not 9) — the terminating violation must not add a third | High |
| TC-PROC-024 | Identity mismatch terminates immediately | Active interview | POST `/{id}/identity-failed` with details + snapshot | 200; interview terminated; `terminated_reason='identity_mismatch'` | High |
| TC-PROC-025 | Identity failure does **not** touch the violation counter | `proctor_violations_count=1` | POST `/{id}/identity-failed` | Counter stays **1** (identity is a direct block, not a strike) | High |
| TC-PROC-026 | Identity failure writes its own admin log | TC-PROC-024 done | Read `AdminLog` | A row with `action='IDENTITY_VERIFICATION_FAILED'` carrying candidate email, interview id, timestamp | High |
| TC-PROC-027 | Identity failure archives an `identity` snapshot | TC-PROC-024 done | Read `ProctorSnapshot` | A row with `kind='identity'` for that interview | Med |
| TC-PROC-028 | Identity failure on a completed interview is a no-op | Interview `completed` | POST `/{id}/identity-failed` | 200; `terminated=false`; nothing changed | Med |

---

## 4. Tokens (`/api/tokens`)

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-TOK-001 | Balance returns the wallet | User has a `Token` row | GET `/balance` | 200; `tokens_available`, `tokens_consumed`, `tokens_purchased` | High |
| TC-TOK-002 | Balance auto-creates a missing wallet with 5 tokens | User has **no** `Token` row | GET `/balance` | 200; `tokens_available=5`; a row now exists | Med |
| TC-TOK-003 | Purchase adds tokens and records the amount | Balance 5 | POST `/purchase` `{tokens:10, amount:19.99}` | 200; balance 15; `tokens_purchased` +10 | High |
| TC-TOK-004 | Purchase writes a ledger entry | TC-TOK-003 done | Read `Transaction` | Row with `transaction_type='purchase'`, `tokens_added=10`, `amount=19.99` | High |
| TC-TOK-005 | Purchase notifies the user | TC-TOK-003 done | Read `Notification` | Notification `type='token'` naming the purchase | Med |
| TC-TOK-006 | Purchase rejects a non-positive quantity | — | POST `/purchase` `{tokens:0}` and `{tokens:-5}` | 400, "Invalid token amount"; balance unchanged | High |
| TC-TOK-007 | Purchase uses defaults when fields are omitted | — | POST `/purchase` `{}` | 200; 5 tokens added at `9.99` | Low |
| TC-TOK-008 | Transactions are newest-first and scoped to the user | Users A and B both have transactions | GET `/transactions` as A | Only A's rows, `created_at` descending | High |
| TC-TOK-009 | Full consumption cycle reconciles | Balance 5 | Start 5 interviews | Balance 0; `tokens_consumed=5`; 5 `consumption` ledger rows; the 6th start returns 402 | High |

---

## 5. Resume & JD (`/api/resume-jd`)

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-RJD-001 | A valid TXT resume is analysed and stored | Logged in | POST `/analyze-resume` with a .txt containing Experience/Education/Skills | 200; `analysis` returned; a `ResumeAnalysis` row created | High |
| TC-RJD-002 | Analysis notifies the user with an ATS score | TC-RJD-001 done | Read `Notification` | Notification `type='recommendation'` naming the score | Med |
| TC-RJD-003 | An unsupported extension is rejected | — | POST `/analyze-resume` with a `.docx` | 400, "Only PDF and TXT formats are supported" | High |
| TC-RJD-004 | A too-short/blank file is rejected | — | POST with a .txt under 50 characters | 400, "Failed to extract text…" | High |
| TC-RJD-005 | Garbage content that is not a resume is rejected | — | POST a 200-char .txt of lorem ipsum with no resume keywords | 400, "does not appear to be a valid resume or CV"; **no** `ResumeAnalysis` row | High |
| TC-RJD-006 | Exactly one resume keyword is still rejected | — | POST a .txt containing only the word "skills" (+ filler ≥50 chars) | 400 (needs **≥2** keyword matches) | Med |
| TC-RJD-007 | "Curriculum vitae" alone passes validation | — | POST a .txt containing "curriculum vitae" and ≥50 chars | 200 (explicit bypass) | Low |
| TC-RJD-008 | The temp upload is always deleted | Any of TC-RJD-001/004/005 | Inspect `UPLOAD_FOLDER` after the call | No leftover file, on both success and every failure path | High |
| TC-RJD-009 | JD text is parsed into requirements/skills | Logged in | POST `/analyze-jd` with a realistic JD | 200; a `JdAnalysis` row with extracted skills/requirements | High |
| TC-RJD-010 | Match returns a percentage, gaps and 3 questions | A resume and a JD analysed | POST `/match` | 200; `match_percentage` in 0–100; `skill_gaps` list; exactly **3** tailored questions | High |
| TC-RJD-011 | Extract-file-text handles PDF and TXT | — | POST `/extract-file-text` with each type | 200; non-empty text for both | Low |
| TC-RJD-012 | All resume/JD routes require auth | — | Call each with no bearer token | 401 | High |

---

## 6. Coding Sandbox (`/api/coding`)

> **Gate:** every route is `admin_required`. The candidate-facing UI is deliberately disabled to match.

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-CODE-001 | Non-admin is blocked from the problem list | Candidate logged in | GET `/problems` | **403** | High |
| TC-CODE-002 | Non-admin is blocked from run and submit | Candidate logged in | POST `/run` and `/submit` | **403** on both; no `CodeSubmission` created | High |
| TC-CODE-003 | Admin lists problems | Admin logged in | GET `/problems` | 200; the problem bank (4 problems) | Med |
| TC-CODE-004 | A single problem hides its hidden tests and solution | Admin | GET `/problems/{id}` | 200; payload contains sample tests only — **no** `hidden_tests`, **no** reference solution | High |
| TC-CODE-005 | An unknown problem id 404s | Admin | GET `/problems/does-not-exist` | 404, "Coding problem not found" | Med |
| TC-CODE-006 | `/run` executes only the visible sample tests | Admin, correct solution | POST `/run` | 200; `mode='run'`; `total` equals the **sample** count only; **no** `CodeSubmission` row | High |
| TC-CODE-007 | `/run` requires a language | Admin | POST `/run` with no `language` | 400, "A language selection is required" | Med |
| TC-CODE-008 | `/submit` runs sample + hidden tests | Admin, correct solution | POST `/submit` | 200; `mode='submit'`; `total` = sample + hidden; `passed == total`; `score` 100 | High |
| TC-CODE-009 | `/submit` persists a `CodeSubmission` | TC-CODE-008 done | Read the DB | One row with `user_id`, `problem_id`, `language`, `code`, `passed`, `total`, `score`, JSON `results`; `submission_id` returned | High |
| TC-CODE-010 | A wrong solution reports partial/zero passes | Admin, deliberately wrong code | POST `/submit` | 200; `passed < total`; `score` reduced; row still persisted | High |
| TC-CODE-011 | An infinite loop is killed by the timeout | Admin | POST `/submit` with `while True: pass` | Result status `timeout`; message "Time limit exceeded… Possible infinite loop"; **the request still returns** (server not hung) | High |
| TC-CODE-012 | A syntax error is reported, not crashed | Admin | POST `/submit` with `def f(:` | 200; per-test `error` status with the interpreter message; no 500 | High |
| TC-CODE-013 | Program stdout does not corrupt the return value | Admin | Submit a correct solution that also `print()`s | Sentinel parsing keeps stdout separate; the test still passes | Med |
| TC-CODE-014 | A failed DB write does not break the run result | Admin, DB write forced to fail | POST `/submit` | 200; results still returned; `submission_id` is `null` | Low |
| TC-CODE-015 | Frontend disables the sandbox for non-admins | Candidate logged in | Open the Coding Interview page | Controls disabled / access-restricted state; no run/submit request is fired | High |

---

## 7. Admin (`/api/admin`)

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-ADM-001 | Every admin route rejects a candidate | Candidate logged in | Call `/stats`, `/users`, `/logs`, `/scoring/analytics` | **403** on all | High |
| TC-ADM-002 | Every admin route rejects an anonymous caller | — | Call the same routes with no token | 401 | High |
| TC-ADM-003 | Stats returns the platform dashboard | Admin, seeded data | GET `/stats` | 200; user/interview counts, revenue, token totals, recent feedback + logs | High |
| TC-ADM-004 | User list returns all users | Admin | GET `/users` | 200; every user, including the admin | Med |
| TC-ADM-005 | Ban a user | Admin | POST `/users/{id}/ban` | 200; `status='banned'`; an `AdminLog` row written | High |
| TC-ADM-006 | Unban a user | Banned user | POST `/users/{id}/ban` toggling back | 200; `status='active'`, `banned_until` cleared; logged | High |
| TC-ADM-007 | A banned user can no longer log in | TC-ADM-005 done | POST `/api/auth/login` as that user | 403 | High |
| TC-ADM-008 | Token override adjusts the wallet | Admin | POST `/users/{id}/tokens` with a new amount | 200; balance updated; an `AdminLog` row written | High |
| TC-ADM-009 | Admin accounts can never be deleted | Admin | DELETE `/users/{admin_id}` | **403**, "Administrator accounts cannot be deleted" | High |
| TC-ADM-010 | Deleting a candidate removes their proctor snapshots | Candidate with `ProctorSnapshot` rows | DELETE `/users/{id}` | 200; **zero** `ProctorSnapshot` rows remain for that user or their interviews (no orphans) | High |
| TC-ADM-011 | Deleting a candidate removes their interviews and responses | Candidate with a completed interview | DELETE `/users/{id}` | Interviews, questions, responses, report, transactions, submissions all gone | High |
| TC-ADM-012 | Deletion anonymizes rather than deletes audit logs | Candidate whose email appears in `AdminLog` | DELETE `/users/{id}` | Log rows survive; the email/CNIC/name are replaced with `[deleted user]` | High |
| TC-ADM-013 | Deleting an interview removes its snapshots | Interview with snapshots | DELETE `/interviews/{id}` | 200; zero `ProctorSnapshot` rows for that interview | High |
| TC-ADM-014 | Storage-cleanup failures are logged, not silent | Storage delete forced to fail | DELETE `/users/{id}` | 200 with a warning in the message; an `AdminLog` row `action='STORAGE_CLEANUP_NEEDED'` listing the objects | Med |
| TC-ADM-015 | Listings return data | Admin, seeded | GET `/interviews`, `/transactions`, `/feedback`, `/logs` | 200 on each; arrays populated | Med |
| TC-ADM-016 | Scoring analytics computes averages | ≥2 completed interviews with scored responses | GET `/scoring/analytics` | 200; `overview.avg_score` and `avg_confidence` match a hand calculation (1 dp) | High |
| TC-ADM-017 | Score distribution buckets are correct | Responses scored 10, 30, 50, 70, 90 | GET `/scoring/analytics` | Buckets `0-20,20-40,40-60,60-80,80-100` each equal 1 | High |
| TC-ADM-018 | A score of exactly 100 lands in the top bucket | A response scored 100.0 | GET `/scoring/analytics` | Counted in `80-100`, not a 6th bucket (index clamped at 4) | High |
| TC-ADM-019 | Flagged answers are counted | Some responses flagged for manual review | GET `/scoring/analytics` | `overview.flagged_evaluations` matches the flagged row count; per-interview `flagged_count` matches too | High |
| TC-ADM-020 | Interviews with no responses are excluded | A completed interview with zero responses | GET `/scoring/analytics` | That interview is **not** in `interviews[]`; `total_interviews` excludes it | Med |
| TC-ADM-021 | Empty dataset returns zeros, not a crash | Fresh DB, no completed interviews | GET `/scoring/analytics` | 200; all averages `0`; all buckets `0`; `interviews` empty | High |
| TC-ADM-022 | Per-interview drill-down returns every question | A completed, scored interview | GET `/scoring/interviews/{id}` | 200; one item per question with transcript, score, rationale | High |
| TC-ADM-023 | Drill-down 404s for an unknown interview | Admin | GET `/scoring/interviews/99999` | 404, "Interview not found" | Med |
| TC-ADM-024 | Proctor-snapshot listing is capped and newest-first | >400 snapshots exist | GET `/proctor-snapshots` | ≤400 rows, `captured_at` descending | Low |

---

## 8. AI Mock-Mode & Anti-Fabrication

> **This is the project's core design principle.** These cases must never be skipped.

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-AI-001 | The whole platform runs with zero API keys | `AI_MODE=mock`, no `MIXTRAL_API_KEY`, no `WHISPER_API_KEY` | Run register → start → submit all answers → report | Every step succeeds; **no outbound HTTP** to any AI provider | High |
| TC-AI-002 | Domain classification works offline | `AI_MODE=mock` | `classify_domain('Software Engineer')` and `classify_domain('Dentist')` | First `is_technical=True`; second `is_technical=False, confidence=75, source='fallback'` | High |
| TC-AI-003 | Classification is deterministic | `AI_MODE=mock` | Call `classify_domain('Dentist')` 5 times | Identical result each time | High |
| TC-AI-004 | An empty domain is rejected with full confidence | — | `classify_domain('')` | `is_technical=False, confidence=100, source='fallback'` | Med |
| TC-AI-005 | Question generation is deterministic and correctly sized | `AI_MODE=mock` | `generate_questions(..., num_questions=5)` twice | 5 questions both times, identical, each with `question_text` + `question_type` | High |
| TC-AI-006 | An empty answer scores 0 with **no** model call | — | `evaluate_response(q, '')` | `score=0.0`; `confidence_score=100.0`; `needs_manual_review=False`; feedback "No answer was provided…" | High |
| TC-AI-007 | **A failed evaluation is never given a fabricated score** | LLM call forced to fail | Trigger `_fallback_evaluation()` | `needs_manual_review=True`; `confidence_score=0.0`; feedback explicitly says the placeholder is not final | High |
| TC-AI-008 | Low confidence auto-flags for manual review | Evaluation returns `confidence_score=39` | `_normalize_evaluation(...)` | `needs_manual_review=True` | High |
| TC-AI-009 | The flag threshold is exactly 40 | confidence 40 vs 39 | `_normalize_evaluation` on each | 40 → `False`; 39 → `True` | High |
| TC-AI-010 | Scores are always clamped to 0–100 | Model returns `-20` and `250` | `_normalize_evaluation` | Clamped into 0–100; never negative, never >100 | High |
| TC-AI-011 | Whisper returns a clearly simulated transcript in mock mode | `AI_MODE=mock` | `WhisperService.transcribe(path, q)` | Returns a canned transcript; **no** network call; `is_configured()` is `False` | High |
| TC-AI-012 | **Whisper raises rather than fabricates in live mode** | `AI_MODE=api`, key set, audio file missing | `WhisperService.transcribe('/nope.mp3')` | Raises `TranscriptionError`; **never** returns invented text | High |
| TC-AI-013 | Report generation works offline | `AI_MODE=mock` | Complete an interview and wait for the report | An `InterviewReport` with scores, strengths, weaknesses, recommendations — none empty | High |
| TC-AI-014 | Resume/JD analysis works offline | `AI_MODE=mock` | Run analyze-resume, analyze-jd, match | All 200; deterministic output | High |
| TC-AI-015 | Flagged answers surface in the admin dashboard | A `needs_manual_review` response exists | GET `/admin/scoring/analytics` | `flagged_evaluations` ≥ 1 (the flag is visible end-to-end, not just stored) | High |

---

## 9. Technical Debt & Edge Cases

| Test ID | Description | Pre-conditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-DEBT-001 | Tables auto-create on a blank database | Empty SQLite file | Boot the app | All tables created via `create_all`; no error | High |
| TC-DEBT-002 | Boot is idempotent (no duplicate admin seed) | App already booted once | Boot again against the same DB | Still exactly **one** `admin@interviewer.com`; no crash | High |
| TC-DEBT-003 | Schema drift: a pre-existing DB missing a newer column | DB created before a column was added | Boot the app | `ensure_schema()` adds the column; startup succeeds | High |
| TC-DEBT-004 | A legacy row with NULL in a newer column still works | Row with `proctor_violations_count=NULL` | Log a violation | Coerced to 0 then incremented → 1; no `TypeError` | High |
| TC-DEBT-005 | Sandbox timeout actually fires on an infinite loop | — | Submit `while True: pass` | Killed at the per-test limit; `timeout` status returned; total runtime ≈ the limit, not unbounded | High |
| TC-DEBT-006 | A CPU-heavy but finite program still completes | — | Submit a ~1s tight loop under a 5s limit | Passes normally; not falsely timed out | Med |
| TC-DEBT-007 | Sandbox timeout does not block other requests | — | Start a timing-out submission, then hit `/health` | `/health` responds normally while the sandbox request is still running | High |
| TC-DEBT-008 | **Docs-only Flask/FastAPI mismatch — confirm no runtime impact** | — | Boot via `python main.py`; assert the ASGI app is FastAPI; hit `/health` | 200 `{status:'healthy'}`; the app is FastAPI. The README/Dockerfile Flask wording is a **documentation** defect only — record it, do not change code | High |
| TC-DEBT-009 | `/health` reports degraded when the DB is unreachable | DB connection broken | GET `/health` | **503**; `{status:'degraded', database:'down'}` | High |
| TC-DEBT-010 | `/health` reports the active AI mode | `AI_MODE=mock` | GET `/health` | `mode:'mock'` | Med |
| TC-DEBT-011 | An unhandled error returns clean JSON, not a stack trace | An endpoint forced to raise | Call it | 500 with `{'detail': 'An internal error occurred…'}`; no traceback leaked; session rolled back | High |
| TC-DEBT-012 | A poisoned transaction does not leak into the next request | Force an error mid-transaction | Make a second, normal request | Second request succeeds (the pooled connection was rolled back) | High |
| TC-DEBT-013 | The DB session is closed after every request | — | Fire 50 sequential requests | No connection-pool exhaustion; no leaked sessions | Med |
| TC-DEBT-014 | Background scoring failure does not corrupt the interview | Scoring thread forced to raise | Submit the final answer, then GET the report | Interview stays `completed`; report shows `in_progress` or a flagged result — never a fabricated score | High |
| TC-DEBT-015 | A proctor termination is not overwritten by late scoring | A scoring thread still pending when termination fires | Terminate, then let the thread finish | `overall_score` stays `0.0`; `scoring_status='complete'`; the termination report survives | High |

---

## 10. Open Questions — please confirm

1. **Which is authoritative** where `PROJECT_SUMMARY.md` and the code disagree (table D1–D7 at the top)? I have written every case against the **code**. If the summary is the intended spec, several of these become **bug reports** rather than passing tests — most notably D3/D4 (violation threshold and ban duration).
2. **New dev dependencies are required — please approve before Step 3.** The repo currently has *no* test framework installed:
   - Backend: `pytest`, `httpx` (for FastAPI's `TestClient`) — new entries in `requirements.txt`.
   - Frontend: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` — new `devDependencies`.
   These are **dev/test-only** and never ship to the Railway backend or the Vercel build. Per the standing rule I will not install anything until you say yes.
3. **Async scoring (D5)** makes TC-INT-026/027 and TC-AI-013 timing-dependent. Preference: (a) call the scoring worker directly and synchronously in tests, or (b) poll the report endpoint with a timeout? I recommend **(a)** — deterministic and fast.
4. **Frontend coverage** — the brief names `InterviewSession` and `AdminScoringPage`. `InterviewSession` is a very large component with live camera/MediaPipe/TF.js dependencies that must all be mocked. Confirm the target list; I suggest **AdminScoringPage, LoginPage, and the coding-sandbox admin gate** first (high value, low mocking cost), with `InterviewSession` limited to the violation/camera-toggle logic.
5. **Scope of TC-DEBT-008** — confirm that this stays a *verification* case only. Fixing the README/Dockerfile wording is a code change I have not been asked to make.

---

*Once this checklist is approved, Step 3 delivers the automated suites: `backend/tests/` (pytest, `AI_MODE=mock`, isolated SQLite) and `frontend/src/**/*.test.jsx` (vitest + RTL), with each automated test annotated with the Test ID it covers.*
