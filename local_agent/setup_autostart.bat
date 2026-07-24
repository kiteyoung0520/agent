@echo off
chcp 65001 >nul
title anyGem 本機代理 — 開機自動啟動設定

echo ╔══════════════════════════════════════════╗
echo ║  anyGem 本機磁碟代理 — 開機自動啟動設定  ║
echo ╚══════════════════════════════════════════╝
echo.

:: 自動取得腳本所在目錄（支援任意路徑）
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "NODE_PATH=node"
set "TASK_NAME=anyGem_LocalAgent"

echo 代理目錄: %SCRIPT_DIR%
echo.

:: 檢查 agent.js 是否存在
if not exist "%SCRIPT_DIR%\agent.js" (
    echo ❌ 找不到 agent.js！
    echo    預期位置: %SCRIPT_DIR%\agent.js
    echo    請確認 setup_autostart.bat 和 agent.js 在同一個資料夾。
    pause
    exit /b 1
)
echo ✅ agent.js 存在

:: 檢查 node 是否存在
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ 找不到 Node.js！請先安裝 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

:: 取得 node 完整路徑
for /f "delims=" %%i in ('where node') do set "NODE_FULL=%%i"
echo ✅ 找到 Node.js: %NODE_FULL%
echo.

:: 刪除舊的工作排程
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: 建立新的工作排程（登入時自動啟動，最小化視窗）
schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "cmd /c start /min \"anyGem代理\" \"%NODE_FULL%\" \"%SCRIPT_DIR%\agent.js\"" ^
    /sc ONLOGON ^
    /rl HIGHEST ^
    /f ^
    /delay 0000:30

if errorlevel 1 (
    echo ❌ 工作排程建立失敗！
    echo    請以「系統管理員身分」執行此腳本。
    echo    或使用 setup.js 一鍵安裝（自動請求管理員權限）
    pause
    exit /b 1
)

echo ✅ 工作排程已成功建立！
echo    任務名稱: %TASK_NAME%
echo    觸發條件: 每次登入 Windows 時自動啟動（延遲 30 秒）
echo.

:: 停止舊的代理（如果正在運行）
echo 正在停止舊版代理（如有）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3456') do (
    if not "%%a"=="" (
        taskkill /PID %%a /F >nul 2>&1
    )
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3457') do (
    if not "%%a"=="" (
        taskkill /PID %%a /F >nul 2>&1
    )
)

echo ✅ 舊版代理已停止

:: 立即啟動代理
echo 正在啟動本機代理...
start /min "anyGem本機代理" "%NODE_FULL%" "%SCRIPT_DIR%\agent.js"

echo.
echo 🎉 設定完成！
echo    anyGem 本機磁碟代理已在背景運行中。
echo.
echo    驗證方式：
echo    1. 打開瀏覽器前往 https://kiteyoung0520.github.io/agent/
echo    2. 查看右下角「本機」指示燈是否亮綠色
echo    3. 或直接訪問 http://127.0.0.1:3456/ping
echo.
echo    若 Port 3456 被佔用，請改用 setup.js 一鍵安裝：
echo       node "%SCRIPT_DIR%\setup.js"
echo.
pause