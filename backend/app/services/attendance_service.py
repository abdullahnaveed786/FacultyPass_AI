import uuid
from datetime import datetime, timezone, date
from typing import Dict, Any, Optional
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.attendance import AttendanceLog
from app.models.teacher import Teacher

# Redis Client connection pool setup
redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

class AttendanceService:
    """
    Check-In/Check-Out State Machine & Cooldown Cache Service.
    Supports multiple session logs per user per day.
    """
    @staticmethod
    async def process_biometric_hit(
        teacher_id: str, 
        action: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Processes a biometric scan with an explicit intent (CHECK_IN or CHECK_OUT).
        Enforces strict check-in -> check-out -> check-in state transitions.
        """
        # 1. Check Redis Cooldown state (prevents spamming scans within a few seconds)
        cooldown_key = f"cooldown:{teacher_id}"
        cooldown_val = await redis_client.get(cooldown_key)

        if cooldown_val:
            ttl = await redis_client.ttl(cooldown_key)
            return {
                "status": "COOLDOWN_ACTIVE",
                "message": f"Scan registered too quickly. Please wait {ttl} seconds.",
                "cooldown_remaining": ttl,
                "teacher_id": teacher_id
            }

        # 2. Query database for the latest attendance record of this teacher
        stmt = select(AttendanceLog).where(
            AttendanceLog.teacher_id == teacher_id
        ).order_by(
            AttendanceLog.check_in_time.desc()
        ).limit(1)

        result = await db.execute(stmt)
        latest_log = result.scalar_one_or_none()

        now_utc = datetime.now(timezone.utc)
        has_open_session = latest_log and latest_log.status == "CHECKED_IN" and latest_log.check_out_time is None

        # 3. State Machine transition based on user's selected mode
        if action == "CHECK_IN":
            if has_open_session:
                # Block duplicate check-in
                return {
                  "status": "ALREADY_CHECKED_IN",
                  "message": "Duplicate Blocked: You are already checked in. Please check out first!",
                  "teacher_id": teacher_id
                }
            else:
                # Perform Check-In (New record in PostgreSQL)
                new_log = AttendanceLog(
                    id=uuid.uuid4(),
                    teacher_id=teacher_id,
                    date=now_utc.date(),
                    check_in_time=now_utc,
                    check_out_time=None,
                    total_working_hours=None,
                    status="CHECKED_IN"
                )
                db.add(new_log)
                await db.flush()
                
                # Set minor cooldown key in Redis (e.g., 10 seconds to prevent double scanning in the same event)
                await redis_client.set(cooldown_key, "CHECKED_IN", ex=10)
                
                return {
                    "status": "CHECKED_IN",
                    "message": "Check-in logged successfully in database.",
                    "log_id": str(new_log.id),
                    "check_in_time": new_log.check_in_time.isoformat(),
                    "check_out_time": None,
                    "working_hours": None
                }

        elif action == "CHECK_OUT":
            if not has_open_session:
                # Block check-out if not checked in
                return {
                  "status": "NOT_CHECKED_IN",
                  "message": "Access Denied: You must check in before you can check out!",
                  "teacher_id": teacher_id
                }
            else:
                # Perform Check-Out (Update the open session record in PostgreSQL)
                latest_log.check_out_time = now_utc
                latest_log.status = "COMPLETED"
                
                duration = now_utc - latest_log.check_in_time
                latest_log.total_working_hours = round(duration.total_seconds() / 3600.0, 4)
                
                db.add(latest_log)
                await db.flush()
                
                # Set minor cooldown key in Redis
                await redis_client.set(cooldown_key, "COMPLETED", ex=10)
                
                return {
                    "status": "CHECKED_OUT",
                    "message": "Check-out logged successfully in database.",
                    "log_id": str(latest_log.id),
                    "check_in_time": latest_log.check_in_time.isoformat(),
                    "check_out_time": latest_log.check_out_time.isoformat(),
                    "working_hours": latest_log.total_working_hours
                }
        
        return {
            "status": "INVALID_ACTION",
            "message": f"Action {action} is not supported."
        }

    @staticmethod
    async def get_dashboard_summary(db: AsyncSession) -> Dict[str, Any]:
        """
        Compiles core dashboard metrics: Total Faculty, Present Today, Currently Checked-In, etc.
        """
        today = datetime.now(timezone.utc).date()
        
        # 1. Total Faculty count
        faculty_stmt = select(Teacher).where(Teacher.is_active == True)
        faculty_res = await db.execute(faculty_stmt)
        total_faculty = len(faculty_res.scalars().all())

        # 2. Present Today (Teachers with at least one check-in today)
        present_stmt = select(AttendanceLog.teacher_id).where(
            AttendanceLog.date == today
        ).distinct()
        present_res = await db.execute(present_stmt)
        present_today = len(present_res.scalars().all())

        # 3. Currently Checked-In (Open sessions)
        active_stmt = select(AttendanceLog).where(
            AttendanceLog.status == "CHECKED_IN",
            AttendanceLog.check_out_time == None
        )
        active_res = await db.execute(active_stmt)
        currently_active = len(active_res.scalars().all())

        # 4. Total working hours logged today
        hours_stmt = select(AttendanceLog.total_working_hours).where(
            AttendanceLog.date == today,
            AttendanceLog.total_working_hours != None
        )
        hours_res = await db.execute(hours_stmt)
        total_hours = sum(hours_res.scalars().all() or [0.0])

        return {
            "total_faculty": total_faculty,
            "present_today": present_today,
            "currently_active": currently_active,
            "total_working_hours_today": round(total_hours, 2)
        }
