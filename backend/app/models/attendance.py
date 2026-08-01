import uuid
import datetime
from sqlalchemy import Date, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    teacher_id: Mapped[str] = mapped_column(
        ForeignKey("teachers.teacher_id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False, index=True)
    check_in_time: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out_time: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    total_working_hours: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'

    # Relationships
    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="attendance_logs")
