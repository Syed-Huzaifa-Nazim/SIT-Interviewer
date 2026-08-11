import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { getScreenStream, hasScreenStream, clearScreenStream } from '../services/proctorScreen';
import {
  speakPhrase,
  createSoftWarningAccumulator,
  LOOK_AWAY_VOICE_MESSAGE,
  GAZE_AWAY_VOICE_MESSAGE,
  HAND_DETECTED_VOICE_MESSAGE,
  NO_FACE_VOICE_MESSAGE,
  MULTIPLE_FACES_VOICE_MESSAGE,
  TERMINATION_VOICE_MESSAGE,
  IDENTITY_TERMINATION_VOICE_MESSAGE,
  INTRO_START_VOICE_MESSAGE,
} from '../utils/proctorVoiceAlerts';
import {
  loadFaceApi,
  computeDescriptor,
  descriptorDistance,
  getBaselineDescriptor,
  getBaselineImage,
  clearBaseline,
  IDENTITY_MATCH_THRESHOLD,
  IDENTITY_CHECK_INTERVAL_MS,
  IDENTITY_MISMATCH_STRIKES,
} from '../services/identityCheck';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import InterviewCodingSandbox from '../components/interview/InterviewCodingSandbox';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Clock,
  Volume2,
  VolumeX,
  Camera,
  CameraOff,
  Activity,
  ShieldAlert,
  AlertTriangle,
  Timer as TimerIcon,
  ScanFace,
  CheckCircle2
} from 'lucide-react';

// Ordered WebM codec candidates for the session recorder, broadest-compatibility-first.
// The backend joins uploaded slices by raw byte concatenation (assemble_interview_video),
// which only produces a valid file for WebM, so this deliberately never falls back to a
// different container (e.g. MP4) even on a browser that would otherwise accept one — a
// browser with no WebM support at all genuinely cannot be recorded today.
const SESSION_RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
  'video/webm',
];

const pickSessionRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return SESSION_RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
};

// Answer-audio recorder candidates (separate concern from the session video recorder above —
// this is the per-question clip sent to Whisper). Unlike the session recording, the backend
// receives this as ONE complete file per question (not concatenated slices), so unlike the
// video recorder it's free to fall back to a non-WebM container — Safari has no WebM support
// at all, and 'mp4' is its native MediaRecorder format. `startMic` previously constructed a
// MediaRecorder with a hardcoded 'audio/webm', which threw on any browser that didn't accept
// that exact string — the constructor throw happened BEFORE the live Web Speech API captions
// were started, so on an unsupported browser the candidate lost both the recording AND live
// captions, surfaced only as a generic "Could not access microphone" error even though the
// mic permission itself was granted fine.
const ANSWER_RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

const pickAnswerRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return ANSWER_RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
};

// The server infers the audio format from this filename's extension (Config.ALLOWED_EXTENSIONS
// already permits all of these) — must match whatever pickAnswerRecorderMimeType negotiated,
// or Whisper is handed a file whose real bytes don't match its claimed container/codec.
const answerRecorderFileName = (mimeType) => {
  if (mimeType && mimeType.includes('ogg')) return 'response.ogg';
  if (mimeType && mimeType.includes('mp4')) return 'response.m4a';
  return 'response.webm';
};

const InterviewSession = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Load questions passed from redirect, or fetch them if refreshed
  const [questions, setQuestions] = useState(location.state?.questions || []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Intro stage (§ intro stage): a 1-minute welcome/rules screen. Camera and proctoring
  // already start on mount regardless of this — the intro just gates which UI renders, so
  // proctoring is live from the very start of the session.
  //
  // Placement: normally the very first thing the candidate sees, before Question 1. BUT a
  // completed-course candidate's Question 1 is replaced with the opening coding-sandbox
  // exercise (backend interview_routes.py, `opening_problem`) — for that candidate the
  // sandbox must appear FIRST, with the welcome/rules screen running immediately AFTER it and
  // before the rest of the (verbal) questions, not before it. The lazy initializer below reads
  // the redirect's own question list (the normal path — arrives synchronously via router
  // state) so the very first render already opens on the sandbox instead of showing an intro
  // that would then need to be swapped out.
  const openedWithSandbox = questions[0]?.question_type === 'coding_sandbox';
  // 'ready' is a short "About to begin" gate shown immediately BEFORE the intro card — its own
  // explicit button, separate from the intro's own "Start Interview" button, so the candidate
  // gets an unambiguous heads-up that the welcome/rules screen (and its 60s countdown) is about
  // to start, instead of it just appearing the instant the page mounts.
  const [sessionStage, setSessionStage] = useState(() => {
    const initialQuestions = location.state?.questions || [];
    return initialQuestions[0]?.question_type === 'coding_sandbox' ? 'questions' : 'ready';
  }); // 'ready' | 'intro' | 'questions'
  const INTRO_DURATION_SECONDS = 60;
  const [introRemaining, setIntroRemaining] = useState(INTRO_DURATION_SECONDS);
  // Guards the intro from showing twice — once up front (normal case) or once right after the
  // opening sandbox (sandbox-first case), but never both, and never again on a later reload.
  const introShownRef = useRef(false);
  // One-time "the session has started" cue (voice + banner) the moment the intro screen first
  // appears — see the effect below, near handleStartInterview.
  const [introStartToast, setIntroStartToast] = useState(false);
  const introStartAnnouncedRef = useRef(false);
  // While true, the intro's 60s countdown is paused at its starting value — held for exactly
  // as long as INTRO_START_VOICE_MESSAGE takes to finish speaking, so the announcement doesn't
  // eat into the candidate's actual reading time (the countdown used to start ticking the
  // instant the intro card mounted, running in parallel with the ~5s voice line).
  const [introCountdownHeld, setIntroCountdownHeld] = useState(false);

  // Response modes: 'voice' (default) or 'text'
  const [inputMode, setInputMode] = useState('voice');
  const [typedAnswer, setTypedAnswer] = useState('');

  // MCQ round (§ MCQ round): a click only SELECTS an option (highlighted, not submitted) — a
  // separate "Submit Answer" button confirms it. selectedMcqOptionRef mirrors the state for
  // the same reason liveTranscriptRef does below: handleAutoSubmit runs inside a setInterval
  // closure captured once when the question's timer starts, so reading the state variable
  // directly there would see whatever was selected (or nothing) at that original render, not
  // whatever the candidate has since clicked.
  const [selectedMcqOption, setSelectedMcqOption] = useState(null);
  const selectedMcqOptionRef = useRef(null);

  // Live transcript (§3): accumulated final text + current interim words for the active
  // question. `liveTranscriptRef` mirrors the accumulated finals so async submit handlers
  // always read the latest value without waiting for a re-render.
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const liveTranscriptRef = useRef('');
  const [micActive, setMicActive] = useState(false);
  const [sttSupported, setSttSupported] = useState(true);
  // True once any audio has been captured for the current question (so the Submit
  // button enables even in browsers without live captions, where transcript stays empty).
  const [hasRecorded, setHasRecorded] = useState(false);

  // Camera & MediaPipe states
  const [cameraOn, setCameraOn] = useState(true);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [violationsCount, setViolationsCount] = useState(0);
  const violationsCountRef = useRef(0);
  const [violationAlert, setViolationAlert] = useState('');
  // Soft (non-terminating) proctor warning, e.g. full-face-not-visible (§4).
  const [softAlert, setSoftAlert] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  // Camera-stall watchdog (§ reliability): a calm "reconnecting" banner while we re-acquire
  // a dropped/frozen stream, and a persistent notice if it truly can't be restored. Neither
  // touches the detection logic — only the camera stream that feeds it.
  const [cameraReconnecting, setCameraReconnecting] = useState(false);
  const [cameraLost, setCameraLost] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // Callback ref instead of a plain ref: the intro screen and the main question screen each
  // mount their OWN <video> element (only one is ever in the DOM at a time, gated by
  // sessionStage), so switching stages destroys and recreates the node behind videoRef. A
  // plain ref would leave the new node with no srcObject — camera looking "off"/blank —
  // until some other effect happened to re-touch it. This re-attaches the live stream the
  // instant either <video> mounts, so the preview never goes blank on a stage transition.
  const attachVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);
  const lastViolationTimeRef = useRef({});
  // When ANY hard violation was last counted (across all types). Guards against a lag
  // spike tripping several checks at once and instantly terminating the interview.
  const lastAnyViolationRef = useRef(0);
  const faceBadSinceRef = useRef(null);
  // Screen monitoring (§ screen-tracking): the hidden <video> that plays the shared-screen
  // stream so frames can be grabbed, plus the periodic-capture timer.
  const screenVideoRef = useRef(null);
  const screenTimerRef = useRef(null);
  const lastScreenShotRef = useRef(0);
  // Eye/gaze proctoring (§1): when gaze first went off-screen, when the eyes first
  // appeared closed, and the last time the gaze math actually ran (throttled).
  const gazeAwaySinceRef = useRef(null);
  const eyesClosedSinceRef = useRef(null);
  const lastGazeCheckRef = useRef(0);
  // Shared soft-warning escalation (§ soft-warnings): LOOK_AWAY, HAND_DETECTED, and NO_FACE
  // all register against this ONE accumulator — any mix of the three totaling 4 escalates to
  // one real, counted violation. lastLookAwayNudgeRef is a DEDICATED timestamp used only for
  // the LOOK_AWAY/GAZE_AWAY cross-type dedup in checkEyeGaze (GAZE_AWAY is a hard violation
  // and does not touch the shared pool at all) — kept separate from lastViolationTimeRef so
  // it can never collide with logProctorViolation's own internal per-type throttle (that
  // throttle must only ever be touched by logProctorViolation itself).
  const sharedSoftAccumulatorRef = useRef(createSoftWarningAccumulator(4));
  const lastLookAwayNudgeRef = useRef(0);
  // Camera recovery refs. There is deliberately NO polling "is it frozen?" watchdog: every
  // frame/clock-based heuristic tried here produced false stalls (a busy main thread during
  // heavy model work looks identical to a dead camera), and each false stall tore down a
  // perfectly healthy stream — killing the session MediaRecorder bound to it and making the
  // camera appear to hang. Recovery now runs ONLY on the browser's own unambiguous track
  // signals (ended/mute), which fire for genuine device loss and nothing else.
  const cameraStalledRef = useRef(false);
  const cameraLostRef = useRef(false);
  const recoveryAttemptsRef = useRef(0);
  const muteGraceTimerRef = useRef(null);
  // Identity verification (§ identity check): consecutive mismatches seen so far, and a
  // latch so the terminate-once path can never fire twice.
  const identityMismatchesRef = useRef(0);
  const identityFailedRef = useRef(false);
  const identityBaselineSentRef = useRef(false);
  // Latched the moment the 5th violation lands and the backend confirms termination. The
  // detection loops (gaze/face/hands) keep running for the few seconds it takes to tear the
  // session down, and without this they'd keep beeping, popping alerts and queuing more
  // speech behind the termination line — this stops all of that at the source.
  const proctorTerminatedRef = useRef(false);
  const [identityAlert, setIdentityAlert] = useState('');

  // Voice capture refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const micActiveRef = useRef(false);
  const submittingRef = useRef(false);
  // Format actually negotiated for the answer recorder (see pickAnswerRecorderMimeType) — the
  // Blob type and the uploaded filename's extension must both match this exactly.
  const answerRecorderMimeTypeRef = useRef(null);

  // Full-session video recording (DB Integration §2): records the SAME 640×480 proctoring
  // camera stream (no second camera request), video-only WebM at a modest bitrate. One
  // contiguous recording per session — if the candidate turns the camera off the recorder
  // ends with it, and we upload whatever was captured up to that point rather than
  // stitching invalid multi-segment WebM files together.
  const sessionRecorderRef = useRef(null);
  const sessionChunksRef = useRef([]);
  const videoUploadedRef = useRef(false);
  const [savingVideo, setSavingVideo] = useState(false);

  // Incremental upload state. The recording is sent to the server in slices WHILE the
  // interview runs, instead of as one large file once it ends. A single end-of-session
  // upload had to survive starting at the exact moment the candidate was redirected away,
  // and on longer sessions it routinely did not — the tab closed mid-transfer, nothing
  // reached the server, and no recording (or even a failure record) existed afterwards.
  // With slices, only whatever has not been flushed yet can ever be lost.
  const pendingPartChunksRef = useRef([]);   // captured but not yet uploaded
  const partIndexRef = useRef(0);            // next slice number
  const partQueueRef = useRef(Promise.resolve()); // serialises uploads to preserve order
  const partsUploadedRef = useRef(0);        // slices confirmed stored
  const partFlushTimerRef = useRef(null);
  const VIDEO_PART_INTERVAL_MS = 30000;      // worst-case loss window
  // Diagnostics carried into the RECORDING_UNAVAILABLE audit note. Without these, a missing
  // recording says only "no recording" — indistinguishable between "the browser never
  // captured a frame" and "capture was fine but every upload was rejected", which are
  // completely different faults with completely different fixes.
  const recorderMimeTypeRef = useRef(null);  // format actually negotiated, null if none
  const partsAttemptedRef = useRef(0);       // slices we tried to send
  const lastPartUploadErrorRef = useRef(''); // why the most recent slice failed

  // Per-question timer (§2)
  const [remaining, setRemaining] = useState(null);
  const [timeLimit, setTimeLimit] = useState(null);
  const timerRef = useRef(null);
  const timerQuestionRef = useRef(null);

  // General session timer
  const [sessionTime, setSessionTime] = useState(0);

  const activeQuestion = questions[currentIdx];
  // A hands-on sandbox question is read and answered in writing, so the spoken-question
  // voice has nothing useful to say about it — `question_text` is only the problem title,
  // and the actual scenario lives in the sandbox panel. Announcing "Two Sum" aloud (and
  // offering a mute toggle for it) is noise, so both are suppressed for this question type.
  const isSandboxQuestion =
    activeQuestion?.question_type === 'coding_sandbox' && !!activeQuestion?.sandbox_problem_id;
  // MCQ round (§ MCQ round): single-select, answered by clicking an option — no voice/text
  // input, same reasoning as the sandbox suppression above.
  const isMcqQuestion = activeQuestion?.question_type === 'mcq';

  // Intro stage countdown — local only (nothing gradeable is at risk here, unlike the
  // per-question timer, so no server anchor is needed). Advances on whichever comes first:
  // this timer reaching 0, or the candidate clicking "Start Interview" (handleStartInterview).
  // Held at its starting value (introCountdownHeld) while INTRO_START_VOICE_MESSAGE is still
  // being spoken — see the announce effect below — so the candidate gets the full 60s to
  // actually read the screen instead of losing several seconds to the announcement.
  useEffect(() => {
    if (sessionStage !== 'intro' || introCountdownHeld) return undefined;
    if (introRemaining <= 0) {
      introShownRef.current = true;
      setSessionStage('questions');
      return undefined;
    }
    const t = setTimeout(() => setIntroRemaining((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [sessionStage, introRemaining, introCountdownHeld]);

  const handleStartInterview = () => {
    introShownRef.current = true;
    setSessionStage('questions');
  };

  // Sandbox-first placement (see the sessionStage declaration above): once the opening
  // sandbox question has been submitted (currentIdx moves off 0), show the welcome/rules
  // screen exactly once, before the rest of the questions begin. No-op for every other
  // candidate — sessionStage already opened on 'intro' for them.
  useEffect(() => {
    if (introShownRef.current || !openedWithSandbox) return;
    if (currentIdx < 1) return;
    introShownRef.current = true;
    setIntroRemaining(INTRO_DURATION_SECONDS);
    setSessionStage('ready');
  }, [currentIdx, openedWithSandbox]);

  // The 'ready' gate's own button — separate from handleStartInterview below, which starts the
  // INTERVIEW from the intro card. This one only advances from 'ready' into the intro card
  // itself, so the candidate gets a deliberate "about to begin" moment first.
  const handleReadyContinue = () => setSessionStage('intro');

  // Announce the welcome/rules screen the moment it first appears — whether that's at the very
  // start of the session or, for a sandbox-first candidate, right after the opening sandbox
  // question — with a spoken line plus a brief on-screen "Interview Started" banner, so the
  // transition into the session is clearly signalled rather than the card just silently
  // appearing. Fires at most once per session (introStartAnnouncedRef), since sessionStage only
  // ever becomes 'intro' once.
  useEffect(() => {
    if (sessionStage !== 'intro' || introStartAnnouncedRef.current) return undefined;
    introStartAnnouncedRef.current = true;
    setIntroStartToast(true);
    const toastTimer = setTimeout(() => setIntroStartToast(false), 3500);
    let safetyTimer = null;
    if (!isMuted) {
      // Hold the countdown, then release it the moment the line actually finishes — with a
      // safety-net timer in case onend/onerror never fires (some browsers are unreliable
      // here), so a speech-synthesis quirk can never permanently freeze the countdown.
      setIntroCountdownHeld(true);
      safetyTimer = setTimeout(() => setIntroCountdownHeld(false), 8000);
      speakPhrase(INTRO_START_VOICE_MESSAGE, {
        onEnd: () => {
          clearTimeout(safetyTimer);
          setIntroCountdownHeld(false);
        },
      });
    }
    return () => {
      clearTimeout(toastTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [sessionStage, isMuted]);

  // 1. Setup Session Timers
  useEffect(() => {
    const sTimer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);

    const fetchQuestions = async () => {
      try {
        const res = await api.get(`/interviews/${id}/details`);
        if (res.data.interview.status === 'completed') {
          navigate(`/interview/report/${id}`, { replace: true });
          return;
        }
        setQuestions(res.data.questions);
        const resumedIdx = res.data.responses_count || 0;
        setCurrentIdx(resumedIdx);
        // This branch only runs when the page had no navigation state to work from — i.e. a
        // reload/return mid-interview, not the initial redirect from the setup gate.
        if (resumedIdx > 0) {
          // Already past Question 1 (and, if this candidate opened on the sandbox, already
          // past the post-sandbox intro too) — the welcome screen must NOT replay on reload
          // (it used to, making an already-answered sandbox question appear to be followed by
          // "the intro").
          introShownRef.current = true;
          setSessionStage('questions');
        } else if (res.data.questions[0]?.question_type === 'coding_sandbox') {
          // Reloaded before answering anything, and this candidate opens on the sandbox — show
          // it directly instead of the default intro-first ordering (handled by the lazy
          // sessionStage initializer for the normal, non-reload redirect path).
          setSessionStage('questions');
        }
      } catch (err) {
        console.warn('Could not retrieve interview details:', err);
        setError('Failed to fetch active questions. Please return to Dashboard.');
      }
    };

    if (questions.length === 0) {
      fetchQuestions();
    }

    return () => {
      clearInterval(sTimer);
    };
  }, [id, questions.length, navigate]);

  // Detect Web Speech API availability once.
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSttSupported(!!SR);
  }, []);

  // 2. Play Warning Beep Alarm (Web Audio API). Accepts an optional distinct tone so a soft
  // nudge sounds audibly gentler/lower than a real counted violation, instead of the two
  // being indistinguishable by ear. Defaults (650Hz, 1.0s) are unchanged for every existing
  // hard-violation call site.
  const playBeepAlarm = (freq = 650, duration = 1.0) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (err) {
      console.warn('Audio Beep warning blocked or failed:', err);
    }
  };

  // Capture an un-mirrored JPEG frame from the live webcam as a base64 data URL.
  // Returns null if the camera isn't ready or capture fails. Used both for the
  // proctor-termination snapshot and the interview-completion snapshot (admin review).
  const captureSnapshot = () => {
    if (!videoRef.current) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      // Un-mirror raw video frames
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.65);
    } catch (err) {
      console.warn('Snapshot capture failed:', err);
      return null;
    }
  };

  // Grab a JPEG frame of the candidate's shared screen and file it in the proctoring
  // archive (Supabase folder tree, admin-only). No-op when screen sharing isn't active or
  // the interview is a regular mock. Rate-limited so overlapping events can't spam uploads.
  const captureAndUploadScreen = async (label = 'periodic') => {
    const vid = screenVideoRef.current;
    if (!vid || !vid.videoWidth || !hasScreenStream()) return;
    const now = Date.now();
    if (now - lastScreenShotRef.current < 1500) return; // min 1.5s between screenshots
    lastScreenShotRef.current = now;
    try {
      const canvas = document.createElement('canvas');
      // Cap width at 1280 to keep uploads light while staying legible.
      const scale = vid.videoWidth > 1280 ? 1280 / vid.videoWidth : 1;
      canvas.width = Math.round(vid.videoWidth * scale);
      canvas.height = Math.round(vid.videoHeight * scale);
      canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.6);
      await api.post(`/interviews/${id}/proctor-snapshot`, { image, kind: 'screen', label });
    } catch (err) {
      console.warn('Screen snapshot failed:', err);
    }
  };

  // Start screen monitoring when the session opens: play the shared-screen stream into a
  // hidden video, grab an initial frame, then a periodic screenshot every 25s. Suspicious
  // events (tab switch, violations) grab extra frames via captureAndUploadScreen. No-op for
  // regular mock interviews where no screen was shared.
  useEffect(() => {
    const stream = getScreenStream();
    // Attach the shared-screen stream to the hidden video so a frame can be grabbed later.
    // No periodic capture: a screenshot is taken only at the moment of termination (below),
    // so the archive stays simple — one snapshot per terminated session, not one per event.
    // Re-runs when questions finish loading (the <video> isn't in the DOM during the spinner).
    if (!stream || !screenVideoRef.current || screenVideoRef.current.srcObject) return;
    const vid = screenVideoRef.current;
    vid.srcObject = stream;
    vid.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  // ------------------------------------------------- Identity verification (§ identity)
  // File the baseline photo captured on the pre-interview gate against this interview, so
  // the admin can see exactly who was verified at the start.
  useEffect(() => {
    const image = getBaselineImage();
    if (!image || !questions.length || identityBaselineSentRef.current) return;
    identityBaselineSentRef.current = true;
    api.post(`/interviews/${id}/proctor-snapshot`, {
      image,
      kind: 'identity',
      label: 'identity-baseline',
    }).catch(() => {});
  }, [questions.length, id]);

  // Hard-terminate the session because the person on camera is no longer the verified
  // candidate. Deliberately separate from logProctorViolation: this does NOT touch the
  // 5-strike counter and gives no warning — it is an immediate block, and the backend
  // writes its own IDENTITY_VERIFICATION_FAILED admin log.
  const terminateForIdentity = async (distance) => {
    if (identityFailedRef.current) return;
    identityFailedRef.current = true;
    // Also latch the REGULAR proctoring termination guard. Without this, the ordinary
    // face/gaze/hands detection loops (which keep running independently of identity checking)
    // kept right on beeping, popping violation alerts, and could even race their own 5-strike
    // termination + navigate() at the same time as this one — a face swap naturally also looks
    // like a violation to MediaPipe (a brief no-face, or two faces in frame during the actual
    // hand-off), so this window was exactly when the regular proctoring loop was most likely to
    // fire. That produced the overlapping violation sound and the extra delay reported here —
    // two termination paths doing their own uploads/navigate at once, not one clean one.
    proctorTerminatedRef.current = true;
    setIdentityAlert('Identity check failed — the person on camera is not the verified candidate. This session is being terminated.');
    // Spoken the moment termination is decided (interrupts anything mid-utterance, same as the
    // 5-strike TERMINATION_VOICE_MESSAGE) rather than only showing the silent text banner.
    if (!isMuted) speakPhrase(IDENTITY_TERMINATION_VOICE_MESSAGE, { interrupt: true });
    const snapshot = captureSnapshot();
    try {
      await api.post(`/interviews/${id}/identity-failed`, {
        details: `Face on camera did not match the candidate verified at the start (distance ${distance.toFixed(3)}).`,
        snapshot_image: snapshot,
      });
    } catch (err) {
      console.error('Failed to report the identity failure:', err);
    }
    // Give the spoken line a moment to actually play before the redirect unmounts the page —
    // matches the 400ms used ahead of the 5-strike termination's navigate(). Kept short
    // deliberately: the api.post above already ran first and gave the voice a head start, so
    // this is just a small top-up, not the primary wait — on a slow/cold-started backend the
    // network call itself already took far longer than the voice line needs to finish playing.
    await new Promise((r) => setTimeout(r, 400));
    // Mirrors the 5-strike termination path below: flush the last recorder chunk with a short
    // bounded wait, THEN fire the full video finalize/upload in the BACKGROUND (not awaited).
    // This used to `await uploadSessionVideo()` directly — that call ends in a POST to
    // /finalize-video with up to a 180s timeout and up to 3 retries, which could keep the
    // candidate stuck on this termination screen for minutes while the video finished
    // assembling server-side. The slices are already safe in storage the moment they're
    // uploaded, so nothing is lost by not waiting here.
    await Promise.race([
      (async () => { await finalizeSessionVideo(); flushVideoPart(); await partQueueRef.current; })(),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    stopCamera();
    uploadSessionVideo();
    clearBaseline();
    navigate(`/interview/report/${id}`, { state: { proctorFailed: true }, replace: true });
  };

  // Periodically re-verify that the candidate on camera is still the one who passed the
  // identity check. Hang safety: the library and its models were already downloaded on the
  // pre-interview gate, a check runs only every 30s, and each one is a single small
  // inference — so this adds no meaningful load to the interview.
  useEffect(() => {
    const baseline = getBaselineDescriptor();
    if (!baseline || !questions.length) return undefined;

    let active = true;
    let timerId = null;

    const runCheck = async () => {
      if (!active || identityFailedRef.current) return;
      const vid = videoRef.current;
      if (cameraOn && vid && vid.readyState >= 2) {
        try {
          await loadFaceApi();
          const descriptor = await computeDescriptor(vid);
          if (descriptor) {
            const distance = descriptorDistance(descriptor, baseline);
            if (distance > IDENTITY_MATCH_THRESHOLD) {
              identityMismatchesRef.current += 1;
              if (identityMismatchesRef.current >= IDENTITY_MISMATCH_STRIKES) {
                await terminateForIdentity(distance);
                return;
              }
            } else {
              // Back to the right person — a single odd reading never accumulates.
              identityMismatchesRef.current = 0;
            }
          }
          // No descriptor means no face was found at all. That is already covered by the
          // NO_FACE proctoring check, so identity stays neutral instead of counting it as
          // a mismatch (otherwise looking away twice could terminate an honest candidate).
        } catch (err) {
          // A verification hiccup must never interrupt the interview.
          console.warn('Identity re-check skipped:', err);
        }
      }
      if (active) timerId = setTimeout(runCheck, IDENTITY_CHECK_INTERVAL_MS);
    };

    timerId = setTimeout(runCheck, IDENTITY_CHECK_INTERVAL_MS);
    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, cameraOn]);

  // 3. Send Proctor Log payload to backend (hard violation — counts toward termination)
  // No two hard violations may be counted closer together than this — a single lag spike
  // can make several independent checks (no-face, gaze, look-away) trip within the same
  // instant, and without this global gate they would stack into an immediate termination.
  // 3000ms was suppressing genuine back-to-back violations of DIFFERENT types (the second one
  // is dropped outright, not deferred), which read as "violations detected very late". 1500ms
  // still absorbs the burst of simultaneous trips that a single lag spike produces — the case
  // this gate exists for — while letting a real second violation register promptly.
  const VIOLATION_COOLDOWN_MS = 1500;

  // The session ends ON the 5th counted violation (4 warnings allowed). Mirrors the
  // backend's `> 4` check so the client can stop talking to the server the instant the
  // ceiling is reached, instead of only once the server's reply comes back.
  const MAX_VIOLATIONS = 5;

  // Replies to concurrent violation requests can arrive out of order, and an earlier
  // request's (lower) count landing after a later request's (higher) one would drag the
  // strike counter backwards — precisely the "jumps to 6, falls back to 4, then terminates"
  // behaviour seen just before termination. The count is therefore only ever allowed to move
  // forward; any reply that would lower it is discarded as stale.
  const applyServerViolationCount = (count) => {
    if (typeof count !== 'number') return;
    if (count < violationsCountRef.current) return;
    violationsCountRef.current = count;
    setViolationsCount(count);
  };

  const logProctorViolation = async (type, details) => {
    // Termination already confirmed by the server — the session is tearing down, so no
    // further violation (of any type) should beep, pop an alert, speak, or hit the server.
    // The second condition covers the window BEFORE that confirmation arrives: once the
    // local count has hit the ceiling the terminating request is already in flight, and any
    // violation sent alongside it is what raced past the maximum.
    if (proctorTerminatedRef.current || violationsCountRef.current >= MAX_VIOLATIONS) return;
    const now = Date.now();
    // Global cooldown across ALL violation types (prevents batched detections after a
    // freeze from counting 2–3 strikes at once and terminating the session instantly).
    // It also collapses the pair of events a single tab switch fires (visibilitychange AND
    // blur) into one strike, so this stays in force for every type.
    if (now - lastAnyViolationRef.current < VIOLATION_COOLDOWN_MS) {
      return;
    }
    // The 5s same-type throttle exists for CONTINUOUS conditions: the detection loop
    // re-reports "no face"/"looking away" every few hundred ms for as long as the state
    // lasts, and without it two seconds out of frame would burn every strike at once.
    //
    // It must NOT apply to discrete, deliberate actions. Switching tabs four times is four
    // separate offences, but under a blanket 5s throttle only the 1st and 4th were counted —
    // so the strike count stalled at 3, the 4th violation never reached the server, and the
    // session never terminated no matter how many times the candidate re-offended.
    const DISCRETE_ACTIONS = ['TAB_SWITCH', 'FOCUS_LOSS', 'COPY_PASTE', 'KEYBOARD_SHORTCUT', 'CAMERA_OFF'];
    if (!DISCRETE_ACTIONS.includes(type)) {
      if (lastViolationTimeRef.current[type] && now - lastViolationTimeRef.current[type] < 5000) {
        return;
      }
    }
    lastAnyViolationRef.current = now;
    lastViolationTimeRef.current[type] = now;

    // Spoken alerts for the hard/immediate violation types — piggyback on the throttle/dedup
    // work just done above so each fires once per violation, not continuously while the
    // condition stays true (MediaPipe re-reports several times a second). speakPhrase is
    // called without { interrupt: true }, so it never cancels an in-flight utterance — it
    // queues and always plays to completion. Every other violation type is unaffected.
    if (type === 'MULTIPLE_FACES' && !isMuted) {
      speakPhrase(MULTIPLE_FACES_VOICE_MESSAGE);
    }
    if (type === 'GAZE_AWAY' && !isMuted) {
      speakPhrase(GAZE_AWAY_VOICE_MESSAGE);
    }

    // Local warnings
    playBeepAlarm();
    setViolationAlert(`PROCTOR WARNING: ${details}`);
    setTimeout(() => setViolationAlert(''), 4000);

    // Bump the strike counter immediately rather than waiting for the server's reply. The
    // authoritative number still comes from the backend below and overwrites this the moment
    // it lands — but that round trip crosses regions (app in the US, database in Asia), so
    // relying on it alone left the alarm sounding while the count sat unchanged for a second
    // or more. The candidate now sees the strike register at the same instant they're warned.
    const optimisticCount = violationsCountRef.current + 1;
    violationsCountRef.current = optimisticCount;
    setViolationsCount(optimisticCount);

    // Capture the webcam frame for THIS violation. Archived per-violation below (every
    // violation — 1, 2, 3, 4 — gets its own snapshot saved to the proctoring DB), and also
    // passed to the proctor-log so the terminating violation still records it on the report.
    const snapshot = captureSnapshot();

    // Archive a snapshot for every violation (not just the terminating one): the webcam
    // frame plus the shared screen at this moment — exactly ONE of each per counted
    // violation, so N violations produce N webcam + N screen snapshots and nothing more.
    // Fire-and-forget so it never delays the violation flow.
    if (snapshot) {
      api.post(`/interviews/${id}/proctor-snapshot`, { image: snapshot, kind: 'webcam', label: type }).catch(() => {});
    }
    captureAndUploadScreen(`violation-${type}`);

    try {
      const res = await api.post(`/interviews/${id}/proctor-log`, {
        type,
        details,
        snapshot_image: snapshot
      });
      // Reconcile with the authoritative server count (replaces the optimistic bump above),
      // but only ever forwards — see applyServerViolationCount.
      applyServerViolationCount(res.data.violations_count);

      if (res.data.auto_terminate) {
        // Latch first — before speaking — so a violation the detection loops fire in the
        // next tick (they keep running until unmount) bails out immediately instead of
        // queuing another beep/phrase behind the termination line below.
        proctorTerminatedRef.current = true;
        // Final spoken message — interrupts anything queued (e.g. a look-away nudge from
        // moments earlier) since the interview is ending regardless. The teardown below
        // takes well over a second (this wait, then the video-flush race), so there's ample
        // time for it to actually play before the redirect unmounts the page.
        if (!isMuted) speakPhrase(TERMINATION_VOICE_MESSAGE, { interrupt: true });
        // The terminating violation's webcam + screen frames were already archived just
        // above, like every other violation — the server no longer files a duplicate
        // 'termination' copy.
        // Give those fire-and-forget uploads a brief moment to reach the server before we
        // tear the session down and navigate away.
        await new Promise((r) => setTimeout(r, 400));
        // Close the recorder and push the last slice BEFORE stopping the camera —
        // stopCamera() stops the very tracks the recorder reads from, so a recorder still
        // mid-flush loses its closing chunks. Everything before this slice is already
        // stored server-side, so this is seconds of footage, not the whole session, and
        // the wait is imperceptible.
        await Promise.race([
          (async () => { await finalizeSessionVideo(); flushVideoPart(); await partQueueRef.current; })(),
          // Never let a wedged recorder or a stalled upload hold a violating candidate on
          // a live session — whatever already reached the server is still assembled below.
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        stopCamera();
        // Assemble in the background: the slices are already safe in storage, so even if
        // this request dies with the tab the recording can still be joined afterwards.
        uploadSessionVideo();
        // Redirect directly with proctor violation flags
        navigate(`/interview/report/${id}`, { state: { proctorFailed: true }, replace: true });
      }
    } catch (err) {
      // The strike never reached the server, so undo the optimistic bump rather than leaving
      // the candidate looking at a count the backend doesn't actually hold. Guarded so a
      // reply that already corrected the value isn't pulled back down.
      if (violationsCountRef.current === optimisticCount) {
        const rolledBack = Math.max(0, optimisticCount - 1);
        violationsCountRef.current = rolledBack;
        setViolationsCount(rolledBack);
      }
      console.error('Failed to log violation to server:', err);
    }
  };

  // 3a. Camera toggle guard. Switching the camera off used to actually stop the feed — and
  // because every proctoring loop is gated on `cameraOn`, that silently disabled face, gaze,
  // hands, phone AND identity checking for the rest of the interview. So the camera is now
  // never allowed off during a session: the attempt is refused and counted straight away
  // through the normal violation flow (snapshot + strike + the existing 5-strike
  // termination), with no separate mechanism of its own.
  const handleCameraToggleAttempt = () => {
    if (!cameraOn) {
      setCameraOn(true);
      return;
    }
    logProctorViolation(
      'CAMERA_OFF',
      'Attempted to turn the camera off. The camera must stay on for the entire interview.'
    );
  };

  // 3b. Soft proctor warning (§4): logged for admin visibility, shown to the candidate,
  // but never increments the terminating counter — used for full-face-not-visible.
  const logSoftViolation = async (type, details) => {
    const now = Date.now();
    const key = `soft_${type}`;
    if (lastViolationTimeRef.current[key] && now - lastViolationTimeRef.current[key] < 6000) {
      return;
    }
    lastViolationTimeRef.current[key] = now;

    setSoftAlert(details);
    setTimeout(() => setSoftAlert(''), 4000);

    try {
      await api.post(`/interviews/${id}/proctor-log`, { type, details, soft: true });
    } catch (err) {
      console.error('Failed to log soft violation:', err);
    }
  };

  // 3c. Shared soft-warning pool (§ soft-warnings): LOOK_AWAY, HAND_DETECTED, and NO_FACE
  // each get a gentle, repeatable nudge — beep, popup, and their OWN spoken message — instead
  // of an immediate strike. Only after 4 of these accumulate IN TOTAL, in any mix of the
  // three types, does the triggering occurrence become one real, counted violation via the
  // existing logProctorViolation path. Counting is shared across types; messaging never is.
  const SOFT_VOICE_MESSAGES = {
    LOOK_AWAY: LOOK_AWAY_VOICE_MESSAGE,
    HAND_DETECTED: HAND_DETECTED_VOICE_MESSAGE,
    NO_FACE: NO_FACE_VOICE_MESSAGE,
  };

  const handleSoftWarning = (type, details) => {
    if (proctorTerminatedRef.current) return;
    const now = Date.now();
    // Throttle stays PER TYPE (not shared) — a HAND_DETECTED nudge must not suppress a
    // NO_FACE nudge moments later, only repeats of the SAME type within 6s. This is also
    // what keeps HAND_DETECTED/NO_FACE (which used to fire every MediaPipe frame via the
    // hard path) from spamming the beep/voice/popup now that they route through here.
    const key = `soft_${type}`;
    if (lastViolationTimeRef.current[key] && now - lastViolationTimeRef.current[key] < 6000) {
      return;
    }
    lastViolationTimeRef.current[key] = now;
    // Dedicated ref, NOT lastViolationTimeRef.current[type] — that key belongs exclusively
    // to logProctorViolation's own internal per-type throttle. Stamping it here too would
    // make that throttle see ~0ms elapsed on the escalating call below and silently skip
    // logging the violation. Only relevant to LOOK_AWAY — it's what checkEyeGaze reads to
    // avoid double-flagging one head-turn as both a soft LOOK_AWAY nudge and a hard GAZE_AWAY
    // violation; HAND_DETECTED/NO_FACE have nothing to do with that dedup.
    if (type === 'LOOK_AWAY') {
      lastLookAwayNudgeRef.current = now;
    }

    // Gentler/lower/shorter tone than the hard-violation alarm (which stays at its default
    // 650Hz/1.0s), so a soft nudge is audibly distinguishable from a real counted strike.
    playBeepAlarm(500, 0.4);
    setSoftAlert(details);
    setTimeout(() => setSoftAlert(''), 4000);
    if (!isMuted && SOFT_VOICE_MESSAGES[type]) {
      speakPhrase(SOFT_VOICE_MESSAGES[type]);
    }

    if (sharedSoftAccumulatorRef.current.register()) {
      // 4th nudge across the shared pool — escalate to one real, counted violation.
      // logProctorViolation logs its own (hard) entry, so the soft proctor-log POST below is
      // deliberately skipped for this occurrence to avoid two rows for the same moment.
      logProctorViolation(type, details);
    } else {
      api.post(`/interviews/${id}/proctor-log`, { type, details, soft: true }).catch(() => {});
    }
  };

  // 4. Client-side browser event monitors (Tabs, window, copy-paste)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        logProctorViolation('TAB_SWITCH', 'Candidate switched browser tabs or minimized window.');
      }
    };

    const handleBlur = () => {
      logProctorViolation('FOCUS_LOSS', 'Exited the active interview focus window.');
    };

    const handleCopyPaste = (e) => {
      e.preventDefault();
      logProctorViolation('COPY_PASTE', 'Blocked attempt to use clipboard (copy/paste/cut).');
    };

    const handleKeydown = (e) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (
        (isCtrlOrCmd && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'i')
      ) {
        e.preventDefault();
        logProctorViolation('KEYBOARD_SHORTCUT', `Attempted blocked key combination: ${e.key}`);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('cut', handleCopyPaste);
    window.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('cut', handleCopyPaste);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [id]);

  // 5. Dynamic Script Loader helper
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  // Recording failures are an infrastructure issue, never candidate misconduct — logged
  // through the same soft, uncounted proctor-log channel already used for CAMERA_STALL, so
  // an admin looking at an interview with no video can see why instead of it just being
  // silently absent.
  //
  // Guarded to fire ONCE per session: there are three call sites for this (no supported
  // mimeType / constructor throw at start, rec.onerror mid-session, and the end-of-session
  // "zero parts uploaded" check) that can all be different symptoms of the SAME underlying
  // failure — e.g. no recorder ever existed, so both the start-time check and the end-time
  // zero-parts check would otherwise each log their own entry for one real failure. Whichever
  // detects it first wins; the rest are no-ops.
  const recordingUnavailableReportedRef = useRef(false);
  // Separate latch: a truncated recording is a different fact from no recording at all, and
  // one must not consume the other's single-fire slot.
  const recordingTruncatedReportedRef = useRef(false);
  const reportRecordingFailure = (details) => {
    if (recordingUnavailableReportedRef.current) return;
    recordingUnavailableReportedRef.current = true;
    api.post(`/interviews/${id}/proctor-log`, {
      type: 'RECORDING_UNAVAILABLE',
      details,
      soft: true,
    }).catch(() => {});
  };

  // 6. MediaPipe AI Camera & FaceMesh initialization
  useEffect(() => {
    let active = true;
    let animationFrameId = null;
    let timeoutId = null;

    const startCameraAndProctoring = async () => {
      try {
        // Fresh recovery state for this camera session.
        cameraStalledRef.current = false;
        cameraLostRef.current = false;
        recoveryAttemptsRef.current = 0;
        setCameraReconnecting(false);
        setCameraLost(false);

        // Request webcam stream
        // Requesting camera + mic together, in the ONE call, so there is only ever a single
        // permission negotiation (not two sequential ones) — that matters because the second
        // negotiation was found to stall indefinitely if the tab lost focus while it was
        // pending (e.g. testing TAB_SWITCH), which silently blocked proctoring/recording from
        // ever starting. The <video> preview below is `muted`, so carrying an audio track on
        // it causes no echo/feedback.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true
        });

        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (e) {
            console.log("Video playback started:", e);
          }
        }
        // Watch this stream's track for explicit device loss (driver glitch, sleep, unplug).
        // This only ever re-acquires the stream — it never touches detection thresholds or
        // violation logic.
        attachTrackWatch(stream);

        // Start the session recording on the first camera stream only (§2) — a camera
        // re-toggle would otherwise produce a second WebM segment that can't be joined.
        // Exception: if a previous recorder died having captured only a ~stub (StrictMode's
        // dev double-mount, or an instant camera flick), discard the stub and start fresh.
        const prev = sessionRecorderRef.current;
        const isDeadStub = prev && prev.state === 'inactive'
          && sessionChunksRef.current.length < 3 && !videoUploadedRef.current;
        if (isDeadStub) {
          sessionRecorderRef.current = null;
          sessionChunksRef.current = [];
        }
        if (!sessionRecorderRef.current) {
          // Verified capability check instead of a hardcoded mimeType: the old fixed
          // 'video/webm' silently failed the MediaRecorder constructor on any browser that
          // didn't accept that exact string (Safari has no WebM support at all), and the
          // try/catch around it swallowed the failure into a console.warn nobody ever saw —
          // the interview ran fine end-to-end with simply no recording produced.
          const mimeType = pickSessionRecorderMimeType();
          if (!mimeType) {
            console.warn('Session video recording unavailable: no supported WebM mimeType.');
            reportRecordingFailure(
              'This browser does not support any recordable video format — the session was not recorded.'
            );
          } else {
            try {
              // `stream` already carries both the video and mic audio tracks (requested
              // together above), so the recording captures the candidate's voice too —
              // nothing extra to wire up here.
              const rec = new MediaRecorder(stream, {
                mimeType,
                // Lowered from 600kbps after a real production failure: a 65.5MB recording
                // (~14.6 min at 600kbps, an entirely ordinary interview length) was refused
                // by Supabase Storage's 50MB per-object cap (Config.MAX_RECORDING_UPLOAD_BYTES,
                // backend/app/config/config.py). 150kbps (~1.1MB/min) keeps even a ~40-minute
                // session comfortably under that cap, while staying watchable enough for its
                // actual purpose — proctoring/audit review, not primary playback.
                videoBitsPerSecond: 150_000,
              });
              rec.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                  sessionChunksRef.current.push(e.data);
                  pendingPartChunksRef.current.push(e.data);
                }
              };
              // Catches a failure AFTER recording has already started (e.g. the encoder
              // dying mid-session) — the constructor throwing is handled by the catch below,
              // but a live recorder erroring out later had no handler at all before this.
              rec.onerror = (e) => {
                console.warn('Session recorder error:', e);
                reportRecordingFailure(
                  `The session recorder failed mid-interview: ${e?.error?.message || e?.error?.name || 'unknown error'}.`
                );
              };
              rec.start(1000);
              sessionRecorderRef.current = rec;
              recorderMimeTypeRef.current = rec.mimeType || mimeType;
              // Ship what has been captured every 30s, so the recording is already almost
              // entirely on the server before the session ends.
              if (partFlushTimerRef.current) clearInterval(partFlushTimerRef.current);
              partFlushTimerRef.current = setInterval(flushVideoPart, VIDEO_PART_INTERVAL_MS);
            } catch (e) {
              console.warn('Session video recording unavailable:', e);
              reportRecordingFailure(
                `The session recorder could not start: ${e?.message || e?.name || 'unknown error'}.`
              );
            }
          }
        }

        // Load MediaPipe FaceMesh script
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');

        if (!active) return;

        if (window.FaceMesh) {
          const faceMesh = new window.FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });

          faceMesh.setOptions({
            maxNumFaces: 2,
            // Iris refinement adds landmarks 468-477 (both irises), which is what makes
            // eye/gaze tracking possible (§1.2). It costs extra inference per frame, so the
            // gaze evaluation itself is throttled below and degrades gracefully to the
            // existing checks if these landmarks are ever unavailable.
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });

          faceMesh.onResults((results) => {
            if (!active) return;
            handleProctoringResults(results);
          });

          // Optional Hands model: detects hands raised in front of the screen.
          // Loaded in its own try/catch so any failure here never disrupts the
          // face-based proctoring above.
          let handsModel = null;
          try {
            await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
            if (active && window.Hands) {
              handsModel = new window.Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
              });
              handsModel.setOptions({
                maxNumHands: 2,
                modelComplexity: 0,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
              });
              handsModel.onResults((results) => {
                if (!active) return;
                handleHandResults(results);
              });
            }
          } catch (e) {
            console.warn('MediaPipe Hands unavailable; face proctoring continues.', e);
          }

          // Custom frame loop. Each cycle awaits its inference, so the loop can never queue
          // work faster than the device clears it — the gap below is just breathing room for
          // the browser to paint the video and run the UI. With the phone model gone there is
          // enough headroom to keep this gap short, which is what makes hand/eye/face warnings
          // fire promptly instead of lagging behind the candidate.
          let frameTick = 0;
          const processFrame = async () => {
            if (!active) return;
            if (cameraOn && videoRef.current && videoRef.current.readyState >= 2) {
              try {
                await faceMesh.send({ image: videoRef.current });
                // NOTE: deliberately no "still alive" heartbeat here. Frame-loop progress
                // reflects main-thread availability, not camera health, so using it to judge
                // the camera produced false stalls during heavy model work.
                // Hands on alternating cycles: frequent enough that a raised hand is caught
                // in well under a second, while keeping the per-cycle cost roughly halved.
                if (handsModel && frameTick % 2 === 0) {
                  await handsModel.send({ image: videoRef.current });
                }
              } catch {
                // Ignore transient frame send failures
              }
            }
            frameTick += 1;
            setTimeout(() => {
              animationFrameId = requestAnimationFrame(processFrame);
            }, 120);
          };

          animationFrameId = requestAnimationFrame(processFrame);
          setProctoringActive(true);

          // NOTE: phone/object detection (TensorFlow.js + COCO-SSD) was removed from the
          // interview. It was by far the heaviest thing on the page — a separate model
          // download plus a repeated inference that blocked the main thread, and because the
          // video element renders on that same thread the camera visibly froze each time.
          // Removing it is what makes the feed smooth and lets the face/gaze/hands warnings
          // fire promptly. Everything else is unchanged: face count, look-away, eye/gaze,
          // hands, and identity verification all still run.
        }
      } catch (err) {
        console.warn('MediaPipe initialization failed. Proctoring is active but running on fallback system event monitors.', err);
      }
    };

    // --- Camera loss recovery (§ reliability) -------------------------------------------
    // Re-acquires the stream ONLY when the browser itself reports the device is gone. Never
    // changes detection thresholds, violation logic, or the terminating counter. On repeated
    // failure the interview continues and the unproctored gap is flagged for admin review
    // rather than halting the candidate.
    const MAX_RECOVERY_ATTEMPTS = 3;

    const attachTrackWatch = (mediaStream) => {
      const track = mediaStream.getVideoTracks()[0];
      if (!track) return;
      // 'ended' is terminal — the device is gone and will never come back on this track.
      track.onended = () => { if (active) recoverCamera('the camera turned off'); };
      // 'mute' is NOT terminal: browsers fire it for brief interruptions that very often
      // resolve themselves a moment later (an 'unmute' follows). Reconnecting on the first
      // mute is what produced needless "reconnecting" flashes, so wait out a grace period
      // and only act if the feed is still muted by the end of it.
      track.onmute = () => {
        if (!active) return;
        if (muteGraceTimerRef.current) clearTimeout(muteGraceTimerRef.current);
        muteGraceTimerRef.current = setTimeout(() => {
          muteGraceTimerRef.current = null;
          if (active && track.readyState !== 'ended' && track.muted) {
            recoverCamera('the camera feed was interrupted');
          }
        }, 3000);
      };
      track.onunmute = () => {
        // Self-healed — cancel the pending recovery entirely.
        if (muteGraceTimerRef.current) {
          clearTimeout(muteGraceTimerRef.current);
          muteGraceTimerRef.current = null;
        }
      };
    };

    const recoverCamera = async (reason) => {
      if (!active || !cameraOn) return;
      if (cameraStalledRef.current || cameraLostRef.current) return; // already handling
      cameraStalledRef.current = true;
      setCameraReconnecting(true);
      // Log ONCE as a technical incident (soft) — appears as a technical note on the report,
      // never as candidate misconduct, and never touches the terminating counter.
      api.post(`/interviews/${id}/proctor-log`, {
        type: 'CAMERA_STALL',
        details: `Camera feed interrupted (${reason}); attempting to reconnect.`,
        soft: true,
      }).catch(() => {});

      while (active && cameraOn && recoveryAttemptsRef.current < MAX_RECOVERY_ATTEMPTS) {
        recoveryAttemptsRef.current += 1;
        try {
          // Fully release the old stream FIRST. This is mandatory, not optional: a frozen
          // camera often still reports readyState 'live', and leaving that track open keeps
          // the OS device handle held — so the getUserMedia() below cannot acquire the very
          // camera it is trying to reopen, and recovery stalls instead of recovering.
          // (Skipping this for live tracks, to try to spare the MediaRecorder, is exactly
          // what turned a brief reconnect into a repeating hang.) The recording is protected
          // by not reaching this path spuriously in the first place — recovery now only runs
          // on a genuine 'ended'/sustained-'mute' signal — and whatever the recorder already
          // captured is retained in sessionChunksRef and still uploaded at session end.
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          const fresh = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }, audio: false,
          });
          if (!active || !cameraOn) { fresh.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = fresh;
          if (videoRef.current) {
            videoRef.current.srcObject = fresh;
            try { await videoRef.current.play(); } catch {}
          }
          attachTrackWatch(fresh);
          // The frame loop reads videoRef.current every cycle, so detection resumes on the
          // new stream automatically once readyState recovers — nothing to restart.
          //
          // The session RECORDER, however, is bound to the stream whose tracks were just
          // stopped above, so it stops producing data from here on: the recording ends at
          // this moment even though the interview continues. It is deliberately not restarted
          // on `fresh` — a second MediaRecorder writes a new WebM header, and the server
          // assembles slices by raw byte concatenation, so appending a second segment yields
          // a file most players stop playing at the seam. Recording the truncation as a
          // technical note is the honest option; silently returning a recording that ends
          // early with no explanation is what made this look like "recording just doesn't
          // work sometimes".
          if (!recordingTruncatedReportedRef.current && sessionRecorderRef.current) {
            recordingTruncatedReportedRef.current = true;
            api.post(`/interviews/${id}/proctor-log`, {
              type: 'RECORDING_TRUNCATED',
              details: `The camera was re-acquired after ${reason}; the session recording ends at this point and does not cover the remainder of the interview.`,
              soft: true,
            }).catch(() => {});
          }
          recoveryAttemptsRef.current = 0;
          cameraStalledRef.current = false;
          setCameraReconnecting(false);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      // Attempts exhausted: continue but make the unproctored gap visible and flagged.
      if (active && cameraOn) {
        cameraLostRef.current = true;
        setCameraReconnecting(false);
        setCameraLost(true);
        api.post(`/interviews/${id}/proctor-log`, {
          type: 'CAMERA_UNRECOVERABLE',
          details: 'Camera feed could not be restored after multiple attempts; the interview '
            + 'continued but was temporarily unproctored. Flagged for admin review.',
          soft: true,
        }).catch(() => {});
      }
      cameraStalledRef.current = false;
    };

    if (cameraOn) {
      // Add a 500ms delay to allow setup page to completely release the camera device lock
      timeoutId = setTimeout(() => {
        if (active) {
          startCameraAndProctoring();
        }
      }, 500);
    } else {
      stopCamera();
    }

    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (muteGraceTimerRef.current) {
        clearTimeout(muteGraceTimerRef.current);
        muteGraceTimerRef.current = null;
      }
      stopCamera();
    };
  }, [cameraOn]);

  const stopCamera = () => {
    // No more frames will be captured, so the periodic slice upload has nothing left to do.
    // Any already-captured chunks are flushed explicitly by the caller before this point.
    if (partFlushTimerRef.current) {
      clearInterval(partFlushTimerRef.current);
      partFlushTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // The interview is ending — stop screen monitoring too so the browser's "sharing your
    // screen" indicator clears and no further screenshots are taken.
    if (screenTimerRef.current) {
      clearInterval(screenTimerRef.current);
      screenTimerRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    clearScreenStream();
  };

  // 7. Process MediaPipe Face Landmarks (Face counts / gaze / full-face framing)
  const handleProctoringResults = (results) => {
    const faces = results.multiFaceLandmarks || [];

    // Multiple Person Detection
    if (faces.length >= 2) {
      faceBadSinceRef.current = null;
      logProctorViolation('MULTIPLE_FACES', 'Multiple people detected in front of the camera.');
      return;
    }

    // No Face Detection — soft, feeds the shared warning pool (§ soft-warnings)
    if (faces.length === 0) {
      faceBadSinceRef.current = null;
      handleSoftWarning('NO_FACE', 'No face detected. Please look directly into the camera.');
      return;
    }

    const landmarks = faces[0];

    // Full-face visibility check (§4, soft): the face must be well-framed — not tiny/far
    // and not clipped by the frame edges. Requires the condition to persist ~2s before
    // warning, so momentary seat adjustments don't produce false positives.
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of landmarks) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const faceW = maxX - minX;
    const faceH = maxY - minY;
    const tooSmall = faceW < 0.14 || faceH < 0.18;          // face too far from camera
    const clipped = minX < 0.03 || maxX > 0.97 || minY < 0.02 || maxY > 0.98; // out of frame
    if (tooSmall || clipped) {
      if (!faceBadSinceRef.current) {
        faceBadSinceRef.current = Date.now();
      } else if (Date.now() - faceBadSinceRef.current > 2000) {
        const reason = tooSmall
          ? 'Please look into your camera and move closer — your face needs to be clearly visible.'
          : 'Please look into your camera — your full face needs to be clearly visible and centered.';
        logSoftViolation('FULL_FACE', reason);
      }
    } else {
      faceBadSinceRef.current = null;
    }

    // Face look-away / Gaze tracking (§ soft-warnings: soft nudge that escalates after 4)
    if (landmarks && landmarks.length > 263) {
      const nose = landmarks[4];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];

      const distance = Math.abs(rightEye.x - leftEye.x);
      if (distance > 0) {
        const noseOffset = (nose.x - leftEye.x) / distance;

        // Balanced center is ~0.5. Left or right lookaways skew this:
        if (noseOffset < 0.33 || noseOffset > 0.67) {
          handleSoftWarning('LOOK_AWAY', 'Turned head or looked away from the monitor.');
        }
      }
    }

    // Eye / gaze tracking (§1) — runs last so the LOOK_AWAY suppression below sees any
    // head-turn already logged for this frame.
    checkEyeGaze(landmarks);
  };

  // 7a-bis. Eye/gaze proctoring (§1.3, soft): uses the iris landmarks added by
  // refineLandmarks to estimate where the eyes are looking and whether they're open.
  // Deliberately tolerant — a candidate glancing down to think is normal and must not be
  // flagged, so a warning needs GAZE_AWAY_MS of *continuous* off-screen gaze.
  const GAZE_AWAY_MS = 1000;      // near-direct: ~1s off-screen counts (short enough to feel instant, long enough to ignore a blink)
  const EYES_CLOSED_MS = 4000;    // eyes closed/undetectable for this long
  const GAZE_CHECK_INTERVAL_MS = 120;  // throttle: gaze math ~8x/sec, not every frame

  const checkEyeGaze = (landmarks) => {
    // Iris landmarks (468-477) only exist when refineLandmarks is on. If they're missing
    // for any reason, skip gaze entirely — every existing check keeps working.
    if (!landmarks || landmarks.length < 478) return;

    const now = Date.now();
    if (now - lastGazeCheckRef.current < GAZE_CHECK_INTERVAL_MS) return;
    lastGazeCheckRef.current = now;

    // Don't double-flag a head turn: if LOOK_AWAY just fired (soft nudge or escalated),
    // that behaviour is already being handled, so stay quiet and reset the gaze clock.
    // Reads the dedicated lastLookAwayNudgeRef (not lastViolationTimeRef) since LOOK_AWAY
    // now only touches lastViolationTimeRef on the rare escalating occurrence.
    const lastLookAway = lastLookAwayNudgeRef.current || 0;
    if (now - lastLookAway < 5000) {
      gazeAwaySinceRef.current = null;
      return;
    }

    // Eye openness via a vertical/horizontal ratio (eye-aspect-ratio style). Averaged
    // across both eyes so one partially occluded eye doesn't trip it.
    const eyeOpenRatio = (topIdx, bottomIdx, leftIdx, rightIdx) => {
      const h = Math.abs(landmarks[bottomIdx].y - landmarks[topIdx].y);
      const w = Math.abs(landmarks[rightIdx].x - landmarks[leftIdx].x);
      return w > 0 ? h / w : 1;
    };
    const openness = (eyeOpenRatio(159, 145, 33, 133) + eyeOpenRatio(386, 374, 362, 263)) / 2;

    if (openness < 0.12) {
      if (!eyesClosedSinceRef.current) {
        eyesClosedSinceRef.current = now;
      } else if (now - eyesClosedSinceRef.current > EYES_CLOSED_MS) {
        logSoftViolation('EYES_NOT_VISIBLE', 'Please look into your camera — your eyes need to be clearly visible.');
        eyesClosedSinceRef.current = now; // re-arm rather than repeating every frame
      }
      gazeAwaySinceRef.current = null;  // can't judge gaze with closed eyes
      return;
    }
    eyesClosedSinceRef.current = null;

    // Gaze position: where each iris centre sits inside its own eye opening. ~0.5 on both
    // axes means looking straight at the camera/screen.
    const gazeRatio = (irisIdx, leftIdx, rightIdx, topIdx, bottomIdx) => {
      const iris = landmarks[irisIdx];
      const l = landmarks[leftIdx], r = landmarks[rightIdx];
      const t = landmarks[topIdx], b = landmarks[bottomIdx];
      const w = r.x - l.x;
      const h = b.y - t.y;
      return {
        h: w !== 0 ? (iris.x - l.x) / w : 0.5,
        v: h !== 0 ? (iris.y - t.y) / h : 0.5,
      };
    };
    const left = gazeRatio(468, 33, 133, 159, 145);
    const right = gazeRatio(473, 362, 263, 386, 374);
    const hAvg = (left.h + right.h) / 2;
    const vAvg = (left.v + right.v) / 2;

    // Bounds: a clear look to the side/up/down off the screen counts. Horizontal is made
    // fairly sensitive so a sideways glance at notes/another screen is caught; vertical is
    // looser because eyelid geometry makes the vertical ratio noisier.
    const lookingAway = hAvg < 0.36 || hAvg > 0.64 || vAvg < 0.20 || vAvg > 0.82;

    if (lookingAway) {
      if (!gazeAwaySinceRef.current) {
        gazeAwaySinceRef.current = now;
      } else if (now - gazeAwaySinceRef.current > GAZE_AWAY_MS) {
        // Sustained (GAZE_AWAY_MS) look off the screen — hard/immediate, same tier as
        // MULTIPLE_FACES: every occurrence is a real, counted violation right away. Does NOT
        // go through the shared soft pool. The GAZE_AWAY_MS window still keeps a blink or
        // micro-glance from tripping it.
        logProctorViolation('GAZE_AWAY', 'Looked away from the screen during the interview.');
        gazeAwaySinceRef.current = now; // re-arm for the next continuous window
      }
    } else {
      gazeAwaySinceRef.current = null;
    }
  };

  // 7b. Process MediaPipe Hand Landmarks (hands raised in front of the screen/camera) — soft,
  // feeds the shared warning pool (§ soft-warnings). MediaPipe only reports a hand when its
  // own confidence is met, so any detected hand is flagged — no size gate — so a hand
  // entering the frame is caught the moment it appears. handleSoftWarning's own 6s per-type
  // throttle (not a separate gate here) is what stops this alternating-frame callback
  // (~4x/sec) from spamming a beep/voice every cycle while a hand stays up.
  const handleHandResults = (results) => {
    const hands = results.multiHandLandmarks || [];
    if (hands.length > 0) {
      handleSoftWarning('HAND_DETECTED', 'Hand detected in front of the camera. Keep your hands out of view.');
    }
  };

  // Human-readable badge for each question type, including the four coding formats
  // (Coding Formats §2.2) which would otherwise render as raw snake_case.
  const QUESTION_TYPE_LABELS = {
    coding_scenario: 'Coding Scenario',
    coding_logic: 'Logic & Approach',
    coding_concept: 'Technical Concept',
    coding_debug: 'Debugging',
  };
  const questionTypeLabel = (type) =>
    QUESTION_TYPE_LABELS[type] || `${type || 'Interview'} Question`;

  const formatTime = (secs) => {
    const s = Math.max(0, secs || 0);
    const mins = Math.floor(s / 60);
    const remainingSecs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // ------------------------------------------------------------------ Timer (§2)
  // Anchor the server-side clock for the active question, then run a visual countdown
  // synced to the server's authoritative remaining time. On expiry, auto-submit whatever
  // has been captured so far (a skip if empty) and advance.
  const clearCountdown = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startQuestionTimer = async (question) => {
    clearCountdown();
    setRemaining(null);
    setTimeLimit(question.time_limit_seconds || null);
    timerQuestionRef.current = question.id;
    try {
      const res = await api.post(`/interviews/${id}/start-question`, { question_id: question.id });
      const rem = res.data.remaining_seconds;
      setTimeLimit(res.data.time_limit_seconds);
      setRemaining(rem);
      if (rem <= 0) {
        handleAutoSubmit();
        return;
      }
    } catch {
      // If anchoring fails, fall back to the client-provided limit so the interview still runs.
      setRemaining(question.time_limit_seconds || 120);
    }

    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearCountdown();
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // When the active question changes, reset the answer state and (re)start its timer.
  //
  // Gated on sessionStage === 'questions': activeQuestion is already set (from the redirect's
  // own question list, or after the opening sandbox) WHILE the welcome/intro screen is still
  // showing, and this effect keys off currentIdx alone — so without this gate it fired the
  // instant the page mounted, anchoring and counting down the first question's 4-minute timer
  // in the background before the candidate had even left the intro screen. sessionStage is
  // in the dependency array so the timer starts fresh the moment intro actually ends (button
  // click or its own countdown), not before.
  useEffect(() => {
    if (!activeQuestion || sessionStage !== 'questions') return undefined;
    // reset per-question answer state
    liveTranscriptRef.current = '';
    setLiveTranscript('');
    setInterimText('');
    setTypedAnswer('');
    selectedMcqOptionRef.current = null;
    setSelectedMcqOption(null);
    audioChunksRef.current = [];
    setHasRecorded(false);
    faceBadSinceRef.current = null;
    // Reset eye/gaze state too, so a warning can't carry over between questions (§1).
    gazeAwaySinceRef.current = null;
    eyesClosedSinceRef.current = null;
    startQuestionTimer(activeQuestion);

    return () => clearCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, questions.length, sessionStage]);

  // ------------------------------------------------------------------ Voice capture (§3)
  const getSpeechRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          liveTranscriptRef.current = `${liveTranscriptRef.current} ${chunk}`.trim();
          setLiveTranscript(liveTranscriptRef.current);
          setInterimText('');
        } else {
          interim += chunk;
        }
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (e) => {
      // 'no-speech'/'aborted' are benign; log others.
      if (e.error && !['no-speech', 'aborted'].includes(e.error)) {
        console.warn('SpeechRecognition error:', e.error);
      }
    };

    recognition.onend = () => {
      // Chrome stops recognition periodically; restart while the mic is still active.
      if (micActiveRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    return recognition;
  };

  const startMic = async () => {
    setError('');
    try {
      // One continuous audio stream + recorder per question; mic toggle pauses/resumes it
      // so multiple on/off cycles accumulate into a single answer (§3.2).
      if (!audioStreamRef.current) {
        audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      // getUserMedia itself failed — this IS a genuine permission/device problem, unlike the
      // recorder-construction failure handled separately below.
      console.error('Mic access error:', err);
      setError('Could not access microphone. Please allow microphone access in your browser and try again — voice is required for this interview.');
      return;
    }

    // Recorder construction and live captions are independent capabilities — one failing must
    // never block the other, and neither failing should be reported as "microphone access"
    // (permission was already granted above by the time either of these run).
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      try {
        const mimeType = pickAnswerRecorderMimeType();
        if (!mimeType) {
          console.warn('Answer recording unavailable: no supported audio mimeType.');
        } else {
          const mr = new MediaRecorder(audioStreamRef.current, { mimeType });
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          mediaRecorderRef.current = mr;
          answerRecorderMimeTypeRef.current = mr.mimeType || mimeType;
          mr.start(500);
        }
      } catch (e) {
        console.warn('Answer recorder could not start; live captions still apply if supported.', e);
      }
    } else if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }

    // Live captions via the browser Web Speech API (best-effort; Whisper stays authoritative).
    if (sttSupported) {
      if (!recognitionRef.current) recognitionRef.current = getSpeechRecognition();
      try { if (recognitionRef.current) recognitionRef.current.start(); } catch { /* already running */ }
    }

    micActiveRef.current = true;
    setMicActive(true);
    setIsRecording(true);
    setHasRecorded(true);
  };

  const stopMic = () => {
    micActiveRef.current = false;
    setMicActive(false);
    setIsRecording(false);
    // Pause (not stop) the recorder so we can resume into the same answer.
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
      }
    } catch { /* ignore */ }
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch { /* ignore */ }
    setInterimText('');
  };

  const toggleMic = () => {
    if (micActive) stopMic();
    else startMic();
  };

  // Fully stop + release the audio pipeline (on submit / unmount).
  const teardownAudio = () => {
    micActiveRef.current = false;
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch { /* ignore */ }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
  };

  // Assemble the recorded audio (across pause/resume cycles) into one blob. The Blob's type
  // must be whatever pickAnswerRecorderMimeType actually negotiated (answerRecorderMimeTypeRef)
  // — labelling it 'audio/webm' regardless of the real encoding, as this used to, sent Whisper
  // a file whose declared container didn't match its actual bytes on any browser that fell back
  // to a non-webm format.
  const finalizeAudioBlob = () => {
    const blobType = answerRecorderMimeTypeRef.current || 'audio/webm';
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: blobType }) : null);
        return;
      }
      mr.onstop = () => {
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: blobType }) : null);
      };
      try { mr.stop(); } catch {
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: blobType }) : null);
      }
    });
  };

  // ---------------------------------------------------- Session video (DB Integration §2)
  // Stop the session recorder and assemble everything captured into one WebM blob.
  // Send everything captured since the last flush as one numbered slice. Uploads are
  // chained rather than fired in parallel so slices always arrive in order — the server
  // joins them by index, and an out-of-order join produces an unplayable file.
  const flushVideoPart = useCallback(() => {
    const chunks = pendingPartChunksRef.current;
    if (!chunks.length) return partQueueRef.current;
    pendingPartChunksRef.current = [];
    const blob = new Blob(chunks, { type: 'video/webm' });
    const index = partIndexRef.current++;

    partsAttemptedRef.current += 1;
    partQueueRef.current = partQueueRef.current.then(async () => {
      // Two attempts (mirrors the retry already used for /finalize-video below) so one
      // transient network blip doesn't drop a slice outright — a real, sustained failure
      // still gives up rather than blocking every later slice behind it.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const fd = new FormData();
          fd.append('part_index', String(index));
          fd.append('video', blob, `part_${index}.webm`);
          await api.post(`/interviews/${id}/upload-video-part`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
          });
          partsUploadedRef.current += 1;
          return;
        } catch (err) {
          const reason = err?.response?.data?.detail || err?.response?.status || err.message;
          lastPartUploadErrorRef.current = String(reason);
          console.warn(`Video part ${index} upload attempt ${attempt} failed:`, reason);
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        }
      }
      // Losing one slice must not stop later ones: the rest of the recording is still
      // worth keeping, and a gap is far better than no recording at all.
    });
    return partQueueRef.current;
  }, [id]);

  const finalizeSessionVideo = () => {
    return new Promise((resolve) => {
      const rec = sessionRecorderRef.current;
      const assemble = () =>
        resolve(sessionChunksRef.current.length
          ? new Blob(sessionChunksRef.current, { type: 'video/webm' })
          : null);
      if (!rec || rec.state === 'inactive') {
        assemble();
        return;
      }
      rec.onstop = assemble;
      try { rec.stop(); } catch { assemble(); }
    });
  };

  // Upload the finished session recording with retries (§2.2 reliability). Failures are
  // logged and swallowed — the candidate's flow is never blocked by a lost recording,
  // and the backend leaves video_path NULL so the admin sees the truth.
  const uploadSessionVideo = async () => {
    if (videoUploadedRef.current) return;
    videoUploadedRef.current = true; // one finalize cycle per session

    setSavingVideo(true);
    try {
      // Close the recorder so its last slice is emitted, then push whatever is still
      // pending. Every earlier slice is already on the server, so this final transfer is
      // seconds of footage rather than the whole session — which is precisely why it can
      // now survive the candidate being redirected away.
      await finalizeSessionVideo();
      flushVideoPart();
      await partQueueRef.current;

      if (partsUploadedRef.current === 0) {
        // Nothing reached the server at all (camera never started, or every slice failed).
        // There is nothing to assemble, and asking the server to try would just record a
        // misleading failure. This used to be a console.error only — invisible to anyone —
        // and because finalize-video is never even called below, the backend's own
        // RecordingLog failure trail never got written either, so a total capture failure
        // had literally no trace anywhere. Report it explicitly now.
        console.error('No session recording slices were stored — nothing to finalize.', {
          capturedChunks: sessionChunksRef.current.length,
          partsAttempted: partsAttemptedRef.current,
          mimeType: recorderMimeTypeRef.current,
          lastUploadError: lastPartUploadErrorRef.current,
        });
        // Two very different faults end up here, and the note has to say which one it was:
        // either the browser never produced a single frame (capture-side — codec/permission/
        // device), or capture worked fine and every upload was rejected (transport-side —
        // network or storage). Reporting them identically is what left "recording is missing"
        // undiagnosable last time.
        reportRecordingFailure(
          sessionChunksRef.current.length > 0
            ? `Recording captured ${sessionChunksRef.current.length} segment(s) as ${recorderMimeTypeRef.current || 'unknown format'}, but none of the ${partsAttemptedRef.current} upload(s) reached storage — last error: ${lastPartUploadErrorRef.current || 'unknown'}.`
            : `No recording data was ever captured for this session (negotiated format: ${recorderMimeTypeRef.current || 'none — recorder never started'}).`
        );
        return;
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await api.post(`/interviews/${id}/finalize-video`, {}, { timeout: 180000 });
          return;
        } catch (err) {
          console.warn(`Finalize attempt ${attempt} failed:`, err?.response?.status || err.message);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      // Even if this never succeeds the footage is not lost: the slices stay in storage and
      // the session can be assembled later from them.
      console.error('Could not finalize the session recording — parts remain stored server-side.');
    } finally {
      setSavingVideo(false);
    }
  };

  // ------------------------------------------------------------------ Submit (§2/§3)
  // Submit a coding-sandbox answer. The graded code arrives as a plain string, which the
  // normal text path already knows how to send — going through submitAnswer keeps scoring,
  // the timer and question advancement identical to every other question type.
  const submitAnswerWithText = (answerText) => submitAnswer({ overrideText: answerText });

  const submitAnswer = async ({ timedOut = false, overrideText = null } = {}) => {
    if (submittingRef.current) return;
    const question = questions[currentIdx];
    if (!question) return;
    submittingRef.current = true;

    clearCountdown();
    setLoading(true);
    setError('');

    // A sandbox answer is text, never audio — bypass the voice branch even if the session
    // was left in voice mode, since setInputMode() has not re-rendered yet at this point.
    const asText = overrideText !== null;

    let audioBlob = null;
    let voiceText = '';
    if (!asText && inputMode === 'voice') {
      stopMic();
      audioBlob = await finalizeAudioBlob();
      voiceText = liveTranscriptRef.current;
      teardownAudio();
    }

    const formData = new FormData();
    formData.append('question_id', question.id);
    formData.append('timed_out', timedOut ? 'true' : 'false');

    // On the final question, attach a webcam snapshot so completed interviews carry a
    // completion photo for admin review (parallel to the auto-terminate snapshot).
    if (currentIdx + 1 >= questions.length) {
      const finalSnapshot = captureSnapshot();
      if (finalSnapshot) formData.append('snapshot_image', finalSnapshot);
    }

    if (!asText && inputMode === 'voice') {
      if (audioBlob && audioBlob.size > 0) {
        formData.append('audio', audioBlob, answerRecorderFileName(answerRecorderMimeTypeRef.current));
      }
      // Live browser transcript travels as the fallback/authoritative-backup answer.
      formData.append('fallback_text', voiceText || '');
      formData.append('duration', timeLimit && remaining !== null ? (timeLimit - remaining) : 0);
    } else {
      formData.append('response_text', asText ? overrideText : typedAnswer);
      formData.append('duration', timeLimit && remaining !== null ? (timeLimit - remaining) : 0);
    }

    try {
      const res = await api.post(`/interviews/${id}/submit-answer`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.is_completed) {
        // Stop the recorder and push its last slice BEFORE tearing down the camera and
        // leaving — navigating away stops the very tracks the recorder reads from, so a
        // recorder still mid-flush loses its closing chunk. Bounded to 4s (mirrors the
        // proctor-termination flow below) rather than awaiting the full uploadSessionVideo()
        // pipeline, which used to also wait out the server-side finalize-video call (video
        // stitching) — on a longer session that can run several seconds, during which the
        // candidate saw no feedback at all and it read as "the interview end is broken/slow".
        await Promise.race([
          (async () => { await finalizeSessionVideo(); flushVideoPart(); await partQueueRef.current; })(),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        stopCamera();
        // The slow server-side stitching runs in the background — everything up to here is
        // already stored server-side, so it must not hold up the redirect to the report page.
        uploadSessionVideo();
        navigate(`/interview/report/${id}`, { replace: true });
      } else {
        setCurrentIdx(prev => prev + 1);
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit response. Please try again.');
      return false;
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleAutoSubmit = () => {
    // Timer expired — submit whatever exists (a skip if empty). An MCQ submits whichever
    // option was selected (selectedMcqOptionRef — see its declaration for why a ref, not the
    // state, is read here) via overrideText, same as clicking "Submit Answer" would; an
    // unanswered one submits a clean empty string, bypassing voice/text state entirely (same
    // reasoning as the sandbox's submitAnswerWithText) rather than risking stale leftover
    // text/voice state from a previous question type being sent as the "answer".
    if (isMcqQuestion) {
      submitAnswer({ timedOut: true, overrideText: selectedMcqOptionRef.current || '' });
    } else {
      submitAnswer({ timedOut: true });
    }
  };

  // Clean up audio + timer on unmount.
  useEffect(() => {
    return () => {
      clearCountdown();
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speakQuestion = () => {
    if ('speechSynthesis' in window && activeQuestion) {
      window.speechSynthesis.cancel();
      if (isMuted || isSandboxQuestion || isMcqQuestion) return;
      const utterance = new SpeechSynthesisUtterance(activeQuestion.question_text);
      utterance.rate = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))) ||
                       voices.find(v => v.lang.startsWith('en') && v.name.includes('Microsoft')) ||
                       voices.find(v => v.lang.startsWith('en'));
      if (engVoice) {
        utterance.voice = engVoice;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  // Speak question automatically by default when it loads or index changes.
  //
  // Gated on sessionStage === 'questions' for the same reason as the timer-start effect above
  // — activeQuestion is already set while the welcome/intro screen is showing, so without this
  // gate the recruiter voice started reading the question out loud in the background under the
  // intro card, before the candidate had even clicked "Start Interview".
  useEffect(() => {
    if (activeQuestion && sessionStage === 'questions' && !isMuted && !isSandboxQuestion && !isMcqQuestion) {
      const timer = setTimeout(() => {
        speakQuestion();
      }, 350);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, questions.length, isMuted, sessionStage]);

  // Clean up speech synthesis on page transition
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (questions.length === 0) {
    return (
      <Card className="text-center max-w-md mx-auto">
        <Spinner size="md" label="Loading interview workspace..." />
      </Card>
    );
  }

  // Proctoring is already live during the intro screen (camera/MediaPipe start on mount,
  // independent of sessionStage), so a violation CAN be counted while it's showing. These
  // banners used to only exist in the post-intro layout below — a candidate could rack up
  // real strikes (or even hit the identity/camera-loss paths) during the 60s intro with zero
  // visual feedback that anything was wrong. All five are `fixed`-positioned overlays, so
  // rendering the same fragment from both branches below is safe — no layout coupling.
  const proctorAlertsUI = (
    <>
      {/* Hard violation warning — a fixed, prominent banner pinned to the top-center of the
          viewport so it's impossible to miss during the interview (it used to sit inline and
          scroll out of view). Sits above everything, including full-screen mode. */}
      {violationAlert && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[80] px-6 py-4 bg-red-600 border-2 border-red-300 text-white rounded-xl text-sm md:text-base font-bold flex items-center gap-3 animate-bounce shadow-2xl shadow-red-950/50 max-w-[92vw]">
          <AlertTriangle className="shrink-0" size={22} />
          <span>{violationAlert}</span>
        </div>
      )}

      {/* Identity failure — a hard block, not a strike. Shown as a full-cover overlay
          because the session is already being torn down behind it. */}
      {identityAlert && (
        <div className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-600/20 border-2 border-red-500 text-red-400 flex items-center justify-center">
            <ScanFace size={32} />
          </div>
          <h2 className="text-xl font-extrabold text-white">Identity Verification Failed</h2>
          <p className="text-sm text-slate-300 max-w-md leading-relaxed">{identityAlert}</p>
          <Spinner size="lg" />
        </div>
      )}

      {/* Soft (non-terminating) full-face warning (§4) — also pinned near the top, just
          below the hard-warning slot, in a calmer amber style. */}
      {softAlert && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[75] px-5 py-3.5 bg-amber-500 border-2 border-amber-300 text-white rounded-xl text-sm font-bold flex items-center gap-2.5 shadow-2xl shadow-amber-950/40 max-w-[92vw]">
          <ScanFace className="shrink-0" size={18} />
          <span>{softAlert}</span>
        </div>
      )}

      {/* Camera-stall recovery (§ reliability) — deliberately calm, NOT the red violation
          style: a transient "reconnecting" state while we re-acquire the stream, and a
          persistent notice if it couldn't be restored (the interview continues; the gap is
          logged for admin review, not counted against the candidate). */}
      {cameraReconnecting && !cameraLost && (
        <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[75] px-5 py-3.5 bg-sky-600 border-2 border-sky-300 text-white rounded-xl text-sm font-semibold flex items-center gap-2.5 shadow-2xl shadow-sky-950/40 max-w-[92vw]">
          <Camera className="shrink-0 animate-pulse" size={18} />
          <span>Reconnecting to your camera…</span>
        </div>
      )}
      {cameraLost && (
        <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[75] px-5 py-3.5 bg-orange-600 border-2 border-orange-300 text-white rounded-xl text-sm font-semibold flex items-center gap-2.5 shadow-2xl shadow-orange-950/40 max-w-[92vw]">
          <CameraOff className="shrink-0" size={18} />
          <span>Camera unavailable — the interview will continue, and this has been noted for review.</span>
        </div>
      )}
    </>
  );

  if (sessionStage === 'ready') {
    // A short, deliberate "about to begin" gate shown BEFORE the intro card (see the
    // sessionStage declaration for why) — its own explicit button, not a countdown, so the
    // candidate has to consciously choose to proceed rather than the welcome/rules screen and
    // its 60s timer just appearing the instant the page mounts.
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        {proctorAlertsUI}
        <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" aria-hidden="true" />
        <Card padding={false} className="overflow-hidden">
          <div className="px-6 md:px-8 pt-8 pb-4 text-center space-y-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">
              <Sparkles size={12} /> Interview Session
            </span>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
              You're All Set
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
              Your camera is live below. When you're ready, continue to see your interview details before it begins.
            </p>
          </div>

          <div className="px-6 md:px-8 pb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Camera Preview
              </span>
              {cameraOn && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Live
                </span>
              )}
            </div>
            <div className="relative aspect-video max-h-56 mx-auto rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
              {cameraOn ? (
                <video
                  ref={attachVideoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    e.target.play().catch(err => console.log("Metadata play error:", err));
                  }}
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center space-y-1.5 text-slate-400 dark:text-slate-600 py-6">
                  <CameraOff size={24} className="mx-auto" />
                  <span className="text-xs font-semibold block text-slate-500 dark:text-slate-400">Camera Feed Off</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 md:px-8 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800">
            <Button onClick={handleReadyContinue} className="w-full">
              Continue
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (sessionStage === 'intro') {
    // Reflects what's actually LEFT from here, not the interview's original total — matters
    // for the sandbox-first candidate (openedWithSandbox), who sees this screen after Question
    // 1 is already done, so it should say "4 remaining", not repeat "5".
    const mainQuestionCount = Math.max(
      0,
      questions.filter((q) => q.question_type !== 'mcq').length - currentIdx
    );
    const mcqCount = questions.filter((q) => q.question_type === 'mcq').length;
    const briefingItems = [
      {
        icon: Sparkles,
        title: 'Interview structure',
        detail: `${mainQuestionCount} interview question${mainQuestionCount === 1 ? '' : 's'} (${formatTime(240)} each), then ${mcqCount} quick multiple-choice questions (${formatTime(60)} each).`,
      },
      {
        icon: TimerIcon,
        title: 'Timed responses',
        detail: 'Each question auto-submits the moment its timer runs out — answer as much as you can before then.',
      },
      {
        icon: ShieldAlert,
        title: 'Proctoring active',
        detail: 'Your camera stays on and is monitored for the whole session — stay visible and centered in frame.',
      },
    ];
    const introProgressPct = Math.max(0, Math.min(100, (introRemaining / INTRO_DURATION_SECONDS) * 100));
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        {proctorAlertsUI}
        {/* One-time "session started" cue — paired with the spoken INTRO_START_VOICE_MESSAGE
            (see the effect that sets introStartToast) — auto-dismisses on its own. */}
        {introStartToast && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[75] px-5 py-3.5 bg-emerald-600 border-2 border-emerald-300 text-white rounded-xl text-sm font-bold flex items-center gap-2.5 shadow-2xl shadow-emerald-950/40 max-w-[92vw] animate-fade-in">
            <CheckCircle2 className="shrink-0" size={18} />
            <span>Interview Started — review the details below.</span>
          </div>
        )}
        <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" aria-hidden="true" />
        <Card padding={false} className="overflow-hidden">
          {/* Header band */}
          <div className="px-6 md:px-8 pt-5 pb-4 text-center space-y-1 border-b border-slate-200 dark:border-slate-800">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">
              <Sparkles size={12} /> Interview Session
            </span>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
              Before You Begin
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Confirm your camera, then review the session details below.
            </p>
          </div>

          {/* Side-by-side on md+: camera left, briefing right — keeps the whole card inside
              one viewport with no page scroll, instead of stacking everything tall. */}
          <div className="px-6 md:px-8 py-5 grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5 items-start">
            {/* Camera preview */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Camera Preview
                </span>
                {cameraOn && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
              <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
                {cameraOn ? (
                  <video
                    ref={attachVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      e.target.play().catch(err => console.log("Metadata play error:", err));
                    }}
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center space-y-1.5 text-slate-400 dark:text-slate-600 py-6">
                    <CameraOff size={24} className="mx-auto" />
                    <span className="text-xs font-semibold block text-slate-500 dark:text-slate-400">Camera Feed Off</span>
                  </div>
                )}
              </div>
            </div>

            {/* Briefing panel */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
              {briefingItems.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="flex items-start gap-2.5 p-3 bg-white dark:bg-slate-900/40">
                  <div className="shrink-0 w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 flex items-center justify-center">
                    <Icon size={13} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer CTA band */}
          <div className="px-6 md:px-8 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} /> Starting automatically
              </span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{formatTime(introRemaining)}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-1000 ease-linear"
                style={{ width: `${introProgressPct}%` }}
              />
            </div>
            <Button onClick={handleStartInterview} className="w-full">
              Start Interview
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const timerLow = remaining !== null && remaining <= 20;
  const combinedTranscript = `${liveTranscript}${interimText ? (liveTranscript ? ' ' : '') + interimText : ''}`.trim();

  return (
    /* Vertical rhythm through this whole screen is deliberately tighter than the rest of
       the app (space-y-4 / gap-4 rather than 6, smaller card padding). The candidate is
       under a countdown and needs the question, their camera and the mic control visible
       at once; anything that pushes the answer controls below the fold makes them scroll
       while the clock runs. Nothing is removed — only the whitespace between it. */
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      {/* Hidden sink for the shared-screen stream — frames are grabbed from here for the
          proctoring screenshot archive. Never shown to the candidate. */}
      <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" aria-hidden="true" />

      {/* Session Header */}
      <Card padding={false} className="px-5 py-3 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Badge variant="primary" size="lg" className="!normal-case !tracking-normal mb-1">
              Session Active
            </Badge>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Question {currentIdx + 1} of {questions.length}
            </h2>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            {/* Per-question countdown timer (§2) */}
            {remaining !== null && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                timerLow
                  ? 'bg-red-500/10 border-red-500/40 text-red-500 dark:text-red-400 animate-pulse'
                  : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                <TimerIcon size={14} />
                <span className="font-mono">{formatTime(remaining)}</span>
                <span className="text-[10px] font-semibold opacity-70">left</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    proctoringActive ? 'bg-primary-400' : 'bg-red-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    proctoringActive ? 'bg-primary-500' : 'bg-red-500'
                  }`}
                />
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-semibold">
                {proctoringActive ? 'AI Proctor Active' : 'Fallback Proctor'}
              </span>
              {violationsCount > 0 && (
                <Badge variant="error" size="lg" className="!normal-case !tracking-normal border-l border-slate-200 dark:border-slate-800 pl-2 ml-1 rounded-none border-0">
                  {violationsCount}/{MAX_VIOLATIONS}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-semibold">
              <Clock size={16} />
              <span>{formatTime(sessionTime)}</span>
            </div>
          </div>

          {/* Interview progress indicator. The label row is folded into a single line with
              the bar so the header stays one compact strip. */}
          <div className="mt-2 w-full space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Progress</span>
              <span>{currentIdx} / {questions.length} completed</span>
            </div>
            <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
                style={{ width: `${questions.length ? (currentIdx / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {proctorAlertsUI}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column — kept sticky on desktop: the coding sandbox on the right can run
            much taller than this panel (examples, constraints, editor, console), and
            without this the candidate's own camera feed and violation board would scroll
            out of view exactly while they're most likely to trip a violation. */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* Status strip, laid out horizontally. This used to be a centred column — a
              64px avatar stacked above the label — which cost ~180px of height to convey
              one line of state. Side by side it reads the same and takes a third of that,
              which is height the camera feed and mic control need more. */}
          <Card padding={false} className="flex items-center gap-3 px-4 py-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full blur-lg pointer-events-none" />

            <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-tr from-primary-500 to-indigo-500 flex items-center justify-center border border-primary-400/30 relative">
              <Activity className={`text-white ${isRecording ? 'animate-pulse' : ''}`} size={18} />
              {isRecording && (
                <span className="absolute inset-0 rounded-full border-2 border-primary-500 animate-ping" />
              )}
            </div>

            <div className="min-w-0">
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">AI Recruiter</h4>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                {loading ? 'Analyzing response...' : micActive ? 'Listening...' : 'Awaiting Reply'}
              </span>
            </div>
          </Card>

          <Card
            className={`space-y-3 transition-all ${
              violationsCount > 0 ? 'border-red-500/35 shadow-lg shadow-red-950/5' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Your Camera
              </span>

              <button
                type="button"
                onClick={handleCameraToggleAttempt}
                className={`p-1.5 rounded-lg border transition ${
                  cameraOn
                    ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:border-red-500/40'
                    : 'bg-primary-600/10 border-primary-500 text-primary-500 dark:text-primary-400'
                }`}
                title={cameraOn
                  ? 'The camera must stay on — turning it off is recorded as a violation'
                  : 'Turn the camera back on'}
              >
                {cameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
              </button>
            </div>

            <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
              {cameraOn ? (
                <>
                  <video
                    ref={attachVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      e.target.play().catch(err => console.log("Metadata play error:", err));
                    }}
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  {violationsCount > 0 && (
                    <div className="absolute inset-0 border-2 border-red-500/40 pointer-events-none rounded-xl" />
                  )}
                </>
              ) : (
                <div className="text-center space-y-1.5 text-slate-400 dark:text-slate-600 py-8">
                  <CameraOff size={28} className="mx-auto" />
                  <span className="text-xs font-semibold block text-slate-500 dark:text-slate-400">Camera Feed Off</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldAlert size={12} className="text-red-400" />
                  Integrity Security Board
                </span>
                <Badge
                  variant={violationsCount >= 4 ? 'error' : violationsCount >= 1 ? 'warning' : 'success'}
                  className="!text-[9px]"
                >
                  {violationsCount}/{MAX_VIOLATIONS} Violations
                </Badge>
              </div>
              {/* One segment per strike up to MAX_VIOLATIONS, so the terminating (5th) strike
                  gets its own distinct segment instead of looking identical to the 4th
                  warning — a candidate terminated on strike 5 used to see the exact same
                  "4/4, all bars red" state as someone merely warned for the 4th time. */}
              <div className="w-full bg-slate-200 dark:bg-slate-950 h-1.5 rounded-full overflow-hidden flex gap-0.5">
                <div className={`h-full flex-1 rounded-l transition-all duration-300 ${violationsCount >= 1 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-800'}`} />
                <div className={`h-full flex-1 transition-all duration-300 ${violationsCount >= 2 ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-800'}`} />
                <div className={`h-full flex-1 transition-all duration-300 ${violationsCount >= 3 ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-800'}`} />
                <div className={`h-full flex-1 transition-all duration-300 ${violationsCount >= 4 ? 'bg-red-600' : 'bg-slate-300 dark:bg-slate-800'}`} />
                <div className={`h-full flex-1 rounded-r transition-all duration-300 ${violationsCount >= 5 ? 'bg-red-800' : 'bg-slate-300 dark:bg-slate-800'}`} />
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                Keep your full face visible and centered. A 5th integrity infraction automatically voids and terminates this session.
              </p>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8">
          <Card className="min-h-[320px] flex flex-col justify-between relative overflow-hidden md:p-6">
            {(loading || savingVideo) && (
              <div className="absolute inset-0 bg-white/90 dark:bg-slate-950/85 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-4">
                <div className="p-4 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-2xl animate-bounce shadow-xl">
                  <Sparkles className="text-white animate-pulse" size={32} />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {savingVideo ? 'Finalizing your session...' : 'Saving your answer...'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {savingVideo
                      ? 'Securely storing the session recording — just a moment.'
                      : 'Moving you to the next question — grading happens in the background.'}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="primary" size="lg" className="capitalize !normal-case">
                  {questionTypeLabel(activeQuestion?.question_type)}
                </Badge>
                {/* Nothing is spoken for a written coding exercise or an on-screen MCQ, so
                    the voice toggle is hidden rather than left sitting there doing nothing. */}
                {!isSandboxQuestion && !isMcqQuestion && (
                  <button
                    onClick={() => {
                      const newMuted = !isMuted;
                      setIsMuted(newMuted);
                      if (newMuted) {
                        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                      } else {
                        setTimeout(() => {
                          if ('speechSynthesis' in window && activeQuestion) {
                            window.speechSynthesis.cancel();
                            const utterance = new SpeechSynthesisUtterance(activeQuestion.question_text);
                            utterance.rate = 0.95;
                            window.speechSynthesis.speak(utterance);
                          }
                        }, 50);
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition ${
                      isMuted
                        ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        : 'bg-primary-600/10 border-primary-500 text-primary-500 dark:text-primary-400 hover:bg-primary-600 hover:text-white'
                    }`}
                    title={isMuted ? 'Unmute Recruiter Voice' : 'Mute Recruiter Voice'}
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
              </div>

              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white leading-relaxed">
                {activeQuestion?.question_text}
              </h1>

              {/* Debugging questions ship a code snippet (Coding Formats §2.2). It is a
                  separate field from question_text specifically so it renders as code and
                  is never read aloud by the question voice. */}
              {activeQuestion?.code_snippet && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Review this code
                  </span>
                  <pre className="w-full overflow-x-auto p-4 bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-xl text-[12px] leading-relaxed text-slate-100 font-mono">
                    <code>{activeQuestion.code_snippet}</code>
                  </pre>
                </div>
              )}
            </div>

            {/* The sandbox opens with its own scenario block, which has to read as part of
                the question rather than as a detached panel — so it sits directly under the
                title instead of behind the wide divider the answer controls use. */}
            <div
              className={`flex flex-col items-center ${
                isSandboxQuestion
                  ? 'mt-4'
                  : 'mt-10 pt-8 border-t border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* A coding-sandbox question is answered by writing and running code, so it
                  replaces the voice/text answer controls entirely for that question only.
                  Everything else on the page — proctoring, the per-question timer, the
                  session recording — is untouched and keeps running exactly as before. */}
              {activeQuestion?.question_type === 'coding_sandbox' && activeQuestion?.sandbox_problem_id ? (
                <InterviewCodingSandbox
                  problemId={activeQuestion.sandbox_problem_id}
                  interviewId={parseInt(id, 10)}
                  disabled={loading}
                  onSubmitAnswer={(answerText) => {
                    // Reuse the normal text-answer submit path (via overrideText) so scoring,
                    // the timer and question advancement all behave identically to any other
                    // question — this bypasses inputMode entirely, so the next question still
                    // opens in voice mode as normal.
                    submitAnswerWithText(answerText);
                  }}
                />
              ) : isMcqQuestion ? (
                // Single-select MCQ (§ MCQ round): clicking an option only SELECTS it
                // (highlighted below) — it does not submit by itself. A candidate confirms
                // with the "Submit Answer" button, matching every other question type's
                // explicit-submit pattern instead of a bare click silently locking in an
                // answer. If the timer runs out first, handleAutoSubmit submits whichever
                // option is currently selected (or an empty skip if none is). The forward-only
                // question loop this file already has (currentIdx only ever advances) is what
                // satisfies "no going back" — nothing extra needed for that here.
                <div className="w-full max-w-lg space-y-3">
                  {(activeQuestion.mcq_options || []).map((option, idx) => {
                    const isSelected = selectedMcqOption === option;
                    return (
                      <button
                        key={idx}
                        disabled={loading}
                        onClick={() => {
                          selectedMcqOptionRef.current = option;
                          setSelectedMcqOption(option);
                        }}
                        className={`w-full text-left px-5 py-4 rounded-xl border transition font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-500/10 text-slate-900 dark:text-white ring-1 ring-primary-500'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary-500 hover:bg-primary-50/60 dark:hover:bg-primary-500/5 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className={`inline-flex items-center justify-center w-6 h-6 mr-3 rounded-full text-[11px] font-bold align-middle ${
                          isSelected
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                  <Button
                    onClick={() => submitAnswerWithText(selectedMcqOption)}
                    disabled={loading || !selectedMcqOption}
                    icon={Send}
                    className="w-full"
                  >
                    Submit Answer
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-5 w-full max-w-lg">
                  {/* Mic control */}
                  <button
                    onClick={toggleMic}
                    disabled={loading}
                    className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center border shadow-xl transition-all hover:scale-105 cursor-pointer ${
                      micActive
                        ? 'bg-red-600 hover:bg-red-700 text-white border-red-500/30 shadow-red-600/20'
                        : 'bg-gradient-to-tr from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white border-primary-400/20 shadow-primary-500/25'
                    }`}
                    title={micActive ? 'Turn Mic Off' : 'Turn Mic On'}
                  >
                    {micActive ? <MicOff size={30} /> : <Mic size={32} />}
                  </button>
                  <p className="text-slate-500 dark:text-slate-400 text-xs text-center">
                    {micActive
                      ? 'Listening — speak your answer. Turn the mic off to pause; your words are kept.'
                      : 'Turn on the mic and start speaking. You can pause and resume anytime.'}
                  </p>

                  {/* Live transcript panel directly below the mic (§3) */}
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles size={11} className={micActive ? 'text-primary-500 animate-pulse' : 'text-slate-400'} />
                        Live Transcript
                      </span>
                      {micActive && <span className="text-[10px] font-semibold text-red-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Recording</span>}
                    </div>
                    <div className="w-full min-h-20 max-h-36 overflow-y-auto p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {combinedTranscript
                        ? (
                          <>
                            <span>{liveTranscript}</span>
                            {interimText && <span className="text-slate-400 dark:text-slate-500"> {interimText}</span>}
                          </>
                        )
                        : <span className="text-slate-400 dark:text-slate-600 italic">Your spoken words will appear here as you speak…</span>}
                    </div>
                    {!sttSupported && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
                        Live captions aren't supported in this browser — your audio is still recorded and transcribed on submit.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-4 w-full">
                    <Button
                      onClick={() => submitAnswer({ timedOut: false })}
                      disabled={loading || micActive || (!combinedTranscript && !hasRecorded)}
                      loading={loading}
                      size="sm"
                      icon={Send}
                      iconPosition="right"
                    >
                      {currentIdx + 1 >= questions.length ? 'Submit & Finish' : 'Submit & Next'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default InterviewSession;
