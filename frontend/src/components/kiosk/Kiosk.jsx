import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Shield, RefreshCw, AlertCircle, ArrowLeftRight, LogIn, LogOut, CheckCircle2 } from 'lucide-react';
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

  // Ref to track active state synchronously and prevent async race conditions
  const isKioskActiveRef = useRef(false);

  // Persistent historical list of recorded transactions in the session
  const [attendanceHistory, setAttendanceHistory] = useState([]);

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
  const stopKiosk = () => {
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
      clearCanvas();
      addNotification('Doorway Kiosk stopped.', 'info');
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
          setIdentifiedTeacher(firstMatch);
        } else {
          setIdentifiedTeacher(null);
        }
        
        drawBoundingBoxes(detections);
      } else {
        setActiveDetections([]);
        setIdentifiedTeacher(null);
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
      const color = isKnown ? '#10b981' : '#ef4444'; // Green or Red

      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(mirroredX, startY, boxWidth, boxHeight);

      // Label background
      ctx.fillStyle = color;
      const labelText = isKnown 
        ? `${det.name} (${(det.similarity_score * 100).toFixed(0)}%) [${det.matched_pose}]` 
        : `Unknown`;
      
      ctx.font = 'bold 12px Plus Jakarta Sans, sans-serif';
      const labelWidth = ctx.measureText(labelText).width + 10;
      
      ctx.fillRect(mirroredX - 1.5, Math.max(0, startY - 22), labelWidth, 22);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, mirroredX + 4, Math.max(15, startY - 6));
    });
  };

  useEffect(() => {
    return () => stopKiosk();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      {/* Header Panel */}
      <div className="glass-panel p-6 rounded-2xl mb-6 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-emerald-400">
              <Shield size={28} />
              FacultyPass AI — Doorway Kiosk
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Select mode, scan your face, and click the **confirmation button** to submit check-in/out.
            </p>
          </div>
          <button
            onClick={isKioskActive ? stopKiosk : startKiosk}
            disabled={isInitializing}
            className={`px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg transition ${
              isKioskActive
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
            }`}
          >
            {isInitializing ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Starting...
              </>
            ) : isKioskActive ? (
              'Stop Doorway Kiosk'
            ) : (
              'Start Doorway Kiosk'
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Webcam Kiosk Video & Overlay */}
        <div className="md:col-span-2 space-y-4">
          <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 shadow-xl relative bg-slate-950 aspect-[4/3]">
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
            </div>
            
            {!isKioskActive && (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3 p-8">
                <Camera size={48} className="text-slate-600 stroke-[1.5]" />
                <p className="text-sm font-medium">Doorway Kiosk is currently inactive.</p>
                <button
                  onClick={startKiosk}
                  disabled={isInitializing}
                  className="mt-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition"
                >
                  Activate Webcam Kiosk
                </button>
              </div>
            )}
          </div>

          {/* Mode Switcher Buttons (Always Visible) */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                setMode('CHECK_IN');
                addNotification('Switched to Check-In Mode.', 'info', 2000);
              }}
              className={`flex-1 py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition ${
                mode === 'CHECK_IN'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/25'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800/70'
              }`}
            >
              <LogIn size={18} />
              Check-In Mode
            </button>
            <button
              onClick={() => {
                setMode('CHECK_OUT');
                addNotification('Switched to Check-Out Mode.', 'info', 2000);
              }}
              className={`flex-1 py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition ${
                mode === 'CHECK_OUT'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/25'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800/70'
              }`}
            >
              <LogOut size={18} />
              Check-Out Mode
            </button>
          </div>

          {/* DYNAMIC CONFIRMATION BUTTON (Shows when face is identified) */}
          {isKioskActive && identifiedTeacher && (
            <div className="glass-panel p-5 rounded-2xl border border-sky-500/20 bg-sky-950/10 text-center space-y-4 animate-fade-in shadow-xl">
              <div className="text-sm font-semibold text-sky-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={16} className="text-sky-400 animate-pulse" />
                Detected: <span className="text-white font-bold">{identifiedTeacher.name}</span> ({identifiedTeacher.department})
              </div>
              
              <button
                onClick={handleConfirmAttendance}
                disabled={isConfirming}
                className={`w-full py-3.5 rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-lg transition ${
                  mode === 'CHECK_IN'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 hover:scale-[1.01]'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 hover:scale-[1.01]'
                }`}
              >
                {isConfirming ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Confirming with Database...
                  </>
                ) : (
                  <>
                    {mode === 'CHECK_IN' ? <LogIn size={18} /> : <LogOut size={18} />}
                    CLICK TO CONFIRM {mode === 'CHECK_IN' ? 'CHECK-IN' : 'CHECK-OUT'} NOW
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Real-time Detections Sidebar logs */}
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl h-full flex flex-col min-h-[350px]">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-800 mb-4">
              <ArrowLeftRight size={16} className="text-emerald-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Scan Activity Feed</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[440px]">
              {attendanceHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs py-8">
                  <AlertCircle size={24} className="mb-1 text-slate-700" />
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
                          ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400'
                          : log.status === 'ALREADY_CHECKED_IN' || log.status === 'COOLDOWN_ACTIVE'
                          ? 'bg-amber-950/20 border-amber-500/20 text-amber-400'
                          : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs">
                          {log.name}
                        </span>
                        <span className="text-[10px] font-mono opacity-80">
                          {log.timestamp}
                        </span>
                      </div>
                      
                      <div className="text-[10px] text-slate-400">
                        ID: <span className="text-slate-300 font-medium">{log.teacher_id}</span> | {log.department}
                      </div>
                      
                      <div className="text-[10px] flex items-center justify-between mt-1">
                        <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                          log.status === 'CHECKED_IN'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : log.status === 'CHECKED_OUT'
                            ? 'bg-sky-500/20 text-sky-400'
                            : log.status === 'COOLDOWN_ACTIVE' || log.status === 'ALREADY_CHECKED_IN'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {log.status}
                        </span>
                      </div>

                      {log.message && (
                        <div className="text-[10px] italic text-slate-400 mt-1 border-t border-slate-800 pt-1">
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
