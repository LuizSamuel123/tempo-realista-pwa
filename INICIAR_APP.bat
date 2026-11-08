@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Tempo Realista
set "BACKEND_DIR=%~dp0backend"
set "PYTHON_EXE=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo.
  echo O aplicativo ainda nao foi preparado neste computador.
  echo A preparacao sera iniciada agora.
  echo.
  call "%BACKEND_DIR%\INSTALAR_EM_CASA.bat"
  exit /b %errorlevel%
)

"%PYTHON_EXE%" -c "import fastapi, uvicorn, sqlalchemy" >nul 2>nul
if errorlevel 1 (
  echo.
  echo O ambiente Python deste app esta incompleto ou foi movido de outro computador.
  echo A preparacao sera recriada agora.
  echo.
  call "%BACKEND_DIR%\INSTALAR_EM_CASA.bat"
  exit /b %errorlevel%
)

"%PYTHON_EXE%" -c "from pathlib import Path; import secrets; p=Path(r'%BACKEND_DIR%')/'data'/'access.key'; p.parent.mkdir(parents=True, exist_ok=True); key=p.read_text(encoding='utf-8').strip() if p.exists() else ''; p.write_text(key or secrets.token_urlsafe(32), encoding='utf-8')"
set /p TEMPO_KEY=<"%BACKEND_DIR%\data\access.key"

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%PYTHON_EXE%' -ArgumentList @('-m','uvicorn','app.main:app','--app-dir','%BACKEND_DIR%','--host','127.0.0.1','--port','8000') -WindowStyle Hidden"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8000/?key=%TEMPO_KEY%'"

echo.
echo Tempo Realista esta iniciando protegido.
echo O servidor local ficara escondido e so aceitara chamadas com a chave deste computador.
echo Para desligar, feche o processo Python pelo Gerenciador de Tarefas se necessario.
echo.

exit /b 0
