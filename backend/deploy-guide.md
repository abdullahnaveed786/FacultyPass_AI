# Vercel Serverless Backend Deployment Guide

This guide describes how to deploy the FastAPI backend folder to Vercel and configure its environment secrets.

---

### Step 1: Vercel Project Setup
1. Go to the **Vercel Dashboard** and click **Add New** -> **Project**.
2. Select your repository `FacultyPass_AI`.
3. In the configuration settings:
   * **Framework Preset**: Select **Other**.
   * **Root Directory**: Click Edit and select the **`backend`** directory.
   * **Build & Development Settings**: Keep defaults (Vercel automatically detects `vercel.json` and builds the Python dependencies).

---

### Step 2: Environment Variables
Add the following key-value pairs under **Environment Variables** in the Vercel project settings:

| Variable Name | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | Async connection string to Neon PostgreSQL DB | `postgresql+asyncpg://neondb_owner:***@ep-damp-lab-axi25vrd.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| **`REDIS_URL`** | Upstash secure serverless Redis URL | `rediss://default:***@singular-spaniel-111140.upstash.io:6379` |
| **`JWT_SECRET`** | Secret key for signing admin login tokens | `supersecretjwttokenkey123!` (or a random hash) |
| **`ADMIN_USERNAME`** | Username for the Administrator Console | `admin` |
| **`ADMIN_PASSWORD`** | Password for the Administrator Console | `Admin123!` |
| **`JWT_ALGORITHM`** | Algorithm for signing JWTs (Default: HS256) | `HS256` |
| **`COOLDOWN_SECONDS`** | Biometric transaction cooldown timer | `900` (15 minutes) |
| **`BIOMETRIC_THRESHOLD`** | Minimum cosine similarity score for face match | `0.45` |

---

### Step 3: Trigger Deployment
1. Click **Deploy**.
2. Vercel will install the requirements from `requirements.txt` and launch the API serverless endpoints.
3. Your final backend API URL will be: `https://<your-vercel-project>.vercel.app`.
