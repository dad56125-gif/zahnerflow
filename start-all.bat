@echo off
chcp 65001 > nul
echo ========================================
echo ZahnerFlow - single Python backend
echo ========================================
echo.

echo Cleaning backend port 3001 and frontend dev port 8083...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Found process %%a on port 3001, killing...
    taskkill /f /pid %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8083 ^| findstr LISTENING') do (
    echo Found process %%a on port 8083, killing...
    taskkill /f /pid %%a 2>nul
)

timeout /t 2 /nobreak > nul

echo Starting Python backend on port 3001...
start "ZahnerFlow Python Backend" cmd /k "cd /d "%~dp0" && uv run python apps\python_backend\main.py"

echo Waiting for backend service to initialize...
timeout /t 3 /nobreak > nul

echo Starting frontend dev server on port 8083...
start "ZahnerFlow Frontend" cmd /k "cd /d "%~dp0apps\frontend" && pnpm dev"

echo.
echo ========================================
echo ZahnerFlow started
echo ========================================
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:8083
echo.
echo Runtime exposes no device FastAPI ports.
echo ========================================
echo.
pause
