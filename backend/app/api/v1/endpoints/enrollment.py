from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.teacher import Teacher
from app.models.embedding import TeacherEmbedding
from app.schemas.teacher import TeacherRegisterRequest, TeacherResponse
from app.services.vision_service import vision_service, decode_base64_image
from app.services.pose_validator import validate_pose_orientation
from app.services.biometric_service import check_biometric_duplicate
import numpy as np

router = APIRouter()

class PoseValidateRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded image frame")
    pose_name: str = Field(..., description="FRONT, LEFT, RIGHT, UP, DOWN")

class PoseValidateResponse(BaseModel):
    is_valid: bool
    message: str
    yaw: float
    pitch: float
    roll: float
    embedding: Optional[List[float]] = None

@router.post("/validate-pose", response_model=PoseValidateResponse)
async def validate_pose(payload: PoseValidateRequest):
    """
    Decodes a webcam frame, runs facial landmark detection,
    and calculates 3D head pose orientation using PnP.
    If valid, returns the 512-D embedding.
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
        return PoseValidateResponse(
            is_valid=False,
            message="No face detected in frame. Please adjust lighting and center your face.",
            yaw=0.0, pitch=0.0, roll=0.0,
            embedding=None
        )

    # Get the largest face in the frame
    largest_face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

    # Validate 3D Head Pose
    is_valid, msg, (yaw, pitch, roll) = validate_pose_orientation(
        largest_face, payload.pose_name, img_w=w, img_h=h
    )

    if not is_valid:
        return PoseValidateResponse(
            is_valid=False,
            message=msg,
            yaw=round(yaw, 2),
            pitch=round(pitch, 2),
            roll=round(roll, 2),
            embedding=None
        )

    # Convert numpy float32 embedding to standard python float list
    embedding_list = largest_face.embedding.astype(float).tolist()

    return PoseValidateResponse(
        is_valid=True,
        message="Pose validated successfully.",
        yaw=round(yaw, 2),
        pitch=round(pitch, 2),
        roll=round(roll, 2),
        embedding=embedding_list
    )

@router.post("/register", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED)
async def register_teacher(payload: TeacherRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Saves a teacher record and their 5 pose embeddings.
    Triggers a 1:N anti-duplication check against the database using pgvector.
    """
    # 1. Primary Key Conflict Check
    stmt = select(Teacher).where(Teacher.teacher_id == payload.teacher_id)
    result = await db.execute(stmt)
    existing_teacher = result.scalar_one_or_none()
    if existing_teacher:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Primary Key Conflict: Teacher ID '{payload.teacher_id}' is already registered."
        )

    # 2. Convert incoming float lists back to numpy arrays for verification
    embeddings_np = [np.array(emb.embedding, dtype=np.float32) for emb in payload.embeddings]

    # 3. Perform 1:N Biometric Duplicate Check
    is_duplicate, matched_teacher, similarity = await check_biometric_duplicate(embeddings_np, db)
    if is_duplicate and matched_teacher:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Biometric Duplicate Detected! Face belongs to existing teacher: {matched_teacher.name} ({matched_teacher.teacher_id})"
        )

    # 4. Insert teacher
    new_teacher = Teacher(
        teacher_id=payload.teacher_id,
        name=payload.name,
        department=payload.department,
        is_active=True
    )
    db.add(new_teacher)
    await db.flush()  # get generated fields if any

    # 5. Insert embeddings
    for emb in payload.embeddings:
        new_embedding = TeacherEmbedding(
            teacher_id=payload.teacher_id,
            pose_name=emb.pose_name.upper().strip(),
            embedding=emb.embedding
        )
        db.add(new_embedding)

    await db.commit()
    await db.refresh(new_teacher)

    return new_teacher
