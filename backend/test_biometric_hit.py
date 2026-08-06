import asyncio
from app.database import SessionLocal
from app.services.attendance_service import AttendanceService

async def main():
    print("[1] Creating database session...")
    async with SessionLocal() as db:
        print("[2] Session created. Calling process_biometric_hit...")
        res = await AttendanceService.process_biometric_hit(
            teacher_id="FAC-001",
            action="CHECK_OUT",
            db=db
        )
        print("[3] Response received:")
        print(res)
        await db.commit()
        print("[4] Transaction committed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
