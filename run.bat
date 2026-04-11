@echo off
title KWiki - run

cd /d "%~dp0"

echo.
echo [KWiki] Starting ...
echo.

REM Try running with python directly first
python kwiki.py
if not errorlevel 1 goto :end

REM Fallback: try conda python
echo.
echo [Hint] Try with embedded Python:
echo   python.exe kwiki.py
echo.

:end
pause
