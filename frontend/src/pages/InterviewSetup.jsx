import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card, { CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import {
  Camera,
  Mic,
  Maximize,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Play,
} from 'lucide-react';

const InterviewSetup = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [interviewDetails, setInterviewDetails] = useState(null);

  const [cameraPermission, setCameraPermission] = useState(false);
  const [micPermission, setMicPermission] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await api.get(`/interviews/${id}/details`);
        setInterviewDetails(res.data.interview);
        if (res.data.interview.status === 'completed') {
          navigate(`/interview/report/${id}`);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load interview metadata. Please return to dashboard.');
      }
    };
    fetchDetails();
  }, [id, navigate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      stopCamera();
    };
  }, []);

  const verifyHardware = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true
      });

      streamRef.current = stream;
      setCameraPermission(true);
      setMicPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Hardware access error:', err);
      setError('Could not access camera or microphone. Please enable permissions in your browser and try again.');
      setCameraPermission(false);
      setMicPermission(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const enterFullscreen = async () => {
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen request failed:', err);
      setError('Browser fullscreen request failed. Please maximize manually or try another browser.');
    }
  };

  const beginInterview = async () => {
    if (!cameraPermission || !micPermission) {
      setError('Camera and Microphone permissions are mandatory to start.');
      return;
    }
    if (!isFullscreen) {
      setError('Full-Screen mode is required to proceed.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/interviews/${id}/details`);
      const questionsList = res.data.questions;

      stopCamera();

      navigate(`/interview/session/${id}`, {
        state: { questions: questionsList }
      });
    } catch (err) {
      setError('Could not initialize interview workspace. Please try again.');
      setLoading(false);
    }
  };

  const isReady = cameraPermission && micPermission && isFullscreen;

  const statusItems = [
    { label: 'Camera Feed', icon: Camera, granted: cameraPermission, grantedText: 'Granted', pendingText: 'Pending' },
    { label: 'Microphone Input', icon: Mic, granted: micPermission, grantedText: 'Granted', pendingText: 'Pending' },
    { label: 'Fullscreen Locked', icon: Maximize, granted: isFullscreen, grantedText: 'Enabled', pendingText: 'Exited' },
  ];

  const rules = [
    { title: 'Fullscreen Required', text: 'Exiting fullscreen mode during the session triggers an immediate integrity warning.' },
    { title: 'Tab Locking', text: 'Switching browser tabs or minimizing the window logs a focus infraction.' },
    { title: 'Face & Eye Gaze Monitoring', text: 'The AI tracker continuously checks if you are present and looking at the screen. Looking away or turning your head records a violation.' },
    { title: 'Hand Presence Check', text: 'If more than two hands appear in the camera frame, an integrity violation is recorded.' },
    { title: 'Zero Copy-Paste', text: 'Standard key combinations and copy-paste activities are blocked.' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        icon={ShieldAlert}
        title="Proctoring Checkpoint"
        subtitle="Please complete the following security configurations to start your mock interview."
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Panel */}
        <div className="md:col-span-5 space-y-6">
          <Card className="space-y-5">
            <CardTitle className="!text-base flex items-center gap-2">
              <ShieldAlert className="text-primary-500" size={18} />
              Interview Proctoring Rules
            </CardTitle>

            <div className="space-y-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {rules.map((rule) => (
                <div key={rule.title} className="flex items-start gap-2.5">
                  <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={14} />
                  <p>
                    <strong className="text-slate-700 dark:text-slate-300">{rule.title}</strong>: {rule.text}
                  </p>
                </div>
              ))}

              <Alert variant="warning" className="!text-[11px] font-semibold">
                Warning: Accumulating 3 proctoring violations automatically terminates the session and registers it as a fail.
              </Alert>
            </div>
          </Card>

          <Card className="space-y-5">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">Integrity Status</h3>

            <div className="space-y-3">
              {statusItems.map(({ label, icon: Icon, granted, grantedText, pendingText }) => (
                <div
                  key={label}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={granted ? 'text-primary-500' : 'text-slate-400 dark:text-slate-500'} size={16} />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                  </div>
                  {granted ? (
                    <Badge variant="success" size="lg" className="!normal-case !tracking-normal">
                      <CheckCircle2 size={12} />
                      {grantedText}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 font-semibold">{pendingText}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Panel */}
        <div className="md:col-span-7 space-y-6">
          <Card className="space-y-6">
            <CardTitle className="!text-base">Webcam Verification Check</CardTitle>

            <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
              {cameraPermission ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center space-y-4 p-8">
                  <Camera size={40} className="mx-auto text-slate-300 dark:text-slate-700 animate-pulse" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Enable Hardware Checks</p>
                    <p className="text-xs max-w-xs mx-auto leading-relaxed text-slate-500 dark:text-slate-500">
                      We require camera & microphone access to setup the local proctoring tracker.
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={verifyHardware}>
                    Allow Camera & Microphone
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {!isFullscreen && (
                <div className="flex flex-col gap-2 p-4 bg-primary-500/5 border border-primary-500/20 rounded-xl">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Fullscreen Locked Mode Required
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        To lock the testing terminal, the interview must run in fullscreen.
                      </p>
                    </div>
                    <Button size="sm" icon={Maximize} onClick={enterFullscreen} className="shrink-0">
                      Fullscreen
                    </Button>
                  </div>
                </div>
              )}

              <Button
                onClick={beginInterview}
                disabled={!isReady}
                loading={loading}
                size="lg"
                icon={Play}
                iconPosition="right"
                fullWidth
              >
                Enter Mock Interview Session
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default InterviewSetup;
