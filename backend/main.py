# Triggering a fresh build with buffalo_sc memory optimizations (August 8, 2026)
import os
import uvicorn
import sys
import subprocess

# 1. Self-healing OpenCV check (resolves missing libGL.so.1 on default python buildpacks)
try:
    import cv2
except ImportError as e:
    if "libGL.so.1" in str(e) or "libGL" in str(e):
        print("[WARNING] OpenCV requires libGL.so.1 which is missing. Running self-healing reinstall of opencv-python-headless...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "opencv-python", "opencv-python-headless"], check=True)
            subprocess.run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "opencv-python-headless==4.9.0.80"], check=True)
            import cv2
            print("[STATUS] OpenCV self-healing completed successfully! Headless CV2 loaded.")
        except Exception as install_err:
            print(f"[CRITICAL] OpenCV self-healing failed: {install_err}")
            raise e
    else:
        raise e

# 2. Limit CPU threading overhead to reduce memory usage in low-resource environments
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

# 2. Patch ONNX Runtime sessions to use ultra-low memory settings
try:
    import onnxruntime as ort
    original_session = ort.InferenceSession

    class CustomInferenceSession(original_session):
        def __init__(self, *args, **kwargs):
            sess_options = kwargs.get('sess_options') or ort.SessionOptions()
            sess_options.enable_cpu_mem_arena = False
            sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            sess_options.inter_op_num_threads = 1
            sess_options.intra_op_num_threads = 1
            kwargs['sess_options'] = sess_options
            super().__init__(*args, **kwargs)

    ort.InferenceSession = CustomInferenceSession
    print("[STATUS] ONNX Runtime monkeypatched successfully for low-memory execution.")
except Exception as e:
    print(f"[WARNING] Failed to patch ONNX Runtime: {e}")

from app.main import app

# This allows SnapDeploy's automatic "FastAPI" preset (which looks for main:app in the root) to import the app successfully.
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    print(f"[STARTUP] Starting Uvicorn server on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port)
