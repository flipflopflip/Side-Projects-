@echo off
rem Starts the Home Board server and opens it fullscreen in Edge kiosk mode.
cd /d "%~dp0"

rem Start the Python server (pythonw = no console window; fall back to python)
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw server.py
) else (
    start "Home Board server" /min python server.py
)

rem Give the server a moment to start
timeout /t 3 /nobreak >nul

rem Open the dashboard fullscreen with no browser UI
start "" msedge --kiosk http://localhost:8480 --edge-kiosk-type=fullscreen --no-first-run
