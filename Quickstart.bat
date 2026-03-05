@echo off
setlocal
cd /d "%~dp0"

echo.
echo Composer Website Starter quickstart
echo This will install dependencies and launch the setup wizard.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js 22+ and npm 10+, then try again.
  echo.
  pause
  exit /b 1
)

call npm run quickstart
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Quickstart exited with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
