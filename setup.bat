@echo off
REM Primeira publicacao do Cotador 3D (Cloudflare Worker + D1)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode este arquivo de novo.
  echo Node.js nao encontrado > setup-log.txt
  pause
  exit /b 1
)
node setup.mjs
echo.
pause
