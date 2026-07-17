import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
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

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const lastViolationTimeRef = useRef({});
  const faceBadSinceRef = useRef(null);

  // Voice capture refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const micActiveRef = useRef(false);
  const submittingRef = useRef(false);

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

  // 3. Send Proctor Log payload to backend (hard violation — counts toward termination)
  const logProctorViolation = async (type, details) => {
    const now = Date.now();
    // Throttle reporting of same violation types to once every 5 seconds
    if (lastViolationTimeRef.current[type] && now - lastViolationTimeRef.current[type] < 5000) {
      return;
    }
    lastViolationTimeRef.current[type] = now;

    // Local warnings
    playBeepAlarm();
    setViolationAlert(`PROCTOR WARNING: ${details}`);
    setTimeout(() => setViolationAlert(''), 4000);

    let snapshot = null;
    // Capture snapshot if this is the terminating violation
    if (violationsCountRef.current >= 2 && videoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        // Un-mirror raw video frames
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        snapshot = canvas.toDataURL('image/jpeg', 0.65);
      } catch (err) {
        console.warn('Snapshot capture failed:', err);
      }
    }

    try {
      const res = await api.post(`/interviews/${id}/proctor-log`, {
        type,
        details,
        snapshot_image: snapshot
      });
      const count = res.data.violations_count;
      if (typeof count === 'number') {
        setViolationsCount(count);
        violationsCountRef.current = count;
      }

      if (res.data.auto_terminate) {
        stopCamera();
        // Redirect directly with proctor violation flags
        navigate(`/interview/report/${id}`, { state: { proctorFailed: true }, replace: true });
      }
    } catch (err) {
      console.error('Failed to log violation to server:', err);
    }
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
    let objectScanTimeoutId = null;

    const startCameraAndProctoring = async () => {
      try {
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

        // Load MediaPipe FaceMesh script
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');

        if (!active) return;

        if (window.FaceMesh) {
          const faceMesh = new window.FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });

          faceMesh.setOptions({
            maxNumFaces: 2,
            refineLandmarks: false,
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
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.6
              });
              handsModel.onResults((results) => {
                if (!active) return;
                handleHandResults(results);
              });
            }
          } catch (e) {
            console.warn('MediaPipe Hands unavailable; face proctoring continues.', e);
          }

          // Custom frame loop using requestAnimationFrame at ~16 FPS to optimize CPU
          const processFrame = async () => {
            if (!active) return;
            if (cameraOn && videoRef.current && videoRef.current.readyState >= 2) {
              try {
                await faceMesh.send({ image: videoRef.current });
                if (handsModel) {
                  await handsModel.send({ image: videoRef.current });
                }
              } catch (e) {
                // Ignore transient frame send failures
              }
            }
            setTimeout(() => {
              animationFrameId = requestAnimationFrame(processFrame);
            }, 60); // ~16 FPS
          };

          animationFrameId = requestAnimationFrame(processFrame);
          // Proctoring is considered active as soon as the face pipeline is running —
          // we do NOT wait for the heavier object-detection model, so the interview
          // starts quickly. The phone model is loaded and run separately below.
          setProctoringActive(true);

          // Optional object-detection model (TensorFlow.js COCO-SSD): flags a mobile
          // phone in view of the camera. Loaded in the background (not awaited before
          // proctoring starts) and run on its own independent scan loop — decoupled from
          // the face frame loop so neither blocks the other. Any failure here never
          // disrupts the face/hands proctoring above.
          (async () => {
            try {
              await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
              await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
              if (!active || !window.cocoSsd) return;
              // Use the full mobilenet_v2 base (not the "lite" one): it is noticeably
              // more accurate at spotting a phone held straight toward the camera, which
              // the lite base often misses. It runs in its own loop so the extra cost
              // does not affect face tracking.
              const phoneModel = await window.cocoSsd.load({ base: 'mobilenet_v2' });
              if (!active) return;

              const scanForPhone = async () => {
                if (!active) return;
                if (cameraOn && videoRef.current && videoRef.current.readyState >= 2) {
                  try {
                    const predictions = await phoneModel.detect(videoRef.current);
                    if (active) handleObjectDetections(predictions);
                  } catch (e) {
                    // Ignore transient inference failures
                  }
                }
                // Run about twice per second — fast enough to catch a phone within ~1s
                // yet light enough to coexist with the face pipeline.
                objectScanTimeoutId = setTimeout(scanForPhone, 450);
              };
              scanForPhone();
            } catch (e) {
              console.warn('Object detection (phone) model unavailable; face proctoring continues.', e);
            }
          })();
        }
      } catch (err) {
        console.warn('MediaPipe initialization failed. Proctoring is active but running on fallback system event monitors.', err);
      }
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
      if (objectScanTimeoutId) {
        clearTimeout(objectScanTimeoutId);
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
          ? 'Please move closer — your full face must be clearly visible in the frame.'
          : 'Please center your full face in the camera frame.';
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
  };

  // 7b. Process MediaPipe Hand Landmarks (hands raised in front of the screen/camera)
  const handleHandResults = (results) => {
    const hands = results.multiHandLandmarks || [];
    if (hands.length === 0) return;

    for (const landmarks of hands) {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const p of landmarks) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if ((maxX - minX) > 0.28 || (maxY - minY) > 0.28) {
        logProctorViolation('HAND_DETECTED', 'Hand raised in front of the screen. Keep your hands down.');
        return;
      }
    }
  };

  // 7c. Process object detections (COCO-SSD): flag a mobile phone in the frame.
  // A phone is flagged as soon as it is seen with reasonable confidence — no sustained
  // wait — so bringing any smartphone toward the camera warns immediately. The
  // logProctorViolation throttle (same type once per 5s) already prevents spamming, so
  // an occasional noisy frame cannot pile up violations.
  const handleObjectDetections = (predictions) => {
    const phone = (predictions || []).find(
      (p) => p.class === 'cell phone' && p.score >= 0.4
    );
    if (phone) {
      logProctorViolation('PHONE_DETECTED', 'Mobile phone detected in the camera view. Please remove all devices.');
    }
  };

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

      {violationAlert && (
        <div className="p-4 bg-red-600 border border-red-500 text-white rounded-xl text-sm font-bold flex items-center gap-2.5 animate-bounce shadow-xl shadow-red-950/20">
          <AlertTriangle className="shrink-0" size={20} />
          <span>{violationAlert}</span>
        </div>
      )}

      {/* Soft (non-terminating) full-face warning (§4) */}
      {softAlert && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-400 rounded-xl text-sm font-semibold flex items-center gap-2.5">
          <ScanFace className="shrink-0" size={18} />
          <span>{softAlert}</span>
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
                onClick={() => setCameraOn(!cameraOn)}
                className={`p-1.5 rounded-lg border transition ${
                  cameraOn
                    ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    : 'bg-primary-600/10 border-primary-500 text-primary-500 dark:text-primary-400'
                }`}
                title={cameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
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
            {loading && (
              <div className="absolute inset-0 bg-white/90 dark:bg-slate-950/85 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-4">
                <div className="p-4 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-2xl animate-bounce shadow-xl">
                  <Sparkles className="text-white animate-pulse" size={32} />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Processing Response...</h3>
                  <p className="text-xs text-slate-500">Whisper & the evaluator are analyzing your answer.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="primary" size="lg" className="capitalize !normal-case">
                  {activeQuestion?.question_type} Question
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
