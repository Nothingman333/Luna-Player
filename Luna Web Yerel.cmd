@echo off
setlocal
set "RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc"
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%~dp0.tools\node;%PATH%"
where npm >nul 2>nul
if errorlevel 1 (echo Node.js LTS gerekli: https://nodejs.org/ & pause & exit /b 1)
where cargo >nul 2>nul
if errorlevel 1 (echo Rust MSVC ve Visual Studio C++ Build Tools gerekli. BUILDING.md dosyasina bakin. & pause & exit /b 1)
if not exist "app\src-tauri\mpv\mpv.exe" (echo Once scripts\fetch-mpv.ps1 ile mpv dosyalarini hazirlayin. BUILDING.md dosyasina bakin. & pause & exit /b 1)
cd app
if not exist node_modules (call npm ci & if errorlevel 1 exit /b 1)
call npx tauri dev
pause
