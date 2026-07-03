import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
  Camera, 
  Mic, 
  Maximize, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Play, 
  AlertCircle
} from 'lucide-react';

const InterviewSetup = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [interviewDetails, setInterviewDetails] = useState(null);

  // Verification states
  const [cameraPermission, setCameraPermission] = useState(false);
  const [micPermission, setMicPermission] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Fetch active interview details
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

  // Listen to fullscreen changes
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

  // Request Camera & Mic permissions
  const verifyHardware = async () => {
    setError('');
    try {
      // 1. Request Camera & Mic stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }, 
        audio: true 
      });
      
      streamRef.current = stream;
      setCameraPermission(true);
      setMicPermission(true);

      // Render camera preview
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

  // Request Fullscreen
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

  // Start the actual interview
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
      // Fetch questions to pass to the session page
      const res = await api.get(`/interviews/${id}/details`);
      const questionsList = res.data.questions;

      stopCamera();
      
      // Navigate to interview workspace, passing questions in router state
      navigate(`/interview/session/${id}`, {
        state: { questions: questionsList }
      });
    } catch (err) {
      setError('Could not initialize interview workspace. Please try again.');
      setLoading(false);
    }
  };

  const isReady = cameraPermission && micPermission && isFullscreen;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Proctoring Checkpoint</h1>
        <p className="text-sm text-slate-400">Please complete the following security configurations to start your mock interview.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* Left Panel: Proctoring Security Rules (col-span-5) */}
        <div className="md:col-span-5 space-y-6">
          
          {/* Rules Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <ShieldAlert className="text-primary-400" size={18} />
              <span>Interview Proctoring Rules</span>
            </h3>
            
            <div className="space-y-4 text-xs leading-relaxed text-slate-400">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={14} />
                <p><strong className="text-slate-300">Fullscreen Required</strong>: Exiting fullscreen mode during the session triggers an immediate integrity warning.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={14} />
                <p><strong className="text-slate-300">Tab Locking</strong>: Switching browser tabs or minimizing the window logs a focus infraction.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={14} />
                <p><strong className="text-slate-300">Face & Eye Gaze Monitoring</strong>: The AI tracker continuously checks if you are present and looking at the screen. Looking away or turning your head records a violation.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={14} />
                <p><strong className="text-slate-300">Zero Copy-Paste</strong>: Standard key combinations and copy-paste activities are blocked.</p>
              </div>
              
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 font-semibold text-[11px]">
                ⚠️ Warning: Accumulating 3 proctoring violations automatically terminates the session and registers it as a fail.
              </div>
            </div>
          </div>
          
          {/* Hardware Verification Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="font-bold text-white text-sm">Integrity Status</h3>
            
            <div className="space-y-3.5">
              {/* Camera Status */}
              <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  <Camera className={cameraPermission ? 'text-primary-400' : 'text-slate-500'} size={16} />
                  <span className="font-semibold text-slate-300">Camera Feed</span>
                </div>
                {cameraPermission ? (
                  <span className="text-primary-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={14} /> Granted
                  </span>
                ) : (
                  <span className="text-slate-500 font-semibold">Pending</span>
                )}
              </div>

              {/* Microphone Status */}
              <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  <Mic className={micPermission ? 'text-primary-400' : 'text-slate-500'} size={16} />
                  <span className="font-semibold text-slate-300">Microphone Input</span>
                </div>
                {micPermission ? (
                  <span className="text-primary-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={14} /> Granted
                  </span>
                ) : (
                  <span className="text-slate-500 font-semibold">Pending</span>
                )}
              </div>

              {/* Fullscreen Status */}
              <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-xs">
                <div className="flex items-center gap-2.5">
                  <Maximize className={isFullscreen ? 'text-primary-400' : 'text-slate-500'} size={16} />
                  <span className="font-semibold text-slate-300">Fullscreen Locked</span>
                </div>
                {isFullscreen ? (
                  <span className="text-primary-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={14} /> Enabled
                  </span>
                ) : (
                  <span className="text-slate-500 font-semibold">Exited</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Right Panel: Webcam Preview & Actions (col-span-7) */}
        <div className="md:col-span-7 space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <h3 className="font-extrabold text-white text-base">Webcam Verification Check</h3>
            
            {/* Webcam Window */}
            <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-900 overflow-hidden flex items-center justify-center">
              {cameraPermission ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center space-y-3 p-8 text-slate-500">
                  <Camera size={40} className="mx-auto text-slate-700 animate-pulse" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-400">Enable Hardware Checks</p>
                    <p className="text-xs max-w-xs mx-auto leading-relaxed">
                      We require camera & microphone access to setup the local proctoring tracker.
                    </p>
                  </div>
                  <button
                    onClick={verifyHardware}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-xs font-bold text-slate-300 rounded-lg transition"
                  >
                    Allow Camera & Microphone
                  </button>
                </div>
              )}
            </div>

            {/* Verification Checklist Triggers */}
            <div className="space-y-4 pt-2">
              {!isFullscreen && (
                <div className="flex flex-col gap-2 p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-200">Fullscreen Locked Mode Required</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        To lock the testing terminal, the interview must run in fullscreen.
                      </p>
                    </div>
                    <button
                      onClick={enterFullscreen}
                      className="shrink-0 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg shadow-primary-600/15 transition-all"
                    >
                      <Maximize size={12} />
                      <span>Fullscreen</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Start Interview Button */}
              <button
                onClick={beginInterview}
                disabled={loading || !isReady}
                className="w-full py-4 rounded-xl bg-gradient-to-tr from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-650 disabled:from-slate-900 disabled:to-slate-900 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 border border-primary-400/20 shadow-xl shadow-primary-500/20 transition-all hover:scale-[1.01]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Enter Mock Interview Session</span>
                    <Play size={14} fill="white" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default InterviewSetup;
