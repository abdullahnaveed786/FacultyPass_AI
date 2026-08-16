import json
import sys
from typing import Any, Dict, List, Union
from pydantic import field_validator, ValidationError
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FacultyPass AI"
    API_V1_STR: str = "/api/v1"
    
    # Databases (Required, no insecure fallbacks)
    DATABASE_URL: str
    REDIS_URL: str
    
    # Security (Required, no insecure fallbacks)
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    # Default Admin (Required, no insecure fallbacks)
    ADMIN_USERNAME: str
    ADMIN_PASSWORD: str
    
    # Biometric Configurations (Non-sensitive defaults)
    COOLDOWN_SECONDS: int = 900
    BIOMETRIC_THRESHOLD: float = 0.45
    DUPLICATE_THRESHOLD: float = 0.50
    
    # CORS Origins
    BACKEND_CORS_ORIGINS: Union[List[str], str] = ["*"]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def clean_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            # asyncpg does not support 'sslmode'. Replace it with 'ssl' for SQLAlchemy translation.
            v = v.replace("sslmode=", "ssl=")
        return v

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
        env_file = ("../.env", ".env")
        case_sensitive = True
        extra = "ignore"

# Centralized settings loading with strict startup validation
try:
    settings = Settings()
except ValidationError as e:
    print("\n❌ CRITICAL: Configuration loading failed due to missing required environment variables/secrets:")
    for err in e.errors():
        field = " -> ".join(str(loc) for loc in err["loc"])
        print(f"  - Missing or Invalid: {field} ({err['type']})")
    print("\nPlease define these secrets in your environment or a local .env file before running.\n")
    sys.exit(1)

