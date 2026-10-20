@echo off
rem Luna without packaging: the window opens from the code, changes show up live.
rem The first start compiles for a few minutes, later ones are quick.
set "PATH=%~dp0.tools\node;%PATH%"
cd /d "%~dp0app"
if not exist node_modules call npm install
call npx tauri dev
