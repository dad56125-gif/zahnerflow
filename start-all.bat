@echo off
chcp 65001 > nul
echo Starting ZahnerFlow applications...
echo Killing ports 8000, 8001, 8010, 8011, 8083, 3001...

echo Killing processes on port 8010 (MFC FastAPI)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8010 ^| findstr LISTENING') do (
    echo Found process %%a on port 8010, killing...
    taskkill /f /pid %%a
)

echo Killing processes on port 8011 (Furnace FastAPI)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8011 ^| findstr LISTENING') do (
    echo Found process %%a on port 8011, killing...
    taskkill /f /pid %%a
)

echo Killing processes on port 8000 (Zahner API)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo Found process %%a on port 8000, killing...
    taskkill /f /pid %%a
)

echo Killing processes on port 8001 (Zahner Simulator)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo Found process %%a on port 8001, killing...
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

echo Starting Device Layer Services first...

echo Starting Furnace FastAPI Server on port 8011...
start "Furnace FastAPI" cmd /k "cd /d "%~dp0apps\backend\src\modules\furnace\fastapi" && python ai518p_device.py"

echo Starting MFC FastAPI Server on port 8010...
start "MFC FastAPI" cmd /k "cd /d "%~dp0apps\backend\src\modules\mfc\fastapi" && python mfc_device.py"

echo Starting Zahner API Server on port 8000...
start "Zahner API" cmd /k "cd /d "%~dp0apps\backend\src\modules\zahner-zennium\fastapi" && python zahner_device.py"

echo Starting Zahner Simulator on port 8001...
start "Zahner Simulator" cmd /k "cd /d "%~dp0apps\backend\src\modules\zahner-zennium\fastapi" && python simulator_device.py"

echo Waiting for device services to fully initialize...
timeout /t 4 /nobreak > nul

echo Starting Backend on port 3001...
start "Backend" cmd /k "cd /d "%~dp0apps\backend" && pnpm start:dev"

echo Waiting for backend service to initialize...
timeout /t 3 /nobreak > nul

echo Starting Frontend on port 8083...
start "Frontend" cmd /k "cd /d "%~dp0apps\frontend" && pnpm dev"

echo.
echo ========================================
echo All applications started!
echo Frontend: http://localhost:8083
echo Backend:  http://localhost:3001
echo MFC FastAPI: http://localhost:8010
echo Furnace FastAPI: http://localhost:8011
echo Zahner API: http://localhost:8000
echo Zahner Simulator: http://localhost:8001
echo ========================================
echo.
echo TIP: Use API to switch between real device and simulator:
echo   POST /api/devices/zahner-zennium/device-mode {"mode": "simulator"}
echo.
pause