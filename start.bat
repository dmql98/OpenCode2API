@echo off
setlocal
cd /d "%~dp0"

title opencode2api

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [ERR] Node.js not found in PATH.
    echo         Install Node.js 18 or newer from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

node start.mjs start
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
    echo   Startup FAILED - see the log output above.
) else (
    echo   Press any key to close this window.
    echo   The backend and proxy keep running in the background.
    echo.
    pause >nul
)
exit /b %EXITCODE%
