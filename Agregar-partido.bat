@echo off
chcp 65001 >nul
setlocal
rem Arrastra el partido_NN_AAAA-MM-DD.json y/o el AAAAMMDD_timeline.html sobre este .bat.
rem Los ubica en data/ y timelines/, regenera el manifest y hace commit + push.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agregar-partido.ps1" %*
echo.
pause
