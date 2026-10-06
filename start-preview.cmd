@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js from https://nodejs.org/ or open build\browser\index.html.
  pause
  exit /b 1
)
echo Starting local preview on http://127.0.0.1:4173/
start "" "http://127.0.0.1:4173/"
node scripts\serve.mjs
pause
