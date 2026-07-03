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

rem Open the dashboard fullscreen with no browser UI. Prefer Edge (kiosk with
rem no UI at all); fall back to Chrome; last resort, the default browser.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CHROME1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
    start "" "%EDGE%" --kiosk http://localhost:8480 --edge-kiosk-type=fullscreen --no-first-run
) else if exist "%CHROME1%" (
    start "" "%CHROME1%" --kiosk http://localhost:8480 --no-first-run
) else if exist "%CHROME2%" (
    start "" "%CHROME2%" --kiosk http://localhost:8480 --no-first-run
) else (
    rem No Chromium browser found in the usual place — open in whatever is default.
    start "" http://localhost:8480
)
