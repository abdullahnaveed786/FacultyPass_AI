from fastapi import APIRouter
from app.api.v1.endpoints import auth, enrollment, verification, reports

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(enrollment.router, prefix="/enrollment", tags=["Enrollment"])
api_router.include_router(verification.router, prefix="/verification", tags=["Verification"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports & Administration"])
