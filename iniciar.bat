@echo off
chcp 65001 >nul
echo ============================================
echo        YT Downloader - Iniciando...
echo ============================================
echo.

cd /d "%~dp0backend"

if not exist venv (
    echo [AVISO] Ambiente virtual nao encontrado. Execute instalar.bat primeiro.
    pause
    exit /b 1
)

echo Iniciando servidor backend...
start "YT Downloader - Backend" /min cmd /c "call venv\Scripts\activate.bat && venv\Scripts\python.exe app.py"

echo Aguardando servidor iniciar...
timeout /t 3 /nobreak >nul

echo Abrindo o site no navegador...
start "" "%~dp0frontend\index.html"

echo.
echo ============================================
echo  Servidor rodando em http://localhost:5000
echo  O site foi aberto no seu navegador!
echo  Feche esta janela para parar o servidor.
echo ============================================
echo.
echo Pressione qualquer tecla para ENCERRAR o servidor...
pause >nul

taskkill /fi "WINDOWTITLE eq YT Downloader - Backend" /f >nul 2>&1
echo Servidor encerrado.
