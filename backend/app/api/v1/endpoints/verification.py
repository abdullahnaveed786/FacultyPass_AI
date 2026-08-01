from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import datetime

from app.database import get_db
from app.services.vision_service import vision_service, decode_base64_image
from app.services.biometric_service import identify_teacher_from_vector
from app.services.attendance_service import AttendanceService

router = APIRouter()

class VerificationRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded webcam image frame")

class DetectionDetail(BaseModel):
    teacher_id: str
    name: str
    department: Optional[str] = None
    status: str  # 'CHECKED_IN', 'CHECKED_OUT', 'COOLDOWN_ACTIVE', 'UNKNOWN'
    matched_pose: str
    similarity_score: float
    bbox_coordinates: Dict[str, int]
    timestamp: str
    message: str

class VerificationResponse(BaseModel):
    status: str  # 'SUCCESS', 'NO_FACE_DETECTED'
    detections: List[DetectionDetail]

@router.post("/scan", response_model=VerificationResponse)
async def scan_face(payload: VerificationRequest, db: AsyncSession = Depends(get_db)):
    """
    Decodes the live frame, extracts faces, performs 1:N database comparison,
    and runs the Check-In/Check-Out Cooldown state machine for recognized faculty.
    """
    try:
        frame_bgr = decode_base64_image(payload.image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image data: {str(e)}"
        )

    h, w, _ = frame_bgr.shape
    faces = vision_service.analyze_frame(frame_bgr)

    if len(faces) == 0:
        return VerificationResponse(
            status="NO_FACE_DETECTED",
            detections=[]
        )

    detections_log = []

    for face in faces:
        bbox = face.bbox.astype(int)
        xmin, ymin = max(0, int(bbox[0])), max(0, int(bbox[1]))
        xmax, ymax = min(w, int(bbox[2])), min(h, int(bbox[3]))

        # Run biometric identification
        teacher, matched_pose, score = await identify_teacher_from_vector(face.embedding, db)

        timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if teacher:
            # Trigger check-in / check-out state machine
            res = await AttendanceService.process_biometric_hit(teacher.teacher_id, db)
            
            detections_log.append(DetectionDetail(
                teacher_id=teacher.teacher_id,
                name=teacher.name,
                department=teacher.department,
                status=res["status"],
                matched_pose=matched_pose,
                similarity_score=round(score, 4),
                bbox_coordinates={"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
                timestamp=timestamp_str,
                message=res.get("message", "")
            ))
        else:
            detections_log.append(DetectionDetail(
                teacher_id="N/A",
                name="Unknown Individual",
                department="Unknown",
                status="UNKNOWN",
                matched_pose="None",
                similarity_score=round(score, 4),
                bbox_coordinates={"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
                timestamp=timestamp_str,
                message="Face not recognized or insufficient similarity score."
            ))

    return VerificationResponse(
        status="SUCCESS",
        detections=detections_log
    )
