import uuid
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field

class AttendanceLogBase(BaseModel):
    teacher_id: str
    date: date
    check_in_time: datetime
    check_out_time: Optional[datetime] = None
    total_working_hours: Optional[float] = None
    status: str

class AttendanceLogResponse(AttendanceLogBase):
    id: uuid.UUID
    teacher_name: Optional[str] = None
    teacher_department: Optional[str] = None

    class Config:
        from_attributes = True

class AttendanceManualOverride(BaseModel):
    teacher_id: str
    check_in_time: datetime
    check_out_time: Optional[datetime] = None
    status: str = "COMPLETED"

class AttendanceSummary(BaseModel):
    total_faculty: int
    present_today: int
    currently_active: int  # currently checked-in
    total_working_hours_today: float
