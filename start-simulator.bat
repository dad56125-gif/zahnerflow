@echo off
chcp 65001 > nul
echo ========================================
echo ZahnerFlow - 纯模拟器模式启动器
echo ========================================
echo.
echo 正在清理端口 8001, 8012, 8013, 8083, 3001...

echo Killing processes on port 8001 (Zahner Simulator)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo Found process %%a on port 8001, killing...
    taskkill /f /pid %%a 2>nul
)

echo Killing processes on port 8012 (Furnace Simulator)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8012 ^| findstr LISTENING') do (
    echo Found process %%a on port 8012, killing...
    taskkill /f /pid %%a 2>nul
)

echo Killing processes on port 8013 (MFC Simulator)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8013 ^| findstr LISTENING') do (
    echo Found process %%a on port 8013, killing...
    taskkill /f /pid %%a 2>nul
)

echo Killing processes on port 8083 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8083 ^| findstr LISTENING') do (
    echo Found process %%a on port 8083, killing...
    taskkill /f /pid %%a 2>nul
)

echo Killing processes on port 3001 (Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Found process %%a on port 3001, killing...
    taskkill /f /pid %%a 2>nul
)

echo Waiting for processes to close...
timeout /t 2 /nobreak > nul

echo.
echo ========================================
echo 启动模拟器服务...
echo ========================================

echo Starting Zahner Simulator on port 8001...
start "Zahner Simulator" cmd /k "cd /d "%~dp0apps\backend\src\modules\zahner-zennium\fastapi" && python simulator_device.py"

echo Starting Furnace Simulator on port 8012...
start "Furnace Simulator" cmd /k "cd /d "%~dp0apps\backend\src\modules\furnace\fastapi" && python simulator_device.py"

echo Starting MFC Simulator on port 8013...
start "MFC Simulator" cmd /k "cd /d "%~dp0apps\backend\src\modules\mfc\fastapi" && python simulator_device.py"

echo Waiting for simulator services to fully initialize...
timeout /t 3 /nobreak > nul

echo.
echo ========================================
echo 启动后端服务 (模拟器模式)...
echo ========================================
echo 设置环境变量: ZAHNER_MODE=simulator, FURNACE_MODE=simulator, MFC_MODE=simulator

echo Starting Backend on port 3001 with simulator config...
start "Backend (Simulator)" cmd /k "cd /d "%~dp0apps\backend" && set ZAHNER_MODE=simulator&& set FURNACE_MODE=simulator&& set MFC_MODE=simulator&& pnpm start:dev"

echo Waiting for backend service to initialize...
timeout /t 4 /nobreak > nul

echo Starting Frontend on port 8083...
start "Frontend" cmd /k "cd /d "%~dp0apps\frontend" && pnpm dev"

echo.
echo ========================================
echo 所有服务已启动 [模拟器模式]
echo ========================================
echo.
echo Frontend:           http://localhost:8083
echo Backend:            http://localhost:3001
echo.
echo [模拟器端口]
echo Zahner Simulator:   http://localhost:8001
echo Furnace Simulator:  http://localhost:8012
echo MFC Simulator:      http://localhost:8013
echo.
echo 模拟器预设设备:
echo   - Zahner: 电化学工作站模拟器
echo   - Furnace: AI-518P 温控器模拟器
echo   - MFC: 预设4个设备 (地址 32-35, N2/O2/Ar/H2)
echo.
echo 无需连接真实硬件，可完整测试工作流功能!
echo ========================================
echo.
pause
