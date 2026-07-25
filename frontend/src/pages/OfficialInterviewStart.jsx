import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';
import {
  ShieldCheck, Camera, Mic, Maximize, EyeOff, Clock, AlertTriangle,
  PlayCircle, LogOut, CheckCircle2, ChevronLeft, CameraOff, Monitor, ScanFace, RefreshCw
} from 'lucide-react';
import { setScreenStream, clearScreenStream } from '../services/proctorScreen';
import { loadFaceApi, computeDescriptor, setBaseline, clearBaseline } from '../services/identityCheck';

/**
 * Pre-interview gate for one-time (completed-course) candidates — §3.3 steps 1–5.
 * Instructions → "Start Interview" → confirmation modal → device permission check
 * → loader → auto full-screen → hands off to the EXISTING InterviewSession flow
 * (unchanged).
 */
const OfficialInterviewStart = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 'instructions' | 'device_check' | 'identity_check'
  const [stage, setStage] = useState('instructions');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const [cameraGranted, setCameraGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [screenGranted, setScreenGranted] = useState(false);
  const [checkingDevices, setCheckingDevices] = useState(false);
  const [checkingScreen, setCheckingScreen] = useState(false);
  // Identity check (§ new step): the captured baseline photo the whole interview is
  // verified against, plus its busy/progress state.
  const [identityPhoto, setIdentityPhoto] = useState(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityStatus, setIdentityStatus] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);

  const alreadyDone = user?.interview_status === 'interview_completed';

  const stopDeviceStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => stopDeviceStream, []);

  const handleExit = async () => {
    stopDeviceStream();
    clearScreenStream();
    clearBaseline();
    await logout();
    navigate('/login');
  };

  // §New: request permission to monitor the candidate's actual computer screen. Kept as a
  // separate gesture from the camera/mic grant so each getDisplayMedia call has its own
  // user activation. The stream is handed to the InterviewSession via a module singleton
  // (it can't ride through router navigation) and periodic screenshots are taken there.
  const requestScreenAccess = async () => {
    setCheckingScreen(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // Hint the browser to preselect the whole screen. The candidate can still change
        // the choice in the picker, so the actual surface is validated below.
        video: { frameRate: 3, displaySurface: 'monitor' },
        audio: false,
      });
      const [track] = stream.getVideoTracks();
      const surface = track && track.getSettings ? track.getSettings().displaySurface : undefined;
      // Require the ENTIRE screen — reject a single window or a browser tab. A candidate
      // could otherwise share one clean window while keeping notes/answers in another that
      // the proctor never sees. (If the browser doesn't report the surface, we allow it.)
      if (surface && surface !== 'monitor') {
        stream.getTracks().forEach((t) => t.stop());
        setScreenGranted(false);
        setError('Please share your ENTIRE SCREEN — not a single window or browser tab. Click "Share Screen" again and choose "Entire Screen".');
        return;
      }
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setScreenGranted(true);
      // If the candidate stops sharing via the browser's own control, reflect it so they
      // must re-share before the interview can begin.
      if (track) {
        track.addEventListener('ended', () => setScreenGranted(false));
      }
    } catch (err) {
      console.error('Screen share error:', err);
      setError('Screen sharing is required for this proctored interview. Click "Share Screen" and choose your entire screen to continue.');
      setScreenGranted(false);
    } finally {
      setCheckingScreen(false);
    }
  };

  // §New: request camera + microphone permission with a live preview before the
  // interview is allowed to begin — mirrors the existing device checkpoint used
  // for regular mock interviews (InterviewSetup.jsx).
  const requestDeviceAccess = async () => {
    setCheckingDevices(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      streamRef.current = stream;
      setCameraGranted(true);
      setMicGranted(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Device access error:', err);
      setError('Could not access your camera or microphone. Please allow permissions in your browser and try again.');
      setCameraGranted(false);
      setMicGranted(false);
    } finally {
      setCheckingDevices(false);
    }
  };

  // The live preview <video> is rendered inside each stage's own JSX branch, so moving from
  // the device check to the identity check remounts it and drops srcObject. Re-attach the
  // already-granted stream whenever the stage changes instead of asking for the camera again.
  useEffect(() => {
    if ((stage === 'device_check' || stage === 'identity_check') && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [stage, cameraGranted]);

  // §New identity check: capture ONE photo of the candidate and turn it into the baseline
  // face descriptor. Everything heavy (library + models) is downloaded here, on this static
  // screen, so the interview itself never pays that cost and can't hang because of it.
  const captureIdentity = async () => {
    setIdentityBusy(true);
    setError('');
    try {
      setIdentityStatus('Preparing face verification…');
      await loadFaceApi();

      const vid = videoRef.current;
      if (!vid || !vid.videoWidth) {
        setError('Your camera preview is not ready yet. Wait a moment and try again.');
        return;
      }

      setIdentityStatus('Checking your face…');
      const descriptor = await computeDescriptor(vid);
      if (!descriptor) {
        setError('No face was detected. Sit facing the camera in good lighting, remove anything covering your face, then capture again.');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth;
      canvas.height = vid.videoHeight;
      canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.8);

      setBaseline(descriptor, image);
      setIdentityPhoto(image);
    } catch (err) {
      console.error('Identity check failed:', err);
      setError('Face verification could not be prepared. Check your internet connection and press Retry. If it keeps failing, contact the administrator.');
    } finally {
      setIdentityStatus('');
      setIdentityBusy(false);
    }
  };

  const retakeIdentity = () => {
    clearBaseline();
    setIdentityPhoto(null);
    setError('');
  };

  const openConfirm = () => setConfirmOpen(true);

  const proceedToDeviceCheck = () => {
    setConfirmOpen(false);
    setStage('device_check');
  };

  const startInterview = async () => {
    stopDeviceStream();
    setStarting(true);
    setError('');

    // Enter full-screen first — the Fullscreen API requires a user gesture, and this
    // runs directly from the "Begin Interview" click. It persists across SPA
    // navigation, so the session page (with its existing camera/proctoring init)
    // opens already full-screen without any changes to that logic.
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (fsErr) {
      console.warn('Fullscreen request failed (continuing anyway):', fsErr);
    }

    try {
      const res = await api.post('/interviews/start', {
        type: 'technical',
        job_role: user?.job_role || 'Software Engineer',
        experience_level: user?.experience_level || 'Entry',
        difficulty: 'Medium',
        num_questions: 5,
      });
      navigate(`/interview/session/${res.data.interview.id}`, {
        state: { questions: res.data.questions },
        replace: true,
      });
    } catch (err) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setError(err.response?.data?.message || 'Could not initialize your interview session. Please try again.');
      setStarting(false);
    }
  };

  const rules = [
    { icon: Camera, text: 'A working webcam is required and must stay on for the entire interview. AI proctoring monitors your camera feed throughout.' },
    { icon: Mic, text: 'A working microphone is required — you will answer the questions by voice (typed answers are also accepted).' },
    { icon: Maximize, text: 'The interview runs in full-screen. Do not exit full-screen, switch tabs, or minimize the window.' },
    { icon: EyeOff, text: 'Stay alone, keep your face visible, and look at the screen. Multiple faces, looking away, or leaving the frame are flagged as violations.' },
    { icon: ScanFace, text: 'Before starting, we capture a photo of you. If the person on camera changes during the interview, the session is terminated immediately.' },
    { icon: Monitor, text: 'Your screen is monitored — you must share your entire screen, and periodic screenshots are recorded for the proctoring audit.' },
    { icon: AlertTriangle, text: 'Three integrity violations automatically terminate the interview.' },
    { icon: Clock, text: 'You have exactly ONE attempt with this login. Once the interview ends you will be signed out automatically.' },
  ];

  const devicesReady = cameraGranted && micGranted && screenGranted;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
        <BrandLogo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={handleExit}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-xl transition"
            title="Sign out without starting"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6 animate-fade-in">
        {alreadyDone ? (
          <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent-500/15 text-accent-500 flex items-center justify-center">
              <CheckCircle2 size={36} />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Interview already completed</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Thank you for giving the interview. Our HR team will proceed with the next steps. You can close this tab now.
            </p>
          </div>
        ) : stage === 'device_check' ? (
          <>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-primary-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <ShieldCheck className="text-white" size={28} />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
                Camera & Microphone Check
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                We need to verify your hardware before your one-time session begins.
              </p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
                {cameraGranted ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <CameraOff size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Camera & microphone access required</p>
                      <p className="text-xs max-w-xs mx-auto leading-relaxed text-slate-500 dark:text-slate-500">
                        Your browser will ask for permission. Allow both to continue.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={requestDeviceAccess} loading={checkingDevices}>
                      Allow Camera & Microphone
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                  <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                    <Camera size={15} className={cameraGranted ? 'text-primary-500' : 'text-slate-400'} />
                    Camera
                  </span>
                  <Badge variant={cameraGranted ? 'success' : 'neutral'}>{cameraGranted ? 'Granted' : 'Pending'}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                  <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                    <Mic size={15} className={micGranted ? 'text-primary-500' : 'text-slate-400'} />
                    Microphone
                  </span>
                  <Badge variant={micGranted ? 'success' : 'neutral'}>{micGranted ? 'Granted' : 'Pending'}</Badge>
                </div>
              </div>

              {/* Screen monitoring grant — its own gesture (getDisplayMedia). Required before
                  the interview can begin so the proctoring audit can record the screen. */}
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                  <Monitor size={15} className={screenGranted ? 'text-primary-500' : 'text-slate-400'} />
                  Screen sharing
                </span>
                {screenGranted ? (
                  <Badge variant="success">Sharing</Badge>
                ) : (
                  <Button variant="secondary" size="sm" onClick={requestScreenAccess} loading={checkingScreen}>
                    Share Screen
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    stopDeviceStream();
                    setCameraGranted(false);
                    setMicGranted(false);
                    setStage('instructions');
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                  disabled={starting}
                >
                  <ChevronLeft size={14} /> Back
                </button>
                <Button
                  size="lg"
                  icon={ScanFace}
                  onClick={() => {
                    setError('');
                    setStage('identity_check');
                  }}
                  disabled={!devicesReady || starting}
                >
                  Continue to Identity Check
                </Button>
              </div>
            </div>
          </>
        ) : stage === 'identity_check' ? (
          <>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-primary-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <ScanFace className="text-white" size={28} />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
                Identity Verification
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                We'll capture one photo of you now. Throughout the interview the system checks
                that the person on camera is still you.
              </p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
                {identityPhoto ? (
                  <>
                    <img
                      src={identityPhoto}
                      alt="Captured identity photo"
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <Badge variant="success" className="absolute top-2 left-2">Photo captured</Badge>
                  </>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    {/* Face-placement guide so the candidate centres themselves. */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-40 h-52 rounded-[50%] border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
                    </div>
                  </>
                )}
                {identityBusy && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs font-semibold text-white">{identityStatus || 'Working…'}</p>
                  </div>
                )}
              </div>

              {!identityPhoto ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                    Center your face inside the oval, look straight at the camera in good light,
                    and remove sunglasses, masks or caps.
                  </p>
                  <div className="flex justify-center">
                    <Button size="lg" icon={ScanFace} onClick={captureIdentity} loading={identityBusy}>
                      {error ? 'Retry Capture' : 'Capture My Photo'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                    The first capture downloads the verification models — this can take a few
                    seconds on a slow connection.
                  </p>
                </div>
              ) : (
                <Alert variant="success" className="text-xs">
                  Identity captured. If anyone else appears on camera during the interview, the
                  session is terminated immediately.
                </Alert>
              )}

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    retakeIdentity();
                    setStage('device_check');
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                  disabled={starting || identityBusy}
                >
                  <ChevronLeft size={14} /> Back
                </button>
                <div className="flex items-center gap-3">
                  {identityPhoto && (
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={retakeIdentity} disabled={starting}>
                      Retake
                    </Button>
                  )}
                  <Button
                    size="lg"
                    icon={PlayCircle}
                    onClick={startInterview}
                    disabled={!identityPhoto || starting}
                  >
                    Begin Interview
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-primary-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <ShieldCheck className="text-white" size={28} />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
                Official Interview — {user?.course_category || 'Assessment'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Welcome, <b>{user?.name}</b>. Please read the instructions carefully before starting.
              </p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <div className="glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-5">
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Interview Rules & Requirements
              </h2>
              <ul className="space-y-4">
                {rules.map((rule, idx) => {
                  const Icon = rule.icon;
                  return (
                    <li key={idx} className="flex items-start gap-3.5">
                      <span className="shrink-0 w-9 h-9 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center border border-primary-500/20 mt-0.5">
                        <Icon size={17} />
                      </span>
                      <span className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{rule.text}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center gap-3">
                <Button
                  size="lg"
                  icon={PlayCircle}
                  onClick={openConfirm}
                  disabled={starting}
                >
                  Start Interview
                </Button>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Your one-time session is active. The attempt is only consumed once the interview begins.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Confirmation modal — §3.3 step 3 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-primary-500/30 space-y-5 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center">
              <PlayCircle size={30} />
            </div>
            <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
              Are you ready to start the interview?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Next, we'll check your camera and microphone. Once verified, the session will enter full-screen and AI proctoring will begin immediately.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={proceedToDeviceCheck}>
                Yes, Start
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state — §3.3 step 4 */}
      {starting && (
        <div className="fixed inset-0 z-[60] bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Preparing your interview session…</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Generating questions and initializing the proctoring system.</p>
        </div>
      )}
    </div>
  );
};

export default OfficialInterviewStart;
