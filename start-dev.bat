@echo off
setlocal
cd /d %~dp0
echo Starting backend server...
start "dev server" cmd /k "npm run dev:server"
choice /t 2 /d y /n >nul
echo Starting frontend client...
start "dev client" cmd /k "npm run dev:client"
echo Both dev processes are now running in their own windows.
endlocal
