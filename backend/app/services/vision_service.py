import base64
import numpy as np
import cv2
from typing import List, Tuple, Any, Optional
import os

import insightface
from insightface.app import FaceAnalysis

class VisionService:
    """
    InsightFace ArcFace Model Wrapper (buffalo_l backbone).
    Extracts 512-D normalized feature embeddings and 5-point facial landmarks.
    """
    def __init__(self, name: str = 'buffalo_l', ctx_id: int = -1, det_size: Tuple[int, int] = (640, 640)):
        print(f"[INFO] Initializing InsightFace ArcFace model zoo: '{name}'...")
        # ctx_id = -1 for CPU, 0 for GPU
        # If CUDA is available, use CUDAExecutionProvider, otherwise CPUExecutionProvider
        providers = ['CPUExecutionProvider']
        
        # We can specify download root so models are cached in a volume
        download_root = os.environ.get("INSIGHTFACE_MODEL_DIR", "/root/.insightface")
        
        self.app = FaceAnalysis(
            name=name,
            root=download_root,
            providers=providers
        )
        self.app.prepare(ctx_id=ctx_id, det_size=det_size)
        print("[STATUS] Vision Service / InsightFace model loaded successfully.")

    def analyze_frame(self, frame_bgr: np.ndarray) -> List[Any]:
        """
        Detects faces in BGR image and returns face object profiles.
        Each face contains: bbox, kps, landmark_3d_68, sex, age, embedding, etc.
        """
        try:
            return self.app.get(frame_bgr)
        except Exception as e:
            print(f"[ERROR] InsightFace inference error: {e}")
            return []

# Instantiate as global service singleton
vision_service = VisionService(ctx_id=-1)

def decode_base64_image(b64_str: str) -> np.ndarray:
    """
    Converts a base64 encoded data URI (image/jpeg) to an OpenCV BGR numpy array.
    """
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_bytes = base64.b64decode(b64_str)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise ValueError("Image data is corrupted or could not be decoded.")
    return frame_bgr
