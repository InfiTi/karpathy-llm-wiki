@echo off
chcp 65001 >nul
title KWiki 打包

echo ==========================================
echo  KWiki v0.2.1 一键打包
echo ==========================================
echo.

cd /d "%~dp0"

REM 清理旧构建
if exist build\ (
    echo [清理] 删除旧 build/ ...
    rmdir /s /q build\
)
if exist dist\ (
    echo [清理] 删除旧 dist/ ...
    rmdir /s /q dist\
)

REM 检查依赖
echo [检查] Python 环境 ...
python -c "import tkinter; import requests; import bs4; print('    OK: tkinter, requests, bs4')" 2>nul
if errorlevel 1 (
    echo [错误] 请在 conda 环境中运行：
    echo   conda activate YOUR_ENV
    echo 或直接运行：
    echo   E:\AIGC\ComfyUI\ComfyUI-aki-v1.7\python_embeded\python.exe kwiki.py
    pause
    exit /b 1
)

REM 打包
echo.
echo [打包] 运行 PyInstaller ...
pyinstaller kwiki.spec --clean

if errorlevel 1 (
    echo.
    echo [错误] 打包失败！
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  打包完成！
echo ==========================================
echo.
echo  exe 位置:
echo  %cd%\dist\kwiki\kwiki.exe
echo.
echo  运行前请确保:
echo  1. Vault 路径设置正确（程序内设置）
echo  2. Ollama 已启动（localhost:11434）
echo.
echo  双击上方路径即可运行 kwiki.exe
echo ==========================================
pause
