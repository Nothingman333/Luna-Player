@echo off
setlocal
cd /d "%~dp0app"
where npm >nul 2>nul
if errorlevel 1 (echo Node.js LTS kurulumu gerekli: https://nodejs.org/ & pause & exit /b 1)
if not exist node_modules (call npm ci & if errorlevel 1 exit /b 1)
echo Bu yalniz arayuz onizlemesidir. Gercek browser icin Luna Web Yerel.cmd kullanin.
call npm run preview:web
pause
