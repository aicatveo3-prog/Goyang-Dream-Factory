@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  꿈제작소의 밤
echo  브라우저가 열리면 이 창은 그대로 두세요.
echo.
start "" "http://127.0.0.1:8765/"
py -m http.server 8765 2>nul
if errorlevel 1 python -m http.server 8765
pause
