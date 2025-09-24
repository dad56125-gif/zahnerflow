@echo off
chcp 65001 > nul
echo Starting ZahnerFlow applications...
echo Killing ports 8000, 8083, 3001...

echo Killing processes on port 8000 (Python API)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo Found process %%a on port 8000, killing...
    taskkill /f /pid %%a
)

echo Killing processes on port 8083 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8083 ^| findstr LISTENING') do (
    echo Found process %%a on port 8083, killing...
    taskkill /f /pid %%a
)

echo Killing processes on port 3001 (Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Found process %%a on port 3001, killing...
    taskkill /f /pid %%a
)

echo Waiting for processes to close...
timeout /t 2 /nobreak > nul

echo Starting Frontend on port 8083...
start "Frontend" cmd /k "cd /d "%~dp0apps\frontend" && pnpm dev"

echo Starting Backend on port 3001...
start "Backend" cmd /k "cd /d "%~dp0apps\backend" && pnpm start:dev"

 echo Starting Python API Server on port 8000...
start "Python API" cmd /k "cd /d C:\Users\Dushuaijia\Documents\Code\ZAHNERFLOW\apps\backend\src\modules\zahner-zennium\fastapi && python zahner_device.py"

echo.
echo ========================================
echo All applications started!
echo Frontend: http://localhost:8083
echo Backend:  http://localhost:3001
echo Python API: http://localhost:8000
echo ========================================
echo.
pause