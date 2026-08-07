FROM python:3.11-slim

# Install system dependencies for OpenCV, build tools, and numpy dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libglib2.0-0 \
    libgl1 \
    wget \
    unzip \
    && mkdir -p /root/.insightface/models/buffalo_sc \
    && wget -qO /tmp/buffalo_sc.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip \
    && unzip -q /tmp/buffalo_sc.zip -d /root/.insightface/models/buffalo_sc \
    && rm /tmp/buffalo_sc.zip \
    && apt-get purge -y --auto-remove wget unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install wheel
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 7860

# Run uvicorn server via port wrapper
CMD ["python", "main.py"]
