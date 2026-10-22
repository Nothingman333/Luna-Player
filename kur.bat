@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0kur.ps1"
if errorlevel 1 echo Kurulum tamamlanamadi. Yukaridaki hata mesajina bakin.
pause
