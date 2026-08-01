import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Camera, CheckCircle, AlertTriangle, RefreshCw, UserCheck, ArrowRight, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';

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
    { key: 'FRONT', label: 'Frontal Center', instruction: 'Look directly at the camera, keeping your head level.' },
    { key: 'LEFT', label: 'Look Left', instruction: 'Slowly turn your head to your LEFT (about 15 degrees).' },
    { key: 'RIGHT', label: 'Look Right', instruction: 'Slowly turn your head to your RIGHT (about 15 degrees).' },
    { key: 'UP', label: 'Look Up', instruction: 'Slowly tilt your chin UPWARDS.' },
    { key: 'DOWN', label: 'Look Down', instruction: 'Slowly tilt your chin DOWNWARDS.' },
  ];

  const [currentPoseIdx, setCurrentPoseIdx] = useState(0);
  const [capturedEmbeddings, setCapturedEmbeddings] = useState({}); // { PoseName: embedding_vector }
  const [validationMsg, setValidationMsg] = useState('Camera initializing...');
  const [validationMetrics, setValidationMetrics] = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Webcam stream references
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);

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
      clearInterval(loopRef.current);
      loopRef.current = null;
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
    
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  // Live validator loop
  const runValidationLoop = () => {
    if (loopRef.current) clearInterval(loopRef.current);
    
    loopRef.current = setInterval(async () => {
      if (isValidating || isSubmitting || currentPoseIdx >= POSES.length) return;

      const frameB64 = captureFrameB64();
      if (!frameB64) return;

      setIsValidating(true);
      const targetPose = POSES[currentPoseIdx].key;

      try {
        const response = await axios.post(`${API_URL}/enrollment/validate-pose`, {
          image: frameB64,
          pose_name: targetPose
        });

        const { is_valid, message, yaw, pitch, roll, embedding } = response.data;
        setValidationMetrics({ yaw, pitch, roll });

        if (is_valid && embedding) {
          // Pose successfully captured and validated
          setCapturedEmbeddings(prev => ({
            ...prev,
            [targetPose]: embedding
          }));
          
          addNotification(`Validated pose: ${POSES[currentPoseIdx].label}`, 'success');
          
          if (currentPoseIdx < POSES.length - 1) {
            setCurrentPoseIdx(prev => prev + 1);
            setValidationMsg('Hold pose...');
          } else {
            // Completed all 5 poses!
            setValidationMsg('All poses captured! Processing registration...');
            stopWebcam();
            setCurrentPoseIdx(POSES.length); // complete
          }
        } else {
          setValidationMsg(message);
        }
      } catch (err) {
        console.error('Validation error', err);
      } finally {
        setIsValidating(false);
      }
    }, 1500); // Poll every 1.5 seconds
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
      runValidationLoop();
    }
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [step, currentPoseIdx]);

  // Submit enrollment payload to backend
  const handleRegisterSubmit = async () => {
    setIsSubmitting(true);
    try {
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

      addNotification(`Teacher ${formData.name} registered successfully!`, 'success');
      resetWizard();
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Registration failed.';
      addNotification(detail, 'error');
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
    <div className="max-w-4xl mx-auto py-6 px-4">
      {/* Top Header Card */}
      <div className="glass-panel p-6 rounded-2xl mb-6 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl"></div>
        <h2 className="text-2xl font-bold flex items-center gap-3 text-sky-400">
          <UserPlus size={28} />
          Multi-Pose Faculty Registration
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Add a new teacher to the attendance tracking system. Validates 3D landmarks for 5 standard poses.
        </p>
      </div>

      {step === 1 ? (
        /* STEP 1: METADATA FORM */
        <div className="glass-panel p-8 rounded-2xl shadow-xl max-w-lg mx-auto">
          <h3 className="text-lg font-semibold mb-6 text-slate-200">1. Faculty Details</h3>
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Teacher ID</label>
              <input
                type="text"
                value={formData.teacherId}
                onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                placeholder="e.g. FAC-101"
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg py-2.5 px-4 text-slate-100 placeholder-slate-600 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Prof. Alan Turing"
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg py-2.5 px-4 text-slate-100 placeholder-slate-600 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="e.g. Mathematics"
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg py-2.5 px-4 text-slate-100 placeholder-slate-600 outline-none transition"
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
              className="w-full mt-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/20"
            >
              Continue to Biometrics
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : (
        /* STEP 2: FACE POSE CAPTURE */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left panel: Camera stream */}
          <div className="md:col-span-2 space-y-4">
            <div className="glass-panel rounded-2xl overflow-hidden relative border border-slate-800 shadow-xl bg-slate-950">
              {/* Webcam Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full aspect-[4/3] object-cover scale-x-[-1]"
              />

              {/* Angle Metrics Overlay */}
              <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur border border-slate-800 text-[11px] font-mono py-1 px-2.5 rounded text-slate-300 flex gap-3">
                <span>Yaw: <b className={Math.abs(validationMetrics.yaw) > 10 ? 'text-sky-400' : 'text-slate-400'}>{validationMetrics.yaw}°</b></span>
                <span>Pitch: <b className={Math.abs(validationMetrics.pitch) > 10 ? 'text-sky-400' : 'text-slate-400'}>{validationMetrics.pitch}°</b></span>
                <span>Roll: <b className={Math.abs(validationMetrics.roll) > 10 ? 'text-sky-400' : 'text-slate-400'}>{validationMetrics.roll}°</b></span>
              </div>

              {/* Status bar */}
              <div className={`absolute bottom-0 left-0 right-0 py-3 px-4 backdrop-blur border-t border-slate-800 flex items-center gap-3 ${
                currentPoseIdx === POSES.length 
                  ? 'bg-emerald-950/80 text-emerald-300'
                  : 'bg-slate-900/85 text-sky-400'
              }`}>
                {currentPoseIdx === POSES.length ? (
                  <>
                    <CheckCircle size={18} className="text-emerald-400 animate-pulse" />
                    <span className="font-semibold">All poses captured successfully!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} className="animate-spin text-sky-400" />
                    <span className="text-sm font-medium">{validationMsg}</span>
                  </>
                )}
              </div>
            </div>

            {/* Instruction Callout */}
            {currentPoseIdx < POSES.length && (
              <div className="glass-panel p-4 rounded-xl border border-sky-950/40 bg-sky-950/10 flex items-start gap-3">
                <div className="p-2 bg-sky-500/10 rounded-lg text-sky-400 mt-0.5">
                  <Camera size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-sky-300 text-sm">
                    Pose {currentPoseIdx + 1}/5: {POSES[currentPoseIdx].label}
                  </h4>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                    {POSES[currentPoseIdx].instruction}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Pose lists & Action Button */}
          <div className="space-y-4">
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Capture Checklist</h3>
              <div className="space-y-2.5">
                {POSES.map((pose, idx) => {
                  const isCaptured = !!capturedEmbeddings[pose.key];
                  const isActive = idx === currentPoseIdx;
                  return (
                    <div
                      key={pose.key}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isCaptured
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                          : isActive
                          ? 'bg-sky-950/20 border-sky-500/40 text-sky-300 ring-1 ring-sky-500/20 shadow-md'
                          : 'bg-slate-900/50 border-slate-900 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-semibold">{pose.label}</span>
                      {isCaptured ? (
                        <CheckCircle size={16} className="text-emerald-400" />
                      ) : isActive ? (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded-full animate-pulse">
                          Active
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-800"></span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Registration trigger */}
            {currentPoseIdx === POSES.length ? (
              <button
                onClick={handleRegisterSubmit}
                disabled={isSubmitting}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
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
              className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 font-semibold py-2 px-4 rounded-xl transition text-xs"
            >
              Cancel & Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
