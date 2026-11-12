@echo off
REM Publica a versao atual do Cotador 3D na Cloudflare
cd /d "%~dp0"
call npx wrangler deploy > deploy-log.txt 2>&1
type deploy-log.txt
pause
