@echo off
setlocal
rem Luna without packaging: the window opens from the code, changes show up live.
rem The first start compiles for a few minutes, later ones are quick.
rem The repository folder carries a low integrity label in this workspace; WebView2 refuses
rem to start an exe from there (0x800700AA). Build here, then run the copy in %LOCALAPPDATA%\LunaDevRun.
rem Keep absolute paths in variables: %~dp0 is relative to the current folder after a cd.
set "ROOT=%~dp0"
set "APP=%ROOT%app"
set "TAURI=%APP%\src-tauri"
set "RUN=%LOCALAPPDATA%\LunaDevRun"
set "PATH=%ROOT%.tools\node;%USERPROFILE%\.cargo\bin;%PATH%"

cd /d "%APP%"
if not exist node_modules call npm install

rem Start Vite in the background and wait until 1420 answers. If 1420 is already serving, the new one exits by itself.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath cmd.exe -ArgumentList '/c','npm run dev -- --host 127.0.0.1 --port 1420 --strictPort' -WorkingDirectory '%APP%' -WindowStyle Hidden; for($i=0;$i -lt 40;$i++){ try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',1420); $c.Close(); break } catch { Start-Sleep -Milliseconds 250 } }; if($i -ge 40){ exit 1 }"
if errorlevel 1 (
  echo Vite did not start on port 1420.
  pause
  exit /b 1
)

echo Building Luna...
cd /d "%TAURI%"
cargo build
if errorlevel 1 goto :fail

if not exist "%RUN%" mkdir "%RUN%"
copy /Y "%TAURI%\target\debug\app.exe" "%RUN%\app.exe" >nul
if errorlevel 1 (
  echo Luna is still open. Close it before starting again.
  pause
  exit /b 1
)
if not exist "%RUN%\mpv" if exist "%TAURI%\target\debug\mpv" xcopy /E /I /Y "%TAURI%\target\debug\mpv" "%RUN%\mpv" >nul
if not exist "%RUN%\fonts" if exist "%TAURI%\target\debug\fonts" xcopy /E /I /Y "%TAURI%\target\debug\fonts" "%RUN%\fonts" >nul

start "" "%RUN%\app.exe"
exit /b 0

:fail
echo Build failed.
pause
exit /b 1
