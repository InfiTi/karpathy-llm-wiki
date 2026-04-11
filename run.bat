@echo off
chcp 65001 >nul
title KWiki - 直接运行（源码模式）

cd /d "%~dp0"

echo.
echo [KWiki] 启动中 ...
echo.
echo 如遇错误，请确认 conda 环境已激活：
echo   conda activate YOUR_ENV
echo.

python kwiki.py

if errorlevel 1 (
    echo.
    echo [错误] 启动失败！
    echo.
    echo 可尝试指定 Python：
    echo   E:\AIGC\ComfyUI\ComfyUI-aki-v1.7\python_embeded\python.exe kwiki.py
)
pause
