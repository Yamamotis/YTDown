@echo off
chcp 65001 >nul
echo ============================================
echo     YT Downloader - Instalando dependencias
echo ============================================
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Python nao encontrado. Instale o Python 3.9+ em https://python.org
    pause
    exit /b 1
)

echo [1/3] Criando ambiente virtual...
cd /d "%~dp0backend"
python -m venv venv
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao criar ambiente virtual.
    pause
    exit /b 1
)

echo [2/3] Ativando ambiente virtual...
call venv\Scripts\activate.bat

echo [3/3] Instalando bibliotecas...
pip install -r requirements.txt

echo.
echo ============================================
echo  Instalacao concluida! Execute iniciar.bat
echo ============================================
pause
