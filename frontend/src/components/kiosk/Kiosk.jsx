import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Shield, RefreshCw, AlertCircle, ArrowLeftRight, LogIn, LogOut, CheckCircle2, VideoOff, Eye, ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';

export default function Kiosk() {
  const { API_URL } = useAuth();
  const { addNotification } = useNotification();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  const [activeDetections, setActiveDetections] = useState([]);
  const [identifiedTeacher, setIdentifiedTeacher] = useState(null);
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [mode, setMode] = useState('CHECK_IN'); // 'CHECK_IN' or 'CHECK_OUT'

  // Anti-Spoofing Blink Verification State Machine
  const [isLivenessVerified, setIsLivenessVerified] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState('IDLE'); // 'IDLE', 'WAITING_BLINK', 'BLINK_DETECTED', 'VERIFIED'
  const [livenessMessage, setLivenessMessage] = useState('');
  const [currentOpennessScore, setCurrentOpennessScore] = useState(0.0);
  const livenessStepRef = useRef('IDLE');
  const peakOpennessRef = useRef(1.0);

  // Live Digital Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Ref to track active state synchronously and prevent async race conditions
  const isKioskActiveRef = useRef(false);

  // Persistent historical list of recorded transactions in the session
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  // Clock tick interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Start Kiosk Webcam
  const startKiosk = async () => {
    setIsInitializing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        isKioskActiveRef.current = true;
        setIsKioskActive(true);
        startScanningLoop();
        addNotification('Doorway Kiosk activated.', 'success');
      } else {
        throw new Error("Webcam video element ref binding failed.");
      }
    } catch (err) {
      console.error(err);
      addNotification('Kiosk webcam startup failed. Please verify permissions.', 'error');
    } finally {
      setIsInitializing(false);
    }
  };

  // Stop Kiosk Webcam (fully releasing hardware in Chrome)
  const stopKiosk = (showNotification = true) => {
    isKioskActiveRef.current = false;
    
    // 1. Clear scanning loop interval first
    try {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    } catch (e) {
      console.error("Error clearing scan interval:", e);
    }

    // 2. Pause video element to stop rendering thread
    try {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      console.error("Error pausing video element:", e);
    }

    // 3. Stop all media tracks to turn off the physical camera light
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try {
            track.stop();
            console.log("Released webcam track:", track.label);
          } catch (err) {
            console.error("Error stopping track:", err);
          }
        });
        streamRef.current = null;
      }
    } catch (e) {
      console.error("Error stopping media stream:", e);
    }

    // 4. Reset UI states
    try {
      setIsKioskActive(false);
      setActiveDetections([]);
      setIdentifiedTeacher(null);
      livenessStepRef.current = 'IDLE';
      setLivenessStatus('IDLE');
      setIsLivenessVerified(false);
      setLivenessMessage('');
      clearCanvas();
      if (showNotification) {
        addNotification('Doorway Kiosk stopped.', 'info');
      }
    } catch (e) {
      console.error("Error updating UI states on stop:", e);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Scan live frame (Identify only, no database logging)
  const scanFrame = async () => {
    if (!videoRef.current || !streamRef.current || !isKioskActiveRef.current) return;
    
    // Capture frame on offscreen canvas
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = videoRef.current.videoWidth || 640;
    captureCanvas.height = videoRef.current.videoHeight || 480;
    const captureCtx = captureCanvas.getContext('2d');
    
    // Unmirrored frame for backend InsightFace engine
    captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
    const frameB64 = captureCanvas.toDataURL('image/jpeg', 0.85);

    try {
      const response = await axios.post(`${API_URL}/verification/identify`, {
        image: frameB64
      });

      // Discard response if kiosk was stopped while the request was in flight
      if (!isKioskActiveRef.current) {
        console.log("Discarded in-flight frame scan because kiosk was stopped.");
        return;
      }

      const { status, detections } = response.data;
      
      if (status === 'SUCCESS' && detections.length > 0) {
        setActiveDetections(detections);
        
        // Find the first recognized face
        const firstMatch = detections.find(d => d.teacher_id && d.teacher_id !== 'N/A');
        if (firstMatch) {
          const score = firstMatch.eye_openness ?? 4.0;
          const isEyeOpen = firstMatch.is_eye_open ?? true;
          setCurrentOpennessScore(score);

          setIdentifiedTeacher(prev => {
            if (!prev || prev.teacher_id !== firstMatch.teacher_id) {
              livenessStepRef.current = 'WAITING_BLINK';
              setLivenessStatus('WAITING_BLINK');
              setIsLivenessVerified(false);
              peakOpennessRef.current = Math.max(score, 2.0);
              setLivenessMessage('👁️ ANTI-SPOOFING CHECK: Please BLINK your eyes once to verify liveness.');
            }
            return firstMatch;
          });

          // Dynamic peak tracking
          if (score > peakOpennessRef.current) {
            peakOpennessRef.current = score;
          }

          const relativeRatio = score / (peakOpennessRef.current || 1.0);

          if (livenessStepRef.current === 'WAITING_BLINK') {
            if (!isEyeOpen || relativeRatio < 0.65) {
              livenessStepRef.current = 'BLINK_DETECTED';
              setLivenessStatus('BLINK_DETECTED');
              setLivenessMessage('🙈 Blink detected! Re-open eyes to complete verification...');
            }
          } else if (livenessStepRef.current === 'BLINK_DETECTED') {
            if (isEyeOpen && relativeRatio > 0.75) {
              livenessStepRef.current = 'VERIFIED';
              setLivenessStatus('VERIFIED');
              setIsLivenessVerified(true);
              setLivenessMessage('✅ Anti-Spoofing Passed: Real Person Verified!');
            }
          }
        } else {
          setIdentifiedTeacher(null);
          livenessStepRef.current = 'IDLE';
          setLivenessStatus('IDLE');
          setIsLivenessVerified(false);
          setLivenessMessage('');
          setCurrentOpennessScore(0.0);
        }
        
        drawBoundingBoxes(detections);
      } else {
        setActiveDetections([]);
        setIdentifiedTeacher(null);
        livenessStepRef.current = 'IDLE';
        setLivenessStatus('IDLE');
        setIsLivenessVerified(false);
        setLivenessMessage('');
        clearCanvas();
      }
    } catch (err) {
      console.error("Frame scan failed", err);
    }
  };

  const startScanningLoop = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = setInterval(scanFrame, 800); // Scan every 800ms
  };

  // Explicit confirmation submit handler
  const handleConfirmAttendance = async () => {
    if (!identifiedTeacher) return;

    if (!isLivenessVerified) {
      addNotification('🛡️ Anti-Spoofing Security: Please blink your eyes once to verify you are a live person!', 'warning', 4000);
      return;
    }
    setIsConfirming(true);
    try {
      const response = await axios.post(`${API_URL}/verification/confirm`, {
        teacher_id: identifiedTeacher.teacher_id,
        action: mode
      });

      const { status, message, working_hours } = response.data;

      // Handle custom user-facing notifications based on database state engine response
      if (status === 'CHECKED_IN') {
        addNotification(`✅ Check-In Logged: ${identifiedTeacher.name}`, 'success');
      } else if (status === 'CHECKED_OUT') {
        addNotification(`📤 Check-Out Logged: ${identifiedTeacher.name} (${working_hours}h)`, 'success');
      } else if (status === 'ALREADY_CHECKED_IN') {
        addNotification(`⚠️ You are already checked in. Kindly check out first.`, 'warning', 5000);
      } else if (status === 'NOT_CHECKED_IN') {
        addNotification(`❌ You must check in before you can check out!`, 'error', 5000);
      } else if (status === 'COOLDOWN_ACTIVE') {
        addNotification(`⏳ Scan registered too quickly. Please wait.`, 'warning');
      }

      // Add to Session History feed
      const newHistoryLog = {
        teacher_id: identifiedTeacher.teacher_id,
        name: identifiedTeacher.name,
        department: identifiedTeacher.department,
        status: status,
        message: message,
        timestamp: new Date().toLocaleTimeString()
      };

      setAttendanceHistory(prev => [newHistoryLog, ...prev]);

    } catch (err) {
      console.error(err);
      addNotification('Biometric confirmation failed.', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  // Draw overlays
  const drawBoundingBoxes = (detections) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;

    detections.forEach(det => {
      const { xmin, ymin, xmax, ymax } = det.bbox_coordinates;
      const boxWidth = (xmax - xmin) * scaleX;
      const boxHeight = (ymax - ymin) * scaleY;
      const mirroredX = canvas.width - (xmin * scaleX) - boxWidth;
      const startY = ymin * scaleY;

      const isKnown = det.teacher_id !== 'N/A';
      const isThisVerified = isKnown && isLivenessVerified;
      const color = isThisVerified 
        ? '#10b981' // Green when live & verified
        : isKnown 
        ? '#f59e0b' // Amber when recognized but pending blink on this face
        : '#f43f5e'; // Red for unknown faces

      // Bounding box with clean rounded joins
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeRect(mirroredX, startY, boxWidth, boxHeight);

      // Label background (clean pill tag)
      ctx.fillStyle = color;
      const labelText = isKnown 
        ? isThisVerified
          ? `✅ ${det.name} (Verified Live)`
          : `👁️ ${det.name} (Blink Required)`
        : `🚫 Unknown Person`;
      
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const labelWidth = ctx.measureText(labelText).width + 14;
      
      ctx.beginPath();
      ctx.roundRect(mirroredX - 1, Math.max(2, startY - 24), labelWidth, 20, 6);
      ctx.fill();

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, mirroredX + 5, Math.max(15, startY - 10));
    });
  };

  useEffect(() => {
    return () => stopKiosk(false);
  }, []);

  // Format Date for Header
  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Top Header Card */}
      <div className="glass-panel p-6 rounded-2xl shadow-sm border border-slate-200/80 bg-white relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Glow */}
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Shield size={24} className="text-indigo-600" />
              FacultyPass AI
            </h2>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100/50">
              Terminal #01 — Active
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Choose Check-In/Out mode, scan your face, and click the confirmation option below.
          </p>
        </div>

        {/* Live Digital Clock */}
        <div className="flex flex-col items-end text-right font-sans">
          <div className="text-lg font-bold text-slate-800 tracking-tight">{formattedTime}</div>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">{formattedDate}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Live camera viewport & Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main camera card */}
          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-md relative aspect-[4/3] flex items-center justify-center">
            
            {/* Live Camera Feed */}
            <div className={isKioskActive ? "w-full h-full relative" : "hidden"}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              />

              {/* Viewport Crosshair Focus Reticles */}
              <div className="absolute top-5 left-5 w-4 h-4 border-t-2 border-l-2 border-slate-400/50 pointer-events-none"></div>
              <div className="absolute top-5 right-5 w-4 h-4 border-t-2 border-r-2 border-slate-400/50 pointer-events-none"></div>
              <div className="absolute bottom-5 left-5 w-4 h-4 border-b-2 border-l-2 border-slate-400/50 pointer-events-none"></div>
              <div className="absolute bottom-5 right-5 w-4 h-4 border-b-2 border-r-2 border-slate-400/50 pointer-events-none"></div>

              {/* Live camera badge */}
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-full text-[10px] font-bold text-slate-700 shadow-sm flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE CAMERA SCANNER
              </div>
            </div>

            {/* Inactive Placeholder Screen */}
            {!isKioskActive && (
              <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-4 p-8">
                <div className="p-4 bg-white rounded-full shadow-sm border border-slate-200">
                  <VideoOff size={36} className="text-slate-300 stroke-[1.5]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-700">Doorway Kiosk is Inactive</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">Activate the camera stream to start biometric face checks at the doorway.</p>
                </div>
                <button
                  onClick={startKiosk}
                  disabled={isInitializing}
                  className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/10 flex items-center gap-2"
                >
                  {isInitializing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Camera size={14} />
                      Activate Webcam Terminal
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Mode Selector & Stop Action Controls */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3">
            {/* Check-In / Check-Out Selector */}
            <div className="flex-1 flex gap-2">
              <button
                onClick={() => {
                  setMode('CHECK_IN');
                }}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  mode === 'CHECK_IN'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm shadow-emerald-500/5'
                    : 'bg-white hover:bg-slate-50 text-slate-500 border border-slate-200'
                }`}
              >
                <LogIn size={15} />
                Check-In Mode
              </button>
              <button
                onClick={() => {
                  setMode('CHECK_OUT');
                }}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  mode === 'CHECK_OUT'
                    ? 'bg-amber-50 text-amber-700 border border-amber-100 shadow-sm shadow-amber-500/5'
                    : 'bg-white hover:bg-slate-50 text-slate-500 border border-slate-200'
                }`}
              >
                <LogOut size={15} />
                Check-Out Mode
              </button>
            </div>

            {/* Stop Camera Trigger */}
            {isKioskActive && (
              <button
                onClick={stopKiosk}
                className="py-3 px-5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-150 transition flex items-center justify-center gap-2 shadow-sm shadow-rose-500/5"
              >
                <VideoOff size={15} />
                Stop Camera
              </button>
            )}
          </div>

          {/* DYNAMIC FACE LOG CONFIRMATION COMPONENT */}
          {isKioskActive && identifiedTeacher && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-md text-center space-y-4 animate-fade-in relative overflow-hidden">
              {/* Highlight status border tint */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${mode === 'CHECK_IN' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>

              <div className="text-sm font-semibold text-slate-700 flex items-center justify-center gap-2">
                <CheckCircle2 size={16} className={`${mode === 'CHECK_IN' ? 'text-emerald-500' : 'text-amber-500'} animate-pulse`} />
                Faculty Recognized: <span className="text-slate-900 font-bold">{identifiedTeacher.name}</span>
                <span className="text-slate-400 text-xs font-normal">({identifiedTeacher.department})</span>
              </div>

              {/* Anti-Spoofing Blink Verification Prompt Banner */}
              <div className={`p-3 rounded-xl border flex flex-col gap-2 transition-all ${
                isLivenessVerified 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : livenessStatus === 'BLINK_DETECTED'
                  ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-800 animate-pulse'
              }`}>
                <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                  <div className="flex items-center gap-2 text-left">
                    {isLivenessVerified ? (
                      <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                    ) : (
                      <Eye size={18} className="text-indigo-600 shrink-0 animate-bounce" />
                    )}
                    <span>{livenessMessage || '👁️ Anti-Spoofing: Please BLINK your eyes once to verify liveness'}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                    isLivenessVerified 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-indigo-600 text-white'
                  }`}>
                    {isLivenessVerified ? 'VERIFIED' : 'BLINK REQUIRED'}
                  </span>
                </div>

                {/* Live Eye Openness Telemetry Bar */}
                <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden flex items-center">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      isLivenessVerified 
                        ? 'bg-emerald-500' 
                        : livenessStatus === 'BLINK_DETECTED'
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(10, (currentOpennessScore / (peakOpennessRef.current || 1.0)) * 100))}%` }}
                  ></div>
                </div>
              </div>
              
              <button
                onClick={handleConfirmAttendance}
                disabled={isConfirming}
                className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${
                  !isLivenessVerified
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed hover:bg-slate-200'
                    : mode === 'CHECK_IN'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10 hover:scale-[1.005]'
                    : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/10 hover:scale-[1.005]'
                }`}
              >
                {isConfirming ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Saving to Database...
                  </>
                ) : !isLivenessVerified ? (
                  <>
                    <Lock size={16} className="text-slate-400" />
                    BLINK EYES TO UNLOCK {mode === 'CHECK_IN' ? 'CHECK-IN' : 'CHECK-OUT'}
                  </>
                ) : (
                  <>
                    {mode === 'CHECK_IN' ? <LogIn size={16} /> : <LogOut size={16} />}
                    CLICK TO CONFIRM {mode === 'CHECK_IN' ? 'CHECK-IN' : 'CHECK-OUT'} NOW
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Telemetry & Activity Panel */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-md flex flex-col h-full min-h-[400px]">
            
            {/* Title */}
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
              <ArrowLeftRight size={16} className="text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Scan Activity Feed</h3>
            </div>

            {/* Quick Stats Panel inside sidebar */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 border border-slate-100/80 p-3 rounded-xl">
                <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Today's Scans</div>
                <div className="text-lg font-bold text-slate-800 mt-0.5">{attendanceHistory.length}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100/80 p-3 rounded-xl">
                <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Latest Action</div>
                <div className="text-xs font-bold text-indigo-600 mt-1 truncate">
                  {attendanceHistory[0] ? attendanceHistory[0].status : 'None'}
                </div>
              </div>
            </div>

            {/* Scans Feed */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[350px]">
              {attendanceHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-10">
                  <AlertCircle size={20} className="mb-2 text-slate-300" />
                  <span>No completed scans in this session.</span>
                </div>
              ) : (
                attendanceHistory.map((log, index) => {
                  const isSuccess = log.status === 'CHECKED_IN' || log.status === 'CHECKED_OUT';
                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${
                        isSuccess
                          ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800'
                          : log.status === 'ALREADY_CHECKED_IN' || log.status === 'COOLDOWN_ACTIVE'
                          ? 'bg-amber-50/50 border-amber-100 text-amber-800'
                          : 'bg-rose-50/50 border-rose-100 text-rose-800'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs text-slate-800">
                          {log.name}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {log.timestamp}
                        </span>
                      </div>
                      
                      <div className="text-[9px] text-slate-400">
                        ID: <span className="text-slate-600 font-medium">{log.teacher_id}</span> | {log.department}
                      </div>
                      
                      <div className="text-[9px] flex items-center justify-between mt-1.5">
                        <span className={`px-2 py-0.5 rounded font-bold text-[8px] ${
                          log.status === 'CHECKED_IN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.status === 'CHECKED_OUT'
                            ? 'bg-sky-100 text-sky-850'
                            : log.status === 'COOLDOWN_ACTIVE' || log.status === 'ALREADY_CHECKED_IN'
                            ? 'bg-amber-100 text-amber-850'
                            : 'bg-rose-100 text-rose-850'
                        }`}>
                          {log.status}
                        </span>
                      </div>

                      {log.message && (
                        <div className="text-[9px] italic text-slate-500 mt-1 border-t border-slate-200/50 pt-1">
                          {log.message}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
