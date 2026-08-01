from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base
from app.api.v1.router import api_router

# Import models to ensure they are registered in the Metadata object
from app.models import Teacher, TeacherEmbedding, AttendanceLog

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Phase
    print(f"[STARTUP] Initializing database for '{settings.PROJECT_NAME}'...")
    try:
        async with engine.begin() as conn:
            # Enable the pgvector extension first
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            print("[STARTUP] PostgreSQL 'vector' extension verified/enabled.")
            
            # Create tables if they do not exist
            await conn.run_sync(Base.metadata.create_all)
            print("[STARTUP] Database schemas created and verified.")
    except Exception as e:
        print(f"[STARTUP ERROR] Database initialization failed: {e}")
        raise e

    yield

    # Shutdown Phase
    print("[SHUTDOWN] Tearing down engine connections...")
    await engine.dispose()

# FastAPI application factory
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Automated Faculty Attendance tracking system with 3D facial pose verification and pgvector similarity matching.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
if settings.BACKEND_CORS_ORIGINS:
    origins = [str(origin) for origin in settings.BACKEND_CORS_ORIGINS]
    allow_all = "*" in origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Mount Routers
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health", tags=["Health"])
async def health():
    """
    Health check endpoint for Docker container status.
    """
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "database": "connected"
    }
