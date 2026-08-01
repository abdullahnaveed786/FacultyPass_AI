import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Shield, RefreshCw, AlertCircle, ArrowLeftRight } from 'lucide-react';
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
  const [isKioskActive, setIsKioskActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

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
        setIsKioskActive(true);
        startScanningLoop();
      }
    } catch (err) {
      console.error(err);
      addNotification('Kiosk webcam startup failed. Please verify permissions.', 'error');
    } finally {
      setIsInitializing(false);
    }
  };

  // Stop Kiosk Webcam
  const stopKiosk = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setIsKioskActive(false);
    setActiveDetections([]);
    clearCanvas();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Scan live frame
  const scanFrame = async () => {
    if (!videoRef.current || !isKioskActive) return;
    
    // Capture frame on offscreen canvas
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = videoRef.current.videoWidth || 640;
    captureCanvas.height = videoRef.current.videoHeight || 480;
    const captureCtx = captureCanvas.getContext('2d');
    
    // Unmirrored frame for backend InsightFace engine
    captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
    const frameB64 = captureCanvas.toDataURL('image/jpeg', 0.85);

    try {
      const response = await axios.post(`${API_URL}/verification/scan`, {
        image: frameB64
      });

      const { status, detections } = response.data;
      
      if (status === 'SUCCESS') {
        setActiveDetections(detections);
        
        // Trigger Toast notifications for state transitions
        detections.forEach(det => {
          if (det.status === 'CHECKED_IN') {
            addNotification(`✅ Check-In Logged: ${det.name} (${det.department})`, 'success');
          } else if (det.status === 'CHECKED_OUT') {
            addNotification(`📤 Check-Out Logged: ${det.name} (${det.department})`, 'success');
          } else if (det.status === 'COOLDOWN_ACTIVE') {
            // Optional: log cooldown notifications silently or sparingly
            console.log(`User ${det.name} is in check-in cooldown.`);
          }
        });

        drawBoundingBoxes(detections);
      } else {
        setActiveDetections([]);
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

  // Draw overlays
  const drawBoundingBoxes = (detections) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    
    // Set matching width and height
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;

    detections.forEach(det => {
      const { xmin, ymin, xmax, ymax } = det.bbox_coordinates;
      
      // Mirror math matching the css scale-x-[-1] mirroring
      // xmin_mirrored = W - xmax
      // xmax_mirrored = W - xmin
      const boxWidth = (xmax - xmin) * scaleX;
      const boxHeight = (ymax - ymin) * scaleY;
      
      // Calculate mirrored starting X coordinate
      const mirroredX = canvas.width - (xmin * scaleX) - boxWidth;
      const startY = ymin * scaleY;

      const isKnown = det.status !== 'UNKNOWN';
      const color = isKnown ? '#10b981' : '#ef4444'; // Green or Red

      // Draw bounding box
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
        <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-emerald-400">
              <Shield size={28} />
              FacultyPass AI — Doorway Kiosk
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Position webcam at doorways or check-in desks. Scans face and updates check-in logs automatically.
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
        <div className="md:col-span-2">
          <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 shadow-xl relative bg-slate-950 aspect-[4/3]">
            {isKioskActive ? (
              <>
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
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3 p-8">
                <Camera size={48} className="text-slate-600 stroke-[1.5]" />
                <p className="text-sm font-medium">Doorway Kiosk is currently inactive.</p>
                <button
                  onClick={startKiosk}
                  className="mt-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition"
                >
                  Activate Webcam Kiosk
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Real-time Detections Sidebar logs */}
        <div className="space-y-4">
          <div className="glass-panel p-5 rounded-2xl h-full flex flex-col min-h-[350px]">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-800 mb-4">
              <ArrowLeftRight size={16} className="text-emerald-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Scan Activity Feed</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[320px]">
              {activeDetections.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs py-8">
                  <AlertCircle size={24} className="mb-1 text-slate-700" />
                  <span>No recent facial activity detected.</span>
                </div>
              ) : (
                activeDetections.map((det, index) => {
                  const isKnown = det.status !== 'UNKNOWN';
                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${
                        isKnown
                          ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400'
                          : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs">
                          {isKnown ? det.name : 'Unknown Individual'}
                        </span>
                        <span className="text-[10px] font-mono opacity-80">
                          {det.timestamp.split(' ')[1]}
                        </span>
                      </div>
                      
                      {isKnown && (
                        <div className="text-[10px] text-slate-400">
                          ID: <span className="text-slate-300 font-medium">{det.teacher_id}</span> | {det.department}
                        </div>
                      )}
                      
                      <div className="text-[10px] flex items-center justify-between mt-1">
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          det.status === 'CHECKED_IN'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : det.status === 'CHECKED_OUT'
                            ? 'bg-amber-500/20 text-amber-400'
                            : det.status === 'COOLDOWN_ACTIVE'
                            ? 'bg-sky-500/20 text-sky-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {det.status}
                        </span>
                        {isKnown && <span>Score: {(det.similarity_score * 100).toFixed(0)}%</span>}
                      </div>

                      {det.message && (
                        <div className="text-[10px] italic text-slate-400 mt-1 border-t border-slate-800 pt-1">
                          {det.message}
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
