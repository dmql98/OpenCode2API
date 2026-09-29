@echo off
setlocal
cd /d "%~dp0"
title opencode2api - stop

where node >nul 2>nul
if errorlevel 1 (
    echo   [ERR] Node.js not found in PATH.
    pause
    exit /b 1
)

node start.mjs stop
echo.
pause
