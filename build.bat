@echo off
title KWiki Build

cd /d "%~dp0"

echo ======================================
echo  KWiki v0.2.1 Build Script
echo ======================================
echo.

REM Clean old build
if exist build\ (
    echo [Clean] removing old build/ ...
    rmdir /s /q build\
)
if exist dist\ (
    echo [Clean] removing old dist/ ...
    rmdir /s /q dist\
)

REM Check Python
python -c "import tkinter; import requests; import bs4" 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Required packages not found.
    echo Run: pip install requests beautifulsoup4
    echo.
    pause
    exit /b 1
)

REM Build
echo.
echo [Build] Running PyInstaller ...
pyinstaller kwiki.spec --clean

if errorlevel 1 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo ======================================
echo  Build Complete!
echo ======================================
echo.
echo  Output: %cd%\dist\kwiki\kwiki.exe
echo.
pause
