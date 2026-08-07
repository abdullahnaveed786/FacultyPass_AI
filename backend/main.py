import os
import uvicorn

# 1. Limit CPU threading overhead to reduce memory usage in low-resource environments
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
