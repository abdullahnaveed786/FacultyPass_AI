from datetime import datetime
from typing import List
from pydantic import BaseModel, Field

class TeacherBase(BaseModel):
    teacher_id: str = Field(..., min_length=1, max_length=50, description="Unique identifier for the teacher (e.g. FAC-101)")
    name: str = Field(..., min_length=1, max_length=100, description="Full name of the teacher")
    department: str = Field(..., min_length=1, max_length=100, description="Department name")

class TeacherCreate(TeacherBase):
    pass

class TeacherResponse(TeacherBase):
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class EmbeddingRegister(BaseModel):
    pose_name: str = Field(..., description="Pose name: 'FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'")
    embedding: List[float] = Field(..., description="512-D float list representing face embedding")

class TeacherRegisterRequest(BaseModel):
    teacher_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    department: str = Field(..., min_length=1, max_length=100)
    embeddings: List[EmbeddingRegister] = Field(..., min_items=5, max_items=5, description="Must contain exactly 5 pose embeddings")
