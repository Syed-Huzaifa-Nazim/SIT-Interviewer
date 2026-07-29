import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { getScreenStream, hasScreenStream, clearScreenStream } from '../services/proctorScreen';
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
import {
  Mic,
  MicOff,
  Type,
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
  ScanFace
} from 'lucide-react';

const InterviewSession = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Load questions passed from redirect, or fetch them if refreshed
  const [questions, setQuestions] = useState(location.state?.questions || []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Response modes: 'voice' (default) or 'text'
  const [inputMode, setInputMode] = useState('voice');
  const [typedAnswer, setTypedAnswer] = useState('');

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
  const [identityAlert, setIdentityAlert] = useState('');

  // Voice capture refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const micActiveRef = useRef(false);
  const submittingRef = useRef(false);

  // Full-session video recording (DB Integration §2): records the SAME 640×480 proctoring
  // camera stream (no second camera request), video-only WebM at a modest bitrate. One
  // contiguous recording per session — if the candidate turns the camera off the recorder
  // ends with it, and we upload whatever was captured up to that point rather than
  // stitching invalid multi-segment WebM files together.
  const sessionRecorderRef = useRef(null);
  const sessionChunksRef = useRef([]);
  const videoUploadedRef = useRef(false);
  const [savingVideo, setSavingVideo] = useState(false);

  // Per-question timer (§2)
  const [remaining, setRemaining] = useState(null);
  const [timeLimit, setTimeLimit] = useState(null);
  const timerRef = useRef(null);
  const timerQuestionRef = useRef(null);

  // General session timer
  const [sessionTime, setSessionTime] = useState(0);

  const activeQuestion = questions[currentIdx];

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
        setCurrentIdx(res.data.responses_count || 0);
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

  // 2. Play Warning Beep Alarm (Web Audio API)
  const playBeepAlarm = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(650, audioCtx.currentTime); // 650 Hz warning tone
      gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.0); // play beep for 1.0s
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
  // 4-strike counter and gives no warning — it is an immediate block, and the backend
  // writes its own IDENTITY_VERIFICATION_FAILED admin log.
  const terminateForIdentity = async (distance) => {
    if (identityFailedRef.current) return;
    identityFailedRef.current = true;
    setIdentityAlert('Identity check failed — the person on camera is not the verified candidate. This session is being terminated.');
    const snapshot = captureSnapshot();
    try {
      await api.post(`/interviews/${id}/identity-failed`, {
        details: `Face on camera did not match the candidate verified at the start (distance ${distance.toFixed(3)}).`,
        snapshot_image: snapshot,
      });
    } catch (err) {
      console.error('Failed to report the identity failure:', err);
    }
    await uploadSessionVideo();
    stopCamera();
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

  const logProctorViolation = async (type, details) => {
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
    // violation, so 4 violations produce 4 webcam + 4 screen snapshots and nothing more.
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
      // Reconcile with the authoritative server count (replaces the optimistic bump above).
      const count = res.data.violations_count;
      if (typeof count === 'number') {
        setViolationsCount(count);
        violationsCountRef.current = count;
      }

      if (res.data.auto_terminate) {
        // The 4th violation's webcam + screen frames were already archived just above, like
        // every other violation — the server no longer files a duplicate 'termination' copy.
        // Give those fire-and-forget uploads a brief moment to reach the server before we
        // tear the session down and navigate away.
        await new Promise((r) => setTimeout(r, 400));
        // Termination must be immediate — the candidate should not remain on a live,
        // proctorable session for however long a multi-MB video upload takes (previously
        // this was `await`ed, making "instant" termination take up to minutes). Fire it off
        // and let it finish in the background instead: there's no AbortController anywhere
        // in this app, so navigating away does NOT cancel the in-flight upload — it keeps
        // running via the browser's own network stack regardless of the component unmounting.
        uploadSessionVideo();
        stopCamera();
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
  // through the normal violation flow (snapshot + strike + the existing 4-strike
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
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
          try {
            const rec = new MediaRecorder(stream, {
              mimeType: 'video/webm',
              videoBitsPerSecond: 600_000, // 480p decorative-review quality, ~4.5MB/min
            });
            rec.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) sessionChunksRef.current.push(e.data);
            };
            rec.start(1000);
            sessionRecorderRef.current = rec;
          } catch (e) {
            console.warn('Session video recording unavailable:', e);
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
              } catch (e) {
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
            try { await videoRef.current.play(); } catch (_) {}
          }
          attachTrackWatch(fresh);
          // The frame loop reads videoRef.current every cycle, so detection resumes on the
          // new stream automatically once readyState recovers — nothing to restart.
          recoveryAttemptsRef.current = 0;
          cameraStalledRef.current = false;
          setCameraReconnecting(false);
          return;
        } catch (e) {
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

    // No Face Detection (existing hard violation, unchanged)
    if (faces.length === 0) {
      faceBadSinceRef.current = null;
      logProctorViolation('NO_FACE', 'No face detected. Please look directly into the camera.');
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

    // Face look-away / Gaze tracking (existing hard violation, unchanged)
    if (landmarks && landmarks.length > 263) {
      const nose = landmarks[4];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];

      const distance = Math.abs(rightEye.x - leftEye.x);
      if (distance > 0) {
        const noseOffset = (nose.x - leftEye.x) / distance;

        // Balanced center is ~0.5. Left or right lookaways skew this:
        if (noseOffset < 0.33 || noseOffset > 0.67) {
          logProctorViolation('LOOK_AWAY', 'Turned head or looked away from the monitor.');
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

    // Don't double-flag a head turn: if LOOK_AWAY just fired, that behaviour is already
    // reported as a hard violation, so stay quiet and reset the gaze clock.
    const lastLookAway = lastViolationTimeRef.current['LOOK_AWAY'] || 0;
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
        // Sustained (GAZE_AWAY_MS) look off the screen — counted directly as an integrity
        // violation (1 strike toward the 3-strike auto-termination) and logged for admin
        // review, exactly like the other hard violations. The GAZE_AWAY_MS window keeps a
        // blink or micro-glance from tripping it.
        logProctorViolation('GAZE_AWAY', 'Looked away from the screen during the interview.');
        gazeAwaySinceRef.current = now; // re-arm for the next continuous window
      }
    } else {
      gazeAwaySinceRef.current = null;
    }
  };

  // 7b. Process MediaPipe Hand Landmarks (hands raised in front of the screen/camera).
  // MediaPipe only reports a hand when its own confidence is met, so any detected hand
  // is flagged immediately — no size gate — so a hand entering the frame is caught the
  // moment it appears. The per-type throttle prevents repeated frames from stacking.
  const handleHandResults = (results) => {
    const hands = results.multiHandLandmarks || [];
    if (hands.length > 0) {
      logProctorViolation('HAND_DETECTED', 'Hand detected in front of the camera. Keep your hands out of view.');
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
    } catch (err) {
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
  useEffect(() => {
    if (!activeQuestion) return;
    // reset per-question answer state
    liveTranscriptRef.current = '';
    setLiveTranscript('');
    setInterimText('');
    setTypedAnswer('');
    audioChunksRef.current = [];
    setHasRecorded(false);
    faceBadSinceRef.current = null;
    // Reset eye/gaze state too, so a warning can't carry over between questions (§1).
    gazeAwaySinceRef.current = null;
    eyesClosedSinceRef.current = null;
    startQuestionTimer(activeQuestion);

    return () => clearCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, questions.length]);

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
        try { recognition.start(); } catch (e) { /* already started */ }
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
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        const mr = new MediaRecorder(audioStreamRef.current, { mimeType: 'audio/webm' });
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current = mr;
        mr.start(500);
      } else if (mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
      }

      // Live captions via the browser Web Speech API (best-effort; Whisper stays authoritative).
      if (sttSupported) {
        if (!recognitionRef.current) recognitionRef.current = getSpeechRecognition();
        try { if (recognitionRef.current) recognitionRef.current.start(); } catch (e) { /* already running */ }
      }

      micActiveRef.current = true;
      setMicActive(true);
      setIsRecording(true);
      setHasRecorded(true);
    } catch (err) {
      console.error('Mic access error:', err);
      setError('Could not access microphone. Please check permissions or switch to Text Mode.');
      setInputMode('text');
    }
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
    } catch (e) { /* ignore */ }
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    setInterimText('');
  };

  const toggleMic = () => {
    if (micActive) stopMic();
    else startMic();
  };

  // Fully stop + release the audio pipeline (on submit / unmount).
  const teardownAudio = () => {
    micActiveRef.current = false;
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    recognitionRef.current = null;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (e) { /* ignore */ }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
  };

  // Assemble the recorded audio (across pause/resume cycles) into one blob.
  const finalizeAudioBlob = () => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: 'audio/webm' }) : null);
        return;
      }
      mr.onstop = () => {
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: 'audio/webm' }) : null);
      };
      try { mr.stop(); } catch (e) {
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current, { type: 'audio/webm' }) : null);
      }
    });
  };

  // ---------------------------------------------------- Session video (DB Integration §2)
  // Stop the session recorder and assemble everything captured into one WebM blob.
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
      try { rec.stop(); } catch (e) { assemble(); }
    });
  };

  // Upload the finished session recording with retries (§2.2 reliability). Failures are
  // logged and swallowed — the candidate's flow is never blocked by a lost recording,
  // and the backend leaves video_path NULL so the admin sees the truth.
  const uploadSessionVideo = async () => {
    if (videoUploadedRef.current) return;
    const blob = await finalizeSessionVideo();
    if (!blob || blob.size < 1024) return;
    videoUploadedRef.current = true; // one attempt cycle per session

    setSavingVideo(true);
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const fd = new FormData();
          fd.append('video', blob, 'session.webm');
          await api.post(`/interviews/${id}/upload-video`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 180000,
          });
          return;
        } catch (err) {
          console.warn(`Session video upload attempt ${attempt} failed:`, err?.response?.status || err.message);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      console.error('Session video upload failed after retries — recording not stored.');
    } finally {
      setSavingVideo(false);
    }
  };

  // ------------------------------------------------------------------ Submit (§2/§3)
  const submitAnswer = async ({ timedOut = false } = {}) => {
    if (submittingRef.current) return;
    const question = questions[currentIdx];
    if (!question) return;
    submittingRef.current = true;

    clearCountdown();
    setLoading(true);
    setError('');

    let audioBlob = null;
    let voiceText = '';
    if (inputMode === 'voice') {
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

    if (inputMode === 'voice') {
      if (audioBlob && audioBlob.size > 0) {
        formData.append('audio', audioBlob, 'response.webm');
      }
      // Live browser transcript travels as the fallback/authoritative-backup answer.
      formData.append('fallback_text', voiceText || '');
      formData.append('duration', timeLimit && remaining !== null ? (timeLimit - remaining) : 0);
    } else {
      formData.append('response_text', typedAnswer);
      formData.append('duration', 0);
    }

    try {
      const res = await api.post(`/interviews/${id}/submit-answer`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.is_completed) {
        // Store the session recording BEFORE tearing down the camera and leaving —
        // navigating first would unmount the component and abort the upload (§2.2).
        await uploadSessionVideo();
        stopCamera();
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
    // Timer expired — submit whatever exists (a skip if empty).
    submitAnswer({ timedOut: true });
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
      if (isMuted) return;
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

  // Speak question automatically by default when it loads or index changes
  useEffect(() => {
    if (activeQuestion && !isMuted) {
      const timer = setTimeout(() => {
        speakQuestion();
      }, 350);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, questions.length, isMuted]);

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

  const timerLow = remaining !== null && remaining <= 20;
  const combinedTranscript = `${liveTranscript}${interimText ? (liveTranscript ? ' ' : '') + interimText : ''}`.trim();

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Hidden sink for the shared-screen stream — frames are grabbed from here for the
          proctoring screenshot archive. Never shown to the candidate. */}
      <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" aria-hidden="true" />

      {/* Session Header */}
      <Card padding={false} className="px-5 py-4 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                  {violationsCount}/3
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-semibold">
              <Clock size={16} />
              <span>{formatTime(sessionTime)}</span>
            </div>
          </div>

          {/* Interview progress indicator */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Progress</span>
              <span>{currentIdx} / {questions.length} completed</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
                style={{ width: `${questions.length ? (currentIdx / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

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

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="text-center space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full blur-lg pointer-events-none" />

            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary-500 to-indigo-500 mx-auto flex items-center justify-center border border-primary-400/30 relative">
              <Activity className={`text-white ${isRecording ? 'animate-pulse' : ''}`} size={24} />
              {isRecording && (
                <span className="absolute inset-0 rounded-full border-2 border-primary-500 animate-ping" />
              )}
            </div>

            <div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">AI Recruiter</h4>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mt-0.5">
                {loading ? 'Analyzing response...' : micActive ? 'Listening...' : 'Awaiting Reply'}
              </span>
            </div>
          </Card>

          <Card
            className={`space-y-4 transition-all ${
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
                    ref={videoRef}
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

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldAlert size={12} className="text-red-400" />
                  Integrity Security Board
                </span>
                <Badge
                  variant={violationsCount >= 2 ? 'error' : violationsCount === 1 ? 'warning' : 'success'}
                  className="!text-[9px]"
                >
                  {violationsCount}/3 Violations
                </Badge>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-950 h-1.5 rounded-full overflow-hidden flex gap-0.5">
                <div className={`h-full flex-1 rounded-l transition-all duration-300 ${violationsCount >= 1 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-800'}`} />
                <div className={`h-full flex-1 transition-all duration-300 ${violationsCount >= 2 ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-800'}`} />
                <div className={`h-full flex-1 rounded-r transition-all duration-300 ${violationsCount >= 3 ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-800'}`} />
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                Keep your full face visible and centered. Accumulating 3 integrity infractions automatically voids and terminates this session.
              </p>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8">
          <Card className="min-h-[400px] flex flex-col justify-between relative overflow-hidden md:p-8">
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

            <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center">
              {inputMode === 'voice' ? (
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
                    <div className="w-full min-h-24 max-h-44 overflow-y-auto p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
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

                  <div className="flex items-center justify-between gap-4 w-full">
                    <button
                      onClick={() => { if (micActive) stopMic(); setInputMode('text'); }}
                      className="text-xs text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 font-semibold flex items-center gap-1.5 transition"
                    >
                      <Type size={14} />
                      Switch to Typed Input
                    </button>

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
              ) : (
                <div className="w-full space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Type your answer here</label>
                    <textarea
                      className="w-full glass-input min-h-36 text-sm resize-none"
                      placeholder="Explain your approach, reasoning, and any relevant details..."
                      value={typedAnswer}
                      onChange={(e) => setTypedAnswer(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <button
                      onClick={() => setInputMode('voice')}
                      className="text-xs text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 font-semibold flex items-center gap-1.5 transition"
                    >
                      <Mic size={14} />
                      Switch to Voice Input
                    </button>

                    <Button
                      onClick={() => submitAnswer({ timedOut: false })}
                      disabled={loading || !typedAnswer.trim()}
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
