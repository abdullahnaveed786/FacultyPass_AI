import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Camera, CheckCircle, AlertTriangle, RefreshCw, UserCheck, ArrowRight, UserPlus, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';

// Visual direction guide SVG graphic for current pose target
const PoseGuideGraphic = ({ poseKey }) => {
  switch (poseKey) {
    case 'FRONT':
      return (
        <svg className="w-14 h-14 text-indigo-600 animate-pulse" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
          <circle cx="32" cy="32" r="8" fill="currentColor" opacity="0.15" />
          <circle cx="32" cy="32" r="3.5" fill="currentColor" />
          {/* Face shape outline */}
          <path d="M22 28 C22 19, 42 19, 42 28 C42 38, 22 38, 22 28 Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M27 43 C27 43, 32 46, 37 43" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'LEFT':
      return (
        <svg className="w-14 h-14 text-indigo-600" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          {/* Head silhouette turning left */}
          <path d="M37 20 C32 18, 24 22, 24 29 C24 35, 28 41, 35 41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Left indicator arrow */}
          <path d="M43 31 H25 M31 25 L25 31 L31 37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" />
        </svg>
      );
    case 'RIGHT':
      return (
        <svg className="w-14 h-14 text-indigo-600" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          {/* Head silhouette turning right */}
          <path d="M27 20 C32 18, 40 22, 40 29 C40 35, 36 41, 29 41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Right indicator arrow */}
          <path d="M21 31 H39 M33 25 L39 31 L33 37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" />
        </svg>
      );
    case 'UP':
      return (
        <svg className="w-14 h-14 text-indigo-600" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          {/* Head silhouette tilting up */}
          <path d="M25 35 C25 29, 28 20, 32 20 C36 20, 39 29, 39 35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Upward indicator arrow */}
          <path d="M32 41 V23 M26 29 L32 23 L38 29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" />
        </svg>
      );
    case 'DOWN':
      return (
        <svg className="w-14 h-14 text-indigo-600" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          {/* Head silhouette tilting down */}
          <path d="M25 25 C25 31, 28 39, 32 39 C36 39, 39 31, 39 25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Downward indicator arrow */}
          <path d="M32 21 V39 M26 33 L32 39 L38 33" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse" />
        </svg>
      );
    default:
      return null;
  }
};

export default function EnrollmentWizard() {
  const { API_URL } = useAuth();
  const { addNotification } = useNotification();

  // Registration states
  const [step, setStep] = useState(1); // 1: Info Form, 2: Face Capture
  const [formData, setFormData] = useState({
    teacherId: '',
    name: '',
    department: '',
  });

  // Pose configuration
  const POSES = [
    { key: 'FRONT', label: 'Frontal Center', instruction: 'Look directly at the camera, placing the green dot in the center ring.' },
    { key: 'LEFT', label: 'Look Right', instruction: 'Slowly turn your head to your RIGHT, moving the dot to the target zone.' },
    { key: 'RIGHT', label: 'Look Left', instruction: 'Slowly turn your head to your LEFT, moving the dot to the target zone.' },
    { key: 'UP', label: 'Look Up', instruction: 'Slowly tilt your chin from the CENTER UPWARDS, moving the dot to the upper target zone.' },
    { key: 'DOWN', label: 'Look Down', instruction: 'Slowly tilt your chin from the CENTER DOWNWARDS, moving the dot to the lower target zone.' },
  ];

  const [currentPoseIdx, setCurrentPoseIdx] = useState(0);
  const [capturedEmbeddings, setCapturedEmbeddings] = useState({}); // { PoseName: embedding_vector }
  const [validationMsg, setValidationMsg] = useState('Camera initializing...');
  const [validationMetrics, setValidationMetrics] = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Webcam stream & Timeout loop references
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const activePoseRef = useRef(0);

  // Keep activePoseRef synchronized with state to prevent closure race conditions
  useEffect(() => {
    activePoseRef.current = currentPoseIdx;
  }, [currentPoseIdx]);

  // Check if all 5 poses are completely captured and written to state
  const isAllCaptured = Object.keys(capturedEmbeddings).length === POSES.length;

  // Start webcam
  const startWebcam = async () => {
    try {
      if (streamRef.current) {
        stopWebcam();
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setValidationMsg('Looking for face...');
        
        // Initial drawing of static guide rings
        setTimeout(() => {
          drawEnrollmentGuides(null, null, POSES[currentPoseIdx]?.key, false);
        }, 300);
      }
    } catch (err) {
      console.error(err);
      addNotification('Could not access webcam. Please check permissions.', 'error');
      setValidationMsg('Webcam Access Failed');
    }
  };

  // Stop webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (loopRef.current) {
      clearTimeout(loopRef.current);
      loopRef.current = null;
    }
    clearCanvas();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Draw gamified direction guides and 3D nose vector pointers
  const drawEnrollmentGuides = (tip, pointer, targetPose, isValid) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    
    // Auto-fit canvas to video client bounds
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;

    const W = canvas.width;
    const H = canvas.height;

    // 1. Draw Target Zone Circles
    let targetX = W / 2;
    let targetY = H / 2;
    let targetLabel = "Look Straight";

    if (targetPose === 'LEFT') {
      targetX = W / 2 + 95; // Physical LEFT moves nose pointer to screen RIGHT on mirrored canvas
      targetLabel = "Turn Left ➔"; 
    } else if (targetPose === 'RIGHT') {
      targetX = W / 2 - 95; // Physical RIGHT moves nose pointer to screen LEFT on mirrored canvas
      targetLabel = "◀ Turn Right";
    } else if (targetPose === 'UP') {
      targetY = H / 2 - 70; // Move circle UP
      targetLabel = "Tilt Up ▲";
    } else if (targetPose === 'DOWN') {
      targetY = H / 2 + 70; // Move circle DOWN
      targetLabel = "Tilt Down ▼";
    }

    // Draw active target guide ring
    ctx.strokeStyle = isValid ? '#10b981' : '#4f46e5'; // Green if verified, else Indigo
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]); // Dashed circle
    ctx.beginPath();
    ctx.arc(targetX, targetY, 32, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw static center reference ring for guidance (high-contrast dark line for light backgrounds)
    if (targetPose !== 'FRONT') {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 25, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset dash

    // Draw Target direction labels
    ctx.fillStyle = isValid ? '#10b981' : '#4f46e5';
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(targetLabel.toUpperCase(), targetX, targetY + 52);

    // 2. Draw 3D Nose direction vector line
    if (tip && pointer) {
      // Mirror coordinates to align with CSS scale-x-[-1] display
      const tipX = W - (tip[0] * scaleX);
      const tipY = tip[1] * scaleY;
      const ptrX = W - (pointer[0] * scaleX);
      const ptrY = pointer[1] * scaleY;

      // Draw pointer line (joystick shaft)
      ctx.strokeStyle = isValid ? '#10b981' : '#f59e0b'; // Green or Orange
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(ptrX, ptrY);
      ctx.stroke();

      // Draw head pointer ball (joystick cap)
      ctx.fillStyle = isValid ? '#10b981' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(ptrX, ptrY, 7.5, 0, 2 * Math.PI);
      ctx.fill();

      // Glowing outer ring on pointer
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ptrX, ptrY, 11, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Draw connection line to target if not yet valid (guidance line)
      if (!isValid) {
        ctx.strokeStyle = 'rgba(79, 70, 229, 0.25)'; // Indigo guide path
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ptrX, ptrY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  // Capture single frame, encode base64
  const captureFrameB64 = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    
    // Draw mirrored to match display
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Live validator loop using recursive setTimeout (prevents overlapping ticks & concurrency jumps)
  const tickValidation = async () => {
    if (step !== 2 || isSubmitting) return;

    const localPoseIdx = activePoseRef.current;
    if (localPoseIdx >= POSES.length) return;

    const frameB64 = captureFrameB64();
    if (!frameB64) {
      loopRef.current = setTimeout(tickValidation, 500);
      return;
    }

    const targetPose = POSES[localPoseIdx].key;

    try {
      const response = await axios.post(`${API_URL}/enrollment/validate-pose`, {
        image: frameB64,
        pose_name: targetPose
      });

      // Discard responses if the user reset or advanced past this pose during the API call
      if (activePoseRef.current !== localPoseIdx || step !== 2) {
        return;
      }

      const { is_valid, message, yaw, pitch, roll, embedding, nose_tip, nose_pointer } = response.data;
      setValidationMetrics({ yaw, pitch, roll });

      // Update canvas guides and pointer positions
      drawEnrollmentGuides(nose_tip, nose_pointer, targetPose, is_valid);

      if (is_valid && embedding) {
        setCapturedEmbeddings(prev => {
          const next = { ...prev, [targetPose]: embedding };
          
          // Trigger successful complete state only when the 5th pose is fully in state
          if (Object.keys(next).length === POSES.length) {
            setValidationMsg('All poses captured! Processing registration...');
            stopWebcam();
            setCurrentPoseIdx(POSES.length); // complete
          }
          return next;
        });
        
        if (localPoseIdx < POSES.length - 1) {
          setCurrentPoseIdx(localPoseIdx + 1);
          setValidationMsg('Hold pose...');
        }
      } else {
        setValidationMsg(message);
      }
    } catch (err) {
      console.error("Validation error: ", err);
    }

    // Schedule the next frame only if the active pose index has not changed/completed
    if (activePoseRef.current === localPoseIdx && localPoseIdx < POSES.length && step === 2) {
      loopRef.current = setTimeout(tickValidation, 500);
    }
  };

  // Start webcam when step changes to face capture
  useEffect(() => {
    if (step === 2) {
      startWebcam();
    } else {
      stopWebcam();
    }
    return () => stopWebcam();
  }, [step]);

  // Restart validation loop when current pose index changes
  useEffect(() => {
    if (step === 2 && currentPoseIdx < POSES.length) {
      if (loopRef.current) clearTimeout(loopRef.current);
      
      // Draw static guide rings immediately for new pose target
      drawEnrollmentGuides(null, null, POSES[currentPoseIdx].key, false);
      
      // Run first loop tick
      loopRef.current = setTimeout(tickValidation, 300);
    }
    return () => {
      if (loopRef.current) clearTimeout(loopRef.current);
    };
  }, [step, currentPoseIdx]);

  // Submit enrollment payload to backend
  const handleRegisterSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Validate that all embeddings exist and are non-empty arrays
      const missingPoses = POSES.filter(pose => !capturedEmbeddings[pose.key] || !Array.isArray(capturedEmbeddings[pose.key]));
      if (missingPoses.length > 0) {
        addNotification(`Missing face capture data for: ${missingPoses.map(p => p.label).join(', ')}. Please re-capture.`, 'warning');
        setIsSubmitting(false);
        return;
      }

      const embeddingsList = POSES.map(pose => ({
        pose_name: pose.key,
        embedding: capturedEmbeddings[pose.key]
      }));

      await axios.post(`${API_URL}/enrollment/register`, {
        teacher_id: formData.teacherId,
        name: formData.name,
        department: formData.department,
        embeddings: embeddingsList
      });

      addNotification(`Teacher "${formData.name}" registered successfully!`, 'success');
      resetWizard();
    } catch (err) {
      console.error("Registration submit error:", err);
      let errorMsg = 'Registration failed.';
      if (err.response?.data?.detail) {
        const d = err.response.data.detail;
        if (typeof d === 'string') {
          errorMsg = d;
        } else if (Array.isArray(d)) {
          errorMsg = d.map(item => item.msg || JSON.stringify(item)).join('; ');
        } else if (typeof d === 'object') {
          errorMsg = JSON.stringify(d);
        }
      }
      addNotification(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    stopWebcam();
    setStep(1);
    setFormData({ teacherId: '', name: '', department: '' });
    setCurrentPoseIdx(0);
    setCapturedEmbeddings({});
    setValidationMsg('Camera initializing...');
    setValidationMetrics({ yaw: 0, pitch: 0, roll: 0 });
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* Top Header Card */}
      <div className="glass-panel p-6 rounded-2xl shadow-sm border border-slate-200/80 bg-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <h2 className="text-xl font-bold flex items-center gap-3 text-indigo-600">
          <UserPlus size={24} className="text-indigo-600" />
          Multi-Pose Faculty Registration
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          Register new faculty. Move your head to place the **glowing pointer** inside the **target rings** on the camera.
        </p>
      </div>

      {step === 1 ? (
        /* STEP 1: METADATA FORM */
        <div className="glass-panel p-8 rounded-2xl shadow-md max-w-lg mx-auto bg-white border border-slate-200/80">
          <h3 className="text-base font-bold mb-6 text-slate-800">1. Faculty Details</h3>
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-2">Teacher ID</label>
              <input
                type="text"
                value={formData.teacherId}
                onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                placeholder="e.g. FAC-101"
                className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2.5 px-4 text-slate-800 placeholder-slate-400 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Prof. Alan Turing"
                className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2.5 px-4 text-slate-800 placeholder-slate-400 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-455 uppercase tracking-wider mb-2">Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="e.g. Mathematics"
                className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2.5 px-4 text-slate-800 placeholder-slate-400 outline-none transition"
              />
            </div>

            <button
              onClick={() => {
                if (!formData.teacherId || !formData.name || !formData.department) {
                  addNotification('Please fill in all details before continuing.', 'warning');
                  return;
                }
                setStep(2);
              }}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition shadow-md shadow-indigo-600/10"
            >
              Continue to Biometrics
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : (
        /* STEP 2: FACE POSE CAPTURE */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left panel: Camera stream with overlay guides */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-md relative aspect-[4/3] flex items-center justify-center">
              {/* Webcam Video */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />

              {/* Dynamic Interactive Guide Overlay Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              />

              {/* Visual guidance box */}
              <div className="absolute top-3 left-3 bg-white/95 backdrop-blur border border-slate-200 text-[10px] font-sans py-1.5 px-3 rounded-lg text-slate-700 shadow-sm flex gap-4">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  Target: {POSES[currentPoseIdx]?.label || 'Completed'}
                </span>
                <span>Yaw: <b className="text-slate-550">{Math.round(validationMetrics.yaw)}°</b></span>
                <span>Pitch: <b className="text-slate-555">{Math.round(validationMetrics.pitch)}°</b></span>
              </div>

              {/* Status bar */}
              <div className={`absolute bottom-0 left-0 right-0 py-3.5 px-4 bg-white/95 backdrop-blur border-t border-slate-200 flex items-center gap-3 ${
                isAllCaptured 
                  ? 'text-emerald-700'
                  : 'text-indigo-600'
              }`}>
                {isAllCaptured ? (
                  <>
                    <CheckCircle size={18} className="text-emerald-500 animate-pulse" />
                    <span className="font-bold text-xs">All 5 poses successfully captured!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} className="animate-spin text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">GUIDANCE:</span>
                    <span className="text-xs text-slate-600 font-medium">{validationMsg}</span>
                  </>
                )}
              </div>
            </div>

            {/* Instruction Callout with Visual SVG Directional Hint */}
            {currentPoseIdx < POSES.length && (
              <div className="bg-indigo-50/50 border border-indigo-100/50 p-4 rounded-xl flex items-center gap-4">
                <div className="flex-shrink-0 p-1.5 bg-white rounded-xl border border-indigo-100/50 shadow-sm">
                  <PoseGuideGraphic poseKey={POSES[currentPoseIdx].key} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-indigo-700 text-sm">
                    Pose {currentPoseIdx + 1}/5: {POSES[currentPoseIdx].label}
                  </h4>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed font-medium">
                    {POSES[currentPoseIdx].instruction}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Pose lists & Action Button */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Capture Checklist</h3>
                <HelpCircle size={16} className="text-slate-400" title="Align the pointer dot in the target rings to complete each pose." />
              </div>
              <div className="space-y-2.5">
                {POSES.map((pose, idx) => {
                  const isCaptured = !!capturedEmbeddings[pose.key];
                  const isActive = idx === currentPoseIdx;
                  return (
                    <div
                      key={pose.key}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isCaptured
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm'
                          : isActive
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium ring-1 ring-indigo-500/10'
                          : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}
                    >
                      <span className="text-xs font-semibold">{pose.label}</span>
                      {isCaptured ? (
                        <CheckCircle size={15} className="text-emerald-500" />
                      ) : isActive ? (
                        <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full animate-pulse">
                          Active
                        </span>
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-200 bg-white"></span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Registration trigger */}
            {isAllCaptured ? (
              <button
                onClick={handleRegisterSubmit}
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-emerald-500/10"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Registering Teacher...
                  </>
                ) : (
                  <>
                    <UserCheck size={18} />
                    Complete Registration
                  </>
                )}
              </button>
            ) : null}

            <button
              onClick={resetWizard}
              className="w-full bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 font-semibold py-2.5 px-4 rounded-xl transition text-xs shadow-sm"
            >
              Cancel & Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
