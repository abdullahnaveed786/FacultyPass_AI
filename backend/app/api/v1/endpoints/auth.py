from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from app.config import settings
from app.utils.auth_utils import create_access_token
from app.database import get_db
from app.models.teacher import Teacher
from app.services.attendance_service import redis_client
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import random
import httpx

router = APIRouter()

class LoginJSONRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class OTPSendRequest(BaseModel):
    teacher_id: str
    email: str

class OTPVerifyRequest(BaseModel):
    teacher_id: str
    otp: str

class OTPSendResponse(BaseModel):
    success: bool
    message: str

class OTPVerifyResponse(BaseModel):
    success: bool
    message: str
    verified: bool

@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginJSONRequest):
    """
    Standard JSON endpoint for Admin Dashboard authentication.
    """
    if credentials.username != settings.ADMIN_USERNAME or credentials.password != settings.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect admin username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": credentials.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login/form", response_model=TokenResponse)
async def login_form(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2 compatible form login endpoint.
    """
    if form_data.username != settings.ADMIN_USERNAME or form_data.password != settings.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect admin username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": form_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/send-otp", response_model=OTPSendResponse)
async def send_otp(payload: OTPSendRequest, db: AsyncSession = Depends(get_db)):
    """
    Validates teacher registration email and sends a 6-digit OTP via Resend.
    """
    teacher_id = payload.teacher_id.strip()
    email = payload.email.strip().lower()
    # 1. Validation Checks (Adapted for Sandbox Mode)
    is_sandbox = settings.RESEND_FROM_EMAIL == "onboarding@resend.dev"
    if not is_sandbox:
        # Strict Production Validation
        if not email.endswith("@ucp.edu.pk"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email must be in the format <your_id>@ucp.edu.pk"
            )
        parts = email.split("@")
        if len(parts) != 2 or parts[0] != teacher_id.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teacher ID does not match the email username."
            )
    else:
        # Sandbox Mode: Allow @gmail.com bypass for local developers
        if not (email.endswith("@ucp.edu.pk") or email.endswith("@gmail.com")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sandbox Mode: Email must end with @ucp.edu.pk or @gmail.com to receive OTP codes."
            )

    # 3. Validation: Verify that the Teacher is not already registered in DB
    stmt = select(Teacher).where(func.lower(Teacher.teacher_id) == teacher_id.lower())
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher ID is already registered."
        )
        
    # 4. Rate-Limiting: Redis check to restrict requests to once per 60 seconds
    rate_limit_key = f"ratelimit:otp:{teacher_id.lower()}"
    has_requested = await redis_client.get(rate_limit_key)
    if has_requested:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please wait 60 seconds."
        )

    # 5. Generate random 6-digit verification code
    otp = f"{random.randint(100000, 999999)}"
    
    # 6. Store in Redis with 10 minutes TTL
    otp_key = f"otp:{teacher_id.lower()}"
    await redis_client.set(otp_key, otp, ex=600)
    await redis_client.set(rate_limit_key, "1", ex=60)
    
    # 7. Post email JSON payload to Resend API
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    email_payload = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [email],
        "subject": "FacultyPass AI - Your Verification Code",
        "html": f"""
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px; border: 1px solid #e5e7eb; border-radius: 12px; margin: auto;">
            <h2 style="color: #4f46e5; margin-top: 0;">FacultyPass AI</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #4b5563;">Hello,</p>
            <p style="font-size: 14px; line-height: 1.5; color: #4b5563;">Use the following verification code to register your biometrics on FacultyPass AI:</p>
            <div style="background-color: #f3f4f6; padding: 15px; font-size: 28px; font-weight: bold; letter-spacing: 5px; text-align: center; border-radius: 8px; margin: 25px 0; color: #1f2937; border: 1px solid #e5e7eb;">
                {otp}
            </div>
            <p style="font-size: 13px; line-height: 1.5; color: #6b7280;">This code is valid for <strong>10 minutes</strong>. If you did not request this verification, you can safely ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 11px; text-align: center; color: #9ca3af; margin-bottom: 0;">FacultyPass AI • Automated Doorway Biometrics</p>
        </div>
        """
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                json=email_payload,
                headers=headers,
                timeout=10.0
            )
            if response.status_code >= 400:
                error_msg = f"Resend API Error ({response.status_code}): {response.text}"
                print(error_msg)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=error_msg
                )
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Email delivery error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification service currently unavailable. Connection error: {str(e)}"
        )
        
    return {"success": True, "message": "Verification code sent to your email."}

@router.post("/verify-otp", response_model=OTPVerifyResponse)
async def verify_otp(payload: OTPVerifyRequest):
    """
    Verifies 6-digit OTP code from Redis cache and sets transient enrollment pass.
    """
    teacher_id = payload.teacher_id.strip()
    otp = payload.otp.strip()
    
    otp_key = f"otp:{teacher_id.lower()}"
    stored_otp = await redis_client.get(otp_key)
    
    if not stored_otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code expired or not found"
        )
        
    if stored_otp != otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
        
    # Successfully verified:
    # 1. Invalidate OTP key
    await redis_client.delete(otp_key)
    
    # 2. Grant temporary verified enrollment key in Redis for 20 minutes (1200 seconds)
    verification_key = f"verified_email:{teacher_id.lower()}"
    await redis_client.set(verification_key, "true", ex=1200)
    
    return {
        "success": True,
        "message": "Email verified successfully.",
        "verified": True
    }

