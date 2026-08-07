import os
import uvicorn
from app.main import app

# This allows SnapDeploy's automatic "FastAPI" preset (which looks for main:app in the root) to import the app successfully.
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    print(f"[STARTUP] Starting Uvicorn server on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port)
