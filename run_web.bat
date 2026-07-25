@echo off
chcp 65001 > nul
echo.
echo  ✝  매일성경 대시보드 시작 중...
echo.

cd /d "%~dp0"

:: 의존성 확인 및 설치
python -c "import fastapi, uvicorn, apscheduler" 2>nul
if errorlevel 1 (
    echo  [설치] 필요한 패키지를 설치합니다...
    pip install fastapi "uvicorn[standard]" apscheduler -q
)

:: 브라우저 자동 오픈 (1초 뒤)
start /b cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:8000"

:: 서버 실행
echo  [서버] http://localhost:8000
echo  [종료] Ctrl+C 를 누르세요
echo.
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
