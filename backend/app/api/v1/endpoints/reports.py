from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update, delete
from typing import List, Optional
import datetime
import uuid

from app.database import get_db
from app.models.attendance import AttendanceLog
from app.models.teacher import Teacher
from app.schemas.attendance import AttendanceLogResponse, AttendanceManualOverride, AttendanceSummary
from app.schemas.teacher import TeacherResponse
from app.services.attendance_service import AttendanceService
from app.utils.auth_utils import get_current_admin

router = APIRouter()

@router.get("/summary", response_model=AttendanceSummary)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """
    Returns high-level statistics for the admin dashboard.
    """
    summary = await AttendanceService.get_dashboard_summary(db)
    return summary

@router.get("/attendance", response_model=List[AttendanceLogResponse])
async def get_attendance_logs(
    date_from: Optional[datetime.date] = Query(None),
    date_to: Optional[datetime.date] = Query(None),
    department: Optional[str] = Query(None),
    teacher_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """
    Retrieves filtered and paginated attendance logs.
    """
    # Join logs and teachers to return name/department
    stmt = (
        select(AttendanceLog, Teacher.name, Teacher.department)
        .join(Teacher, AttendanceLog.teacher_id == Teacher.teacher_id)
    )

    filters = []
    if date_from:
        filters.append(AttendanceLog.date >= date_from)
    if date_to:
        filters.append(AttendanceLog.date <= date_to)
    if department:
        filters.append(Teacher.department.ilike(f"%{department}%"))
    if teacher_id:
        filters.append(AttendanceLog.teacher_id == teacher_id)

    if filters:
        stmt = stmt.where(and_(*filters))

    # Order and paginate
    stmt = stmt.order_by(AttendanceLog.check_in_time.desc()).limit(limit).offset(offset)
    
    result = await db.execute(stmt)
    rows = result.all()

    logs_response = []
    for log, name, dept in rows:
        logs_response.append(
            AttendanceLogResponse(
                id=log.id,
                teacher_id=log.teacher_id,
                teacher_name=name,
                teacher_department=dept,
                date=log.date,
                check_in_time=log.check_in_time,
                check_out_time=log.check_out_time,
                total_working_hours=log.total_working_hours,
                status=log.status
            )
        )
    return logs_response

@router.post("/attendance/override", response_model=AttendanceLogResponse)
async def create_manual_override(
    payload: AttendanceManualOverride,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """
    Allows administrators to manually log a check-in/out session.
    """
    # Verify teacher exists
    teacher_stmt = select(Teacher).where(Teacher.teacher_id == payload.teacher_id)
    teacher_res = await db.execute(teacher_stmt)
    teacher = teacher_res.scalar_one_or_none()
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Teacher ID '{payload.teacher_id}' not found."
        )

    # Compute working hours
    hours = None
    if payload.check_out_time:
        if payload.check_out_time < payload.check_in_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Check-out time must be after check-in time."
            )
        delta = payload.check_out_time - payload.check_in_time
        hours = round(delta.total_seconds() / 3600.0, 4)

    new_log = AttendanceLog(
        id=uuid.uuid4(),
        teacher_id=payload.teacher_id,
        date=payload.check_in_time.date(),
        check_in_time=payload.check_in_time,
        check_out_time=payload.check_out_time,
        total_working_hours=hours,
        status=payload.status
    )
    db.add(new_log)
    await db.flush()

    response = AttendanceLogResponse(
        id=new_log.id,
        teacher_id=new_log.teacher_id,
        teacher_name=teacher.name,
        teacher_department=teacher.department,
        date=new_log.date,
        check_in_time=new_log.check_in_time,
        check_out_time=new_log.check_out_time,
        total_working_hours=new_log.total_working_hours,
        status=new_log.status
    )
    await db.commit()
    return response

@router.delete("/attendance/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance_log(
    log_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """
    Deletes an attendance log entry.
    """
    stmt = select(AttendanceLog).where(AttendanceLog.id == log_id)
    res = await db.execute(stmt)
    log = res.scalar_one_or_none()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance log not found."
        )
    await db.execute(delete(AttendanceLog).where(AttendanceLog.id == log_id))
    await db.commit()

@router.get("/teachers", response_model=List[TeacherResponse])
async def list_teachers(
    db: AsyncSession = Depends(get_db),
    admin: str = Depends(get_current_admin)
):
    """
    Returns a list of all registered teachers in the database.
    """
    stmt = select(Teacher).order_by(Teacher.name.asc())
    result = await db.execute(stmt)
    teachers = result.scalars().all()
    return teachers
