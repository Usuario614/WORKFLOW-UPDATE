@echo off
setlocal
cd /d "%~dp0"
echo.
echo WorkflowProof MVP
echo =================
echo Installing dependencies...
call npm install
if errorlevel 1 goto :error
echo.
echo Starting development server...
call npm run dev
exit /b 0
:error
echo.
echo Something failed. Confirm Node.js 18+ is installed and npm has internet access.
pause
exit /b 1
