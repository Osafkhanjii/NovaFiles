@echo off
title Nova Files - Auto Push
color 0A
echo.
echo  ========================================
echo   NOVA FILES - Auto Push to GitHub
echo  ========================================
echo.
echo  Watching for changes... (Ctrl+C to stop)
echo.

:loop
cd /d "D:\Osaf\Work\Okaaaaaaaaaaaaat"

REM Check if there are any changes
git status --porcelain >nul 2>&1
if %errorlevel%==0 (
    REM There are changes - commit and push
    git add -A
    git diff --cached --quiet
    if %errorlevel%==1 (
        echo [%date% %time%] Changes detected. Pushing...
        git commit -m "Auto-update: %date% %time%" --quiet
        git push --quiet 2>nul
        echo [%date% %time%] Pushed successfully!
    )
)

REM Wait 5 seconds then check again
timeout /t 5 /nobreak >nul
goto loop
