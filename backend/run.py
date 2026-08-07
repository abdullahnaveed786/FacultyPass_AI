import os
import uvicorn

if __name__ == "__main__":
    # Dynamically read PORT injected by cloud providers, default to 7860 locally
    port = int(os.environ.get("PORT", 7860))
    print(f"[STARTUP] Starting Uvicorn server on port {port}...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
