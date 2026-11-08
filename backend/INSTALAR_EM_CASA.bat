@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalar Tempo Realista
set "BACKEND_DIR=%~dp0"
set "PROJECT_ROOT=%~dp0.."
set "PYTHON_EXE=%BACKEND_DIR%\.venv\Scripts\python.exe"

where py >nul 2>&1
if %errorlevel%==0 (
  set "PYTHON=py"
  goto instalar
)

where python >nul 2>&1
if %errorlevel%==0 (
  set "PYTHON=python"
  goto instalar
)

echo.
echo O Python ainda nao esta instalado neste computador.
echo Instale o Python 3.12 ou mais recente e marque a opcao
echo "Add Python to PATH" durante a instalacao.
echo Depois, execute este arquivo novamente.
echo.
pause
exit /b 1

:instalar
echo.
echo Preparando o Tempo Realista...
if exist "%PYTHON_EXE%" (
  "%PYTHON_EXE%" -c "import fastapi, uvicorn, sqlalchemy" >nul 2>nul
  if not errorlevel 1 goto instalar_pacotes
  echo Ambiente antigo invalido. Recriando a preparacao local...
  rmdir /s /q "%BACKEND_DIR%\.venv"
)

%PYTHON% -m venv "%BACKEND_DIR%\.venv"
if errorlevel 1 goto erro

:instalar_pacotes
"%PYTHON_EXE%" -m pip install --upgrade pip
if errorlevel 1 goto erro

"%PYTHON_EXE%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 goto erro

echo.
echo Instalacao concluida.
echo O aplicativo sera iniciado agora.
call "%PROJECT_ROOT%\INICIAR_APP.bat"
exit /b 0

:erro
echo.
echo Nao foi possivel concluir a instalacao.
echo Confira sua conexao com a internet e tente novamente.
pause
exit /b 1
