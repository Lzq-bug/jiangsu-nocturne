@echo off
rem Mengxiyuan alley 3D night scene - local dev preview (ES modules need http://, not file://)
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js not found in PATH. Install it from https://nodejs.org/ and reopen this window.
  echo     Already built? The html in the dist folder needs no server at all - just double-click it.
  pause
  exit /b 1
)
start "" http://127.0.0.1:8801/index.html
node tools\serve.mjs 8801
