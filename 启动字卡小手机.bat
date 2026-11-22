@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 (
  echo Could not open the app folder.
  pause
  exit /b 1
)
node.exe server.js
if errorlevel 1 echo The app stopped unexpectedly. Please send this window to me.
pause
