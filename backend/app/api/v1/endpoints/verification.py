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
    action: str = Field(default="CHECK_IN", description="CHECK_IN or CHECK_OUT")

class ConfirmAttendanceRequest(BaseModel):
    teacher_id: str = Field(..., description="Unique teacher ID")
    action: str = Field(..., description="CHECK_IN or CHECK_OUT")

# Response schemas
class IdentificationDetail(BaseModel):
    teacher_id: str
    name: str
    department: Optional[str] = None
    matched_pose: str
    similarity_score: float
    bbox_coordinates: Dict[str, int]
    timestamp: str

class IdentificationResponse(BaseModel):
    status: str  # 'SUCCESS', 'NO_FACE_DETECTED'
    detections: List[IdentificationDetail]

class DetectionDetail(BaseModel):
    teacher_id: str
    name: str
    department: Optional[str] = None
    status: str  # 'CHECKED_IN', 'CHECKED_OUT', 'COOLDOWN_ACTIVE', 'ALREADY_CHECKED_IN', 'NOT_CHECKED_IN', 'UNKNOWN'
    matched_pose: str
    similarity_score: float
    bbox_coordinates: Dict[str, int]
    timestamp: str
    message: str

class VerificationResponse(BaseModel):
    status: str  # 'SUCCESS', 'NO_FACE_DETECTED'
    detections: List[DetectionDetail]

class ConfirmAttendanceResponse(BaseModel):
    status: str  # 'CHECKED_IN', 'CHECKED_OUT', 'COOLDOWN_ACTIVE', 'ALREADY_CHECKED_IN', 'NOT_CHECKED_IN'
    message: str
    log_id: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    working_hours: Optional[float] = None

@router.post("/identify", response_model=IdentificationResponse)
async def identify_face(payload: VerificationRequest, db: AsyncSession = Depends(get_db)):
    """
    Decodes the live frame, extracts faces, performs 1:N database comparison.
    DOES NOT write to the database or trigger cooldown state transitions (Preview only).
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
        return IdentificationResponse(
            status="NO_FACE_DETECTED",
            detections=[]
        )

    detections_log = []

    for face in faces:
        bbox = face.bbox.astype(int)
        xmin, ymin = max(0, int(bbox[0])), max(0, int(bbox[1]))
        xmax, ymax = min(w, int(bbox[2])), min(h, int(bbox[3]))

        # Run biometric identification against pgvector
        teacher, matched_pose, score = await identify_teacher_from_vector(face.embedding, db)

        timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if teacher:
            detections_log.append(IdentificationDetail(
                teacher_id=teacher.teacher_id,
                name=teacher.name,
                department=teacher.department,
                matched_pose=matched_pose,
                similarity_score=round(score, 4),
                bbox_coordinates={"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax},
                timestamp=timestamp_str
            ))

    return IdentificationResponse(
        status="SUCCESS",
        detections=detections_log
    )

@router.post("/confirm", response_model=ConfirmAttendanceResponse)
async def confirm_attendance(payload: ConfirmAttendanceRequest, db: AsyncSession = Depends(get_db)):
    """
    Called when a user clicks the confirmation button in the UI.
    Performs check-in/out database log operations and Redis cooldown cache state updates.
    """
    res = await AttendanceService.process_biometric_hit(
        teacher_id=payload.teacher_id,
        action=payload.action,
        db=db
    )
    return ConfirmAttendanceResponse(
        status=res["status"],
        message=res.get("message", ""),
        log_id=res.get("log_id"),
        check_in_time=res.get("check_in_time"),
        check_out_time=res.get("check_out_time"),
        working_hours=res.get("working_hours")
    )

@router.post("/scan", response_model=VerificationResponse)
async def scan_face(payload: VerificationRequest, db: AsyncSession = Depends(get_db)):
    """
    Deprecation fallback: legacy scan-and-save endpoint.
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

        teacher, matched_pose, score = await identify_teacher_from_vector(face.embedding, db)
        timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if teacher:
            res = await AttendanceService.process_biometric_hit(teacher.teacher_id, payload.action, db)
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
                message="Face not recognized."
            ))

    return VerificationResponse(
        status="SUCCESS",
        detections=detections_log
    )
