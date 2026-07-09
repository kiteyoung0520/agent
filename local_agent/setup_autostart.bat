@echo off
chcp 65001 >nul
echo [anyGem] 正在設定 Windows 工作排程器...

set SCRIPT_DIR=%~dp0
set NODE_PATH=node
set TASK_NAME=anyGem_LocalAgent

:: 檢查 node 是否存在
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ 找不到 Node.js！請先安裝 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

:: 取得 node 完整路徑
for /f "delims=" %%i in ('where node') do set NODE_FULL=%%i

echo 找到 Node.js: %NODE_FULL%
echo 代理目錄: %SCRIPT_DIR%

:: 刪除舊的工作排程
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: 建立新的工作排程（登入時自動啟動，最小化視窗）
schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "cmd /c start /min \"anyGem代理\" \"%NODE_FULL%\" \"%SCRIPT_DIR%agent.js\"" ^
    /sc ONLOGON ^
    /rl HIGHEST ^
    /f ^
    /delay 0000:30

if errorlevel 1 (
    echo ❌ 工作排程建立失敗！請以系統管理員身分執行此腳本。
    pause
    exit /b 1
)

echo.
echo ✅ 工作排程已成功建立！
echo    任務名稱: %TASK_NAME%
echo    觸發條件: 每次登入 Windows 時自動啟動（延遲 30 秒）
echo.
echo 現在立即啟動代理程式...
start /min "anyGem本機代理" "%NODE_FULL%" "%SCRIPT_DIR%agent.js"

echo.
echo 🎉 設定完成！anyGem 本機磁碟代理已在背景運行中。
echo    您可以到工作管理員 → 詳細資料，找到 node.exe 來確認。
echo    或訪問 http://localhost:3456/ping 測試是否正常運行。
echo.
pause
