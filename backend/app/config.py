import json
from typing import Any, Dict, List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FacultyPass AI"
    API_V1_STR: str = "/api/v1"
    
    # Databases
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@postgres_db:5432/facultypass"
    REDIS_URL: str = "redis://redis_cache:6379/0"
    
    # Security
    JWT_SECRET: str = "supersecretjwttokenkey123!"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    # Default Admin (Seed/Login Check)
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "Admin123!"
    
    # Biometric Configurations
    COOLDOWN_SECONDS: int = 900
    BIOMETRIC_THRESHOLD: float = 0.45
    DUPLICATE_THRESHOLD: float = 0.50
    
    # CORS Origins
    BACKEND_CORS_ORIGINS: Union[List[str], str] = ["*"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            try:
                if isinstance(v, str):
                    return json.loads(v)
                return v
            except Exception:
                return ["*"]
        return ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
