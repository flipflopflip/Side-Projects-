@echo off
rem Stops Home Board. Note: this closes ALL Edge windows and ALL
rem Python processes, which is fine on a laptop dedicated to the mirror.
taskkill /f /im msedge.exe >nul 2>nul
taskkill /f /im pythonw.exe >nul 2>nul
taskkill /f /im python.exe >nul 2>nul
echo Home Board stopped.
pause
