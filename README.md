# FacultyPass AI — Doorway Attendance Tracking System

FacultyPass AI is a production-ready, enterprise-grade automated doorway kiosk attendance tracking system. It replaces manual sign-in sheets by deploying facial-biometric doorway tablets or web kiosks at classrooms or main office doorways.

## System Features

* **3D Head Pose Verification (PnP)**: Utilizes OpenCV Perspective-n-Point to calculate real-time Euler angles (Yaw, Pitch, Roll) from 5-point facial landmarks, ensuring high-quality pose validation during enrollment.
* **5x512 Multi-Pose ArcFace Databases**: Stores 5 distinct 512-D vectors per teacher in a PostgreSQL database using the `pgvector` extension, query-matching using hardware-accelerated cosine distance.
* **1:N Anti-Duplication Engine**: Prevents double registrations by matching candidate enrollment vectors against all existing vectors at DB-level.
* **Atomic Cooldown & Session State Machine**: Integrates Redis to enforce a 15-minute cooldown between scans, preventing accidental double check-ins. Supports multiple check-in/out session records per day.
* **Admin Dashboard & Analytics**: High-performance control panel displaying total faculty counts, hours logged today, presenting real-time filters, manual session overrides, and CSV log exports.

---

## Technical Stack

* **Frontend**: React.js (Vite), Tailwind CSS, Axios, Lucide Icons, HTML5 Webcam Canvas API.
* **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0 (Async ORM), Pydantic v2, InsightFace (`buffalo_l` backbone).
* **Database**: PostgreSQL (v15+) + `pgvector` extension.
* **Caching & Session Locks**: Redis (atomic cache keys with TTL expiration).
* **Containerization**: Docker & Docker Compose.

---

## 3D head Pose Estimation (OpenCV PnP)

Rather than checking basic 2D relative coordinate distances, the **Pose Estimation Module** solves the 3D Perspective-n-Point problem. By mapping 5 facial landmarks (Eyes, Nose, Mouth Corners) to a standard physical 3D facial coordinate matrix, it computes the rotation vector (`rvec`) and translates it into degrees of **Yaw**, **Pitch**, and **Roll**:

* **FRONT**: Yaw, Pitch, Roll all within \([-10^\circ, 10^\circ]\).
* **LOOK LEFT**: Yaw \(\ge 12^\circ\); Pitch, Roll level.
* **LOOK RIGHT**: Yaw \(\le -12^\circ\); Pitch, Roll level.
* **LOOK UP**: Pitch \(\ge 12^\circ\); Yaw, Roll level.
* **LOOK DOWN**: Pitch \(\le -12^\circ\); Yaw, Roll level.

---

## State Machine Transition Logic

1. Scan request received from Kiosk.
2. Check Redis for `cooldown:{teacher_id}`:
   * **Active**: Return `COOLDOWN_ACTIVE` (frame scan is ignored).
3. If no cooldown key, query PostgreSQL for the latest session log:
   * If latest log exists and is **open** (`status = 'CHECKED_IN'`, `check_out_time IS NULL`):
     * **Action**: Check-Out.
     * Update log: set check-out time, calculate total working hours, set status to `COMPLETED`.
     * Set Redis cooldown key with `TTL = 900s`.
   * If latest log is **closed** (status `COMPLETED` / `CHECKED_OUT`) or doesn't exist:
     * **Action**: Check-In.
     * Insert new log: generate session UUID, check-in time = now, status = `CHECKED_IN`.
     * Set Redis cooldown key with `TTL = 900s`.

---

## Deployment & Startup Guide

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.
* A working webcam on your computer/host machine.

### Quick Start Commands

1. **Clone and Navigate**:
   ```bash
   cd FacultyPass_AI
   ```

2. **Configure Environment**:
   Initialize `.env` from example configurations (already pre-loaded with default local settings):
   ```bash
   cp .env.example .env
   ```

3. **Start Services**:
   Spin up all four containers (PostgreSQL, Redis, FastAPI backend, Vite-React frontend) in detached mode:
   ```bash
   docker-compose up --build -d
   ```

4. **Verify Container Health**:
   Wait a moment for PostgreSQL and Redis to initialize:
   ```bash
   docker-compose ps
   ```

5. **Access Applications**:
   * **React Web Console / Kiosk**: [http://localhost](http://localhost) (or [http://localhost:5173](http://localhost:5173))
   * **FastAPI Docs / Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
   * **Backend Health Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)

### Default Admin Credentials (for Admin Dashboard)
* **Username**: `admin`
* **Password**: `Admin123!`

---

## Verification & Testing

To run the automated test suite locally inside the backend container:

```bash
docker-compose exec fastapi_backend pytest
```
This tests the 3D Perspective-n-Point Euler angle math inside the `pose_validator.py` module.
