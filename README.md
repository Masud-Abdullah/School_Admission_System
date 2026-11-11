# School Admission System

A simple First-Come-First-Served online school admission system built with **ASP.NET Core (.NET 8)**, **PostgreSQL**, **React (TypeScript + Vite)**, and **Docker**.

## Tech Stack
- **Backend:** C#, ASP.NET Core Minimal API, Entity Framework Core, PostgreSQL
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Database:** PostgreSQL 16
- **Containerization:** Docker & Docker Compose

## How to Run the Project

Make sure **Docker** is installed on your machine. Run the following command from the root folder:

    docker compose up --build

Once the containers start:
- **Frontend UI:** http://localhost:5173
- **Backend API:** http://localhost:8080

## Environment Variables
Default values are already configured in docker-compose.yml (see .env.example):
- DATABASE_URL: PostgreSQL connection string
- HOLD_DURATION_SECONDS: Hold expiry time in seconds (default: 600 seconds = 10 minutes)
- VITE_API_BASE_URL: Backend API URL (http://localhost:8080)

To test with a shorter hold time (for example, 30 seconds):

    HOLD_DURATION_SECONDS=30 docker compose up --build

## How to Run Tests

**Backend Tests (SchoolAdmission.Tests):**
If .NET 8 SDK is installed locally:

    dotnet test backend/SchoolAdmission.sln

Or run directly using Docker (without installing .NET locally):

    docker run --rm -v "$(pwd)/backend:/src" -w /src mcr.microsoft.com/dotnet/sdk:8.0 dotnet test SchoolAdmission.sln

**Frontend Tests:**

    cd frontend
    npm test
