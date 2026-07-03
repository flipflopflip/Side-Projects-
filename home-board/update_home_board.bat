@echo off
rem Pulls the latest version of Home Board from GitHub.
cd /d "%~dp0"

if not exist ".git" (
    echo This copy wasn't installed with Git, so it can't update itself.
    echo To update, re-download the latest ZIP from GitHub and unzip it over this folder.
    echo.
    pause
    exit /b
)

echo Checking for updates...
git pull
echo.
echo Done. If anything changed, close Home Board and start it again
echo with start_home_board.bat.
echo.
pause
