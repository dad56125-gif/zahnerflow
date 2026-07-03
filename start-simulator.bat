@echo off
chcp 65001 > nul
echo ========================================
echo ZahnerFlow - simulator parameters mode
echo ========================================
echo.
echo This launcher starts the same single Python backend.
echo Use COM_SIMULATOR for furnace/MFC and host=simulator for Zahner in the UI.
echo.
call "%~dp0start-all.bat"
