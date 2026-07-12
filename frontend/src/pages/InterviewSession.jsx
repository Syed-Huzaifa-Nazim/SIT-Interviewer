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
  Square,
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
  AlertTriangle
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

  // Camera & MediaPipe states
  const [cameraOn, setCameraOn] = useState(true);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [violationsCount, setViolationsCount] = useState(0);
  const violationsCountRef = useRef(0);
  const [violationAlert, setViolationAlert] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordedAudioBlobRef = useRef(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const lastViolationTimeRef = useRef({});

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const durationTimerRef = useRef(null);

  // General session timer
  const [sessionTime, setSessionTime] = useState(0);

  // 1. Setup Session Timers
  useEffect(() => {
    const sTimer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);

    const fetchQuestions = async () => {
      try {
        const res = await api.get(`/interviews/${id}/details`);
        if (res.data.interview.status === 'completed') {
          navigate(`/interview/report/${id}`);
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
      clearInterval(durationTimerRef.current);
    };
  }, [id, questions.length, navigate]);

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

  // 3. Send Proctor Log payload to backend
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
        navigate(`/interview/report/${id}`, { state: { proctorFailed: true } });
      }
    } catch (err) {
      console.error('Failed to log violation to server:', err);
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
          setProctoringActive(true);
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

  // 7. Process MediaPipe Face Landmarks (Face counts / gaze & look-away checks)
  const handleProctoringResults = (results) => {
    const faces = results.multiFaceLandmarks || [];
    
    // Multiple Person Detection
    if (faces.length >= 2) {
      logProctorViolation('MULTIPLE_FACES', 'Multiple people detected in front of the camera.');
      return;
    }

    // No Face Detection
    if (faces.length === 0) {
      logProctorViolation('NO_FACE', 'No face detected. Please look directly into the camera.');
      return;
    }

    // Face look-away / Gaze tracking
    const landmarks = faces[0];
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

    // Only flag a hand that is prominently in front of the camera (i.e. held up
    // close to the screen). A large bounding box means the hand is near the lens.
    // Small/distant hand movement (natural typing, resting) is ignored so the
    // proctor does not fire false violations.
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

  // 8. Recording Duration timer
  useEffect(() => {
    if (isRecording) {
      durationTimerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(durationTimerRef.current);
      setRecordDuration(0);
    }
    return () => clearInterval(durationTimerRef.current);
  }, [isRecording]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // 9. Audio Recording Controls
  const startRecording = async () => {
    audioChunksRef.current = [];
    setError('');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        transcribeSpeech(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start(250);
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access error:', err);
      setError('Could not access microphone. Please check permissions or switch to Text Mode.');
      setInputMode('text');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeSpeech = async (audioBlob) => {
    setIsTranscribing(true);
    setError('');
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'response.webm');

    try {
      const res = await api.post('/interviews/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setTypedAnswer(res.data.transcript || '');
      recordedAudioBlobRef.current = audioBlob;
      setIsReviewingTranscript(true);
    } catch (err) {
      console.error('Failed to transcribe audio:', err);
      const detail = err.response?.data?.message;
      setError(
        detail
          ? `${detail} You can type your answer in the text box below.`
          : 'Speech transcription is unavailable right now. Please type your answer in the text box below.'
      );
      setInputMode('text');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleConfirmSubmit = async () => {
    // Only clear the reviewed transcript/audio once the submission actually succeeds,
    // so a mid-session network drop doesn't discard the candidate's answer (§12).
    const ok = await submitAnswer(recordedAudioBlobRef.current);
    if (ok) {
      setIsReviewingTranscript(false);
      recordedAudioBlobRef.current = null;
    }
  };

  const handleDiscardRecord = () => {
    setIsReviewingTranscript(false);
    setTypedAnswer('');
    recordedAudioBlobRef.current = null;
  };

  // 10. Submit Answer payload. Returns true on success, false on failure so callers
  // can preserve the candidate's answer for retry (§12).
  const submitAnswer = async (audioBlob = null) => {
    const activeQuestion = questions[currentIdx];
    if (!activeQuestion) return false;

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('question_id', activeQuestion.id);

    if (audioBlob) {
      formData.append('audio', audioBlob, 'response.webm');
      formData.append('duration', recordDuration);
    } else {
      formData.append('response_text', typedAnswer);
      formData.append('duration', 0);
    }

    try {
      const res = await api.post(`/interviews/${id}/submit-answer`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setTypedAnswer('');

      if (res.data.is_completed) {
        stopCamera();
        navigate(`/interview/report/${id}`);
      } else {
        setCurrentIdx(prev => prev + 1);
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit response. Your answer was kept — please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const activeQuestion = questions[currentIdx];

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

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Session Header */}
      <Card padding={false} className="px-5 py-4 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Badge variant="primary" size="lg" className="!normal-case !tracking-normal mb-1">
              Mock Session Active
            </Badge>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Question {currentIdx + 1} of {questions.length}
            </h2>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
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

          {/* Interview progress indicator (§12) */}
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
                {loading ? 'Analyzing response...' : isRecording ? 'Listening...' : 'Awaiting Reply'}
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
                Accumulating 3 infractions automatically voids and terminates this session, resulting in a day-ban from mock interviews.
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
                  <p className="text-xs text-slate-500">Mixtral & Whisper are evaluating your input.</p>
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

            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center">
              {inputMode === 'voice' ? (
                <div className="flex flex-col items-center space-y-6 w-full max-w-md">
                  {isTranscribing ? (
                    <Spinner size="md" label="Transcribing your response with Whisper STT..." className="py-6 w-full" />
                  ) : isReviewingTranscript ? (
                    <div className="w-full space-y-4 text-left">
                      <div className="p-3.5 bg-primary-500/5 border border-primary-500/20 rounded-xl">
                        <h4 className="text-xs font-bold text-primary-500 dark:text-primary-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                          <Sparkles size={12} className="animate-pulse" />
                          Review Transcribed Response
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          We've converted your speech to text. Double-check and correct any typos or grammar details below before submitting.
                        </p>
                      </div>

                      <textarea
                        className="w-full glass-input min-h-32 text-sm resize-none"
                        value={typedAnswer}
                        onChange={(e) => setTypedAnswer(e.target.value)}
                        disabled={loading}
                      />

                      <div className="flex gap-3">
                        <Button
                          onClick={handleConfirmSubmit}
                          disabled={loading}
                          loading={loading}
                          size="sm"
                          fullWidth
                        >
                          {loading ? 'Evaluating...' : 'Confirm & Submit Answer'}
                        </Button>

                        <Button variant="secondary" size="sm" onClick={handleDiscardRecord} disabled={loading}>
                          Discard
                        </Button>
                      </div>
                    </div>
                  ) : isRecording ? (
                    <div className="space-y-6 text-center w-full">
                      <div className="h-16 flex items-center justify-center">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className="wave-bar" />
                        ))}
                      </div>

                      <div className="space-y-1">
                        <span className="text-red-500 dark:text-red-400 font-bold text-sm block">Recording Answer...</span>
                        <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">{formatTime(recordDuration)}</span>
                      </div>

                      <button
                        onClick={stopRecording}
                        className="mx-auto w-16 h-16 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center border border-red-500/30 shadow-xl shadow-red-600/20 transition-all hover:scale-105 cursor-pointer"
                      >
                        <Square size={24} fill="white" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-6 w-full">
                      <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Click the microphone and start speaking your answer.
                      </p>

                      <button
                        onClick={startRecording}
                        className="mx-auto w-20 h-20 bg-gradient-to-tr from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white rounded-full flex items-center justify-center border border-primary-400/20 shadow-xl shadow-primary-500/25 transition-all hover:scale-105 cursor-pointer"
                      >
                        <Mic size={32} />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setInputMode('text');
                      setIsReviewingTranscript(false);
                    }}
                    className="text-xs text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 font-semibold flex items-center gap-1.5 transition pt-4 cursor-pointer"
                  >
                    <Type size={14} />
                    Switch to Typed Input
                  </button>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Type your answer here</label>
                    <textarea
                      className="w-full glass-input min-h-36 text-sm resize-none"
                      placeholder="Explain your approach, list architectural layers or code fragments details..."
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
                      onClick={() => submitAnswer(null)}
                      disabled={loading || !typedAnswer.trim()}
                      loading={loading}
                      size="sm"
                      icon={Send}
                      iconPosition="right"
                    >
                      Submit Answer
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
