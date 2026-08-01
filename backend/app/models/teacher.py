from datetime import datetime
from typing import List
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Teacher(Base):
    __tablename__ = "teachers"

    teacher_id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        nullable=False
    )

    # Relationships
    embeddings: Mapped[List["TeacherEmbedding"]] = relationship(
        "TeacherEmbedding", 
        back_populates="teacher", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    attendance_logs: Mapped[List["AttendanceLog"]] = relationship(
        "AttendanceLog", 
        back_populates="teacher",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
