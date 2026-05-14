@echo off
chcp 65001 >nul
title Karpathy LLM Wiki

echo ==============================================
echo          Karpathy LLM Wiki 启动器
echo ==============================================
echo.

:: 检查 Node.js 是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误：未找到 Node.js，请先安装 Node.js
    echo     下载地址：https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 npm 是否安装
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误：未找到 npm
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
echo ✅ npm 已安装
echo.

:: 进入项目目录
cd /d "%~dp0"

:: 检查 package.json 是否存在
if not exist "package.json" (
    echo ❌ 错误：未找到 package.json，请确保此文件在项目根目录
    pause
    exit /b 1
)

echo 📁 当前目录：%cd%
echo.

:: 检查依赖是否已安装
if not exist "node_modules" (
    echo ⏳ 正在安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
    echo.
)

echo 🚀 正在启动 Karpathy LLM Wiki...
echo.
echo 注意：首次启动可能需要几分钟，请耐心等待...
echo 启动后会自动打开浏览器窗口
echo.

:: 启动开发服务器
npm run dev

:: 如果退出，显示提示
echo.
echo ==============================================
echo                 程序已退出
echo ==============================================
pause