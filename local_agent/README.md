# anyGem 本機磁碟代理 (Local Disk Agent)

讓 anyGem AI 助理能夠搜尋、讀取、整理您電腦上的本地檔案，並執行終端機指令。

---

## 🚀 一鍵安裝（推薦）

```bash
# 1. 安裝 Node.js（如尚未安裝）
#    下載: https://nodejs.org/ (建議 LTS 版本)

# 2. 一鍵安裝
node setup.js
```

安裝腳本會自動：
- ✅ 掃描本機所有可用磁碟（含容量資訊）
- ✅ 尋找可用 Port（預設 3456，被佔用會自動遞補）
- ✅ 產出客製化 `config.json`
- ✅ 註冊 Windows 開機自動啟動（需管理員權限）
- ✅ 啟動本機代理

### 自訂安裝參數

```bash
# 指定根目錄
node setup.js --roots=D:,E:

# 指定 Port
node setup.js --port=8080

# 僅啟動代理（不重新安裝）
node setup.js --start-only

# 解除安裝
node setup.js --uninstall

# 跳過工作排程（如無管理員權限）
node setup.js --no-task
```

---

## 🔧 手動安裝

### 1. 啟動代理

```bash
node agent.js
```

### 2. 設定開機自動啟動（需系統管理員）

雙擊 `setup_autostart.bat`，或以系統管理員身分執行：

```bash
# 在命令提示字元（系統管理員）中執行
setup_autostart.bat
```

### 3. 驗證是否成功

```
http://localhost:3456/ping
→ {"status":"ok","version":"1.0.0","allowed_roots":["D:\\"]}
```

---

## 📡 連接前端

安裝完成後，開啟瀏覽器前往：

**[https://kiteyoung0520.github.io/agent/](https://kiteyoung0520.github.io/agent/)**

前端會自動掃描 `localhost:3456~3465` 尋找本機代理，右下角「本機」指示燈會顯示綠色連線狀態。

---

## 📂 功能對照

| 功能 | API Action | 指令範例 |
|------|-----------|---------|
| 磁碟資訊 | `disk_info` | 取得所有磁碟容量與使用率 |
| 目錄瀏覽 | `list` | 列出 D:\ 根目錄內容 |
| 檔案搜尋 | `search` | 搜尋含「報告」的檔案 |
| 讀取檔案 | `read` | 讀取 config.json 內容 |
| 寫入檔案 | `write_file` | 寫入新檔案到指定路徑 |
| 檔案整理 | `organize` | 移動/複製/重新命名/刪除 |
| 執行指令 | `run_command` | 執行 npm install |
| Docker 沙盒 | `docker_run_command` | 在安全容器中執行指令 |

---

## ⚙️ 設定檔 (config.json)

```json
{
  "allowed_roots": ["D:\\", "E:\\"],
  "port": 3456,
  "max_file_size_kb": 512,
  "allowed_extensions": [".txt", ".md", ".json", ".js", ".gs", ...],
  "deny_patterns": ["node_modules", ".git", "Windows", ...],
  "install_info": { "installed_at": "...", "hostname": "..." }
}
```

---

## 🗑️ 解除安裝

```bash
node setup.js --uninstall
```

或手動：
1. 刪除工作排程：`schtasks /delete /tn "anyGem_LocalAgent" /f`
2. 終止程序：`taskkill /F /IM node.exe`（請確認無其他 Node.js 程序）
3. 刪除 `local_agent\` 資料夾