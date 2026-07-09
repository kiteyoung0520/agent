---
title: 'Claude Code 懶人包 #01：連接 NotebookLM（支援 opencode）'
date: '2026-06-10'
type: 懶人包
version: v0.3
status: 加入 opencode 支援
tags:
  - Claude-Code
  - opencode
  - 懶人包
  - NotebookLM
  - MCP
video: EP03
---
# Claude Code / opencode 懶人包 #01：連接 Google NotebookLM

> 版本：v0.3（加入 opencode 支援、路徑陷阱警告）
> 更新日期：2026-06-10
> 對應影片：Claude基本功 EP03

> 📌 **本懶人包可獨立執行**：會自動檢查並安裝所需工具，不需要先看過其他懶人包。你只要確認下方「先備條件」即可開始。

---

## 這個懶人包會幫你做什麼？

讓你的 Claude Code 或 opencode 能夠直接操控 Google NotebookLM，包括：
- 建立 notebook、上傳資料來源
- 產生教學簡報（Slide Deck）
- 產生資訊圖表（Infographic）
- 所有成品自動下載到電腦裡的指定資料夾

---

## 原理說明：這個懶人包在做什麼？

**三角關係圖**：

```
Claude Code / opencode ←(MCP 協定)→ nlm (翻譯官) ←(Google 登入)→ NotebookLM
```

這個懶人包會在你的電腦裡裝一個叫 `nlm` 的「翻譯官」，讓 AI agent 能透過它去操控 NotebookLM。

- **為什麼需要翻譯官？**
  NotebookLM 沒有官方 API，Google 沒開放程式直接呼叫。`nlm` 是用「模擬瀏覽器操作」的方式，假裝是你在點網頁。

- **什麼是 MCP？**
  MCP（Model Context Protocol）是 AI agent 跟外部工具溝通的標準接口，就像手機的 USB-C——只要工具支援 MCP，agent 就能插上去用。

- **為什麼要登入 Google？**
  `nlm` 需要你的 Google 通行證，才能幫你去操作 NotebookLM。

**一句話記住**：你跟 agent 講中文，agent 叫 `nlm` 去幫你點 NotebookLM 的網頁，成品自動下載到你電腦的資料夾。

---

## 先備條件

在使用這個懶人包之前，請確認：

- [ ] Claude Code 或 opencode 已安裝且能正常使用
- [ ] 你有 Google 帳號（用來登入 NotebookLM）
- [ ] 電腦有網路連線

---

## 安裝方式二選一

`notebooklm-mcp-cli` 支援兩種安裝方式，擇一即可：

**方式 A：uv（獨立環境，推薦）**
```bash
uv tool install notebooklm-mcp-cli
```

**方式 B：pip（全域安裝）**
```bash
pip install notebooklm-mcp-cli
```

> ✅ 目前本機驗證：v0.6.11 在 Python 3.14 + pip 環境下運作正常。
> 裝完後用 `nlm --version` 確認可用。

---

## 請 Agent 幫我執行以下步驟

> ⚠️ 以下內容是給 AI agent 讀的操作指令。
> 你只需要把這整份 MD 檔丟給 Claude Code 桌面版的 Code 分頁（或 opencode），它會自動開始執行。
> 遇到需要你手動操作的地方，它會暫停並告訴你該怎麼做。
>
> **所有安裝與設定都在 agent 內完成，不需要另外打開 PowerShell 或命令提示字元。**
> 如果 agent 無法執行某個指令，才會引導你到終端機操作。

---

### 步驟零：環境檢查

> 請在開始安裝前，先自動確認以下所有項目。
> 如果有任何一項不符合，請先告知使用者問題所在，並引導解決後再繼續。
> **不要跳過任何一項檢查，不要假設環境正常。**

1. **確認作業系統**：執行系統指令確認是 Windows / macOS / Linux，後續所有指令請根據實際的作業系統選擇正確版本執行
2. **檢查 Git 是否已安裝**：執行 `git --version`，如果未安裝：
   - Windows：`winget install --id Git.Git --accept-source-agreements --accept-package-agreements`
   - macOS：`xcode-select --install`
   - Linux：`sudo apt update && sudo apt install git -y`
3. **確認 uv 或 pip 可用**：執行 `uv --version` 或 `pip --version`，如果都沒安裝，步驟一會自動安裝 uv
4. **確認網路連線正常**：嘗試 ping 一個外部網站

> 全部通過後，告知使用者：「環境檢查完成，所有條件都符合，開始安裝。」
> 如果有不通過的項目，列出問題清單並逐一引導解決。

---

### 步驟一：安裝 NotebookLM MCP CLI 工具

如果步驟零確認 `uv` 尚未安裝，請先安裝 uv：

**Windows（PowerShell）**：
```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**macOS / Linux**：
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

安裝 NotebookLM MCP CLI（擇一）：

```bash
uv tool install notebooklm-mcp-cli
# 或
pip install notebooklm-mcp-cli
```

安裝完成後，確認指令可用：

```bash
nlm --version
```

> 如果出現 `nlm: command not found`，請重開終端機再試一次。
> 如果仍然失敗，請告知使用者可能需要手動將 uv/pip 的路徑加入系統 PATH。

---

### 步驟二：登入 Google 帳號

請執行以下指令，會自動開啟瀏覽器讓使用者登入 Google：

```bash
nlm login
```

> 🖐️ **需要手動操作**：瀏覽器會開啟 Google 登入頁面，請使用者登入他的 Google 帳號。登入成功後，CLI 會自動擷取認證資訊。

登入成功後，確認狀態：

```bash
nlm doctor
```

> 如果 `nlm doctor` 顯示未認證，請重新執行 `nlm login`。
> 如果瀏覽器沒有自動開啟，請手動開啟瀏覽器到 Google 登入頁面，登入後再回到終端機。
> 認證儲存位置：`~\.notebooklm-mcp-cli\profiles\default\`

---

### 步驟三：設定 MCP 連接

依照你使用的 agent 選擇對應的設定方式：

#### 給 Claude Code 使用者

```bash
nlm setup add claude-code
```

#### 給 opencode 使用者

`nlm setup` 目前未內建 opencode 支援，需手動編輯 `opencode.json`（位於 `~\.config\opencode\`）。

請 Agent 幫你檢查 opencode 設定檔：

```bash
cat ~/.config/opencode/opencode.json
```

在 `mcp` 區塊中加入（或修正）以下設定：

```json
"notebooklm": {
  "type": "local",
  "command": ["<pip/uv 的 notebooklm-mcp.exe 完整路徑>", "--transport", "stdio"],
  "enabled": true
}
```

> ⚠️ **重要：路徑陷阱！**
> 有些電腦上可能同時存在兩個 `notebooklm-mcp.exe`：
> - ✅ **正確**：pip 安裝的，位於 `Python314\Scripts\notebooklm-mcp.exe`（或 uv 的 bin 目錄）
> - ❌ **錯誤**：獨立的 `.local\bin\notebooklm-mcp.EXE`，此為 PyInstaller 打包的獨立執行檔，**已損壞**，會報 `ModuleNotFoundError: No module named 'notebooklm_tools'`
>
> 請務必使用 pip 或 uv 安裝的路徑。如果不確定正確路徑，用以下指令查詢：
> ```bash
> pip show notebooklm-mcp-cli -f | grep notebooklm-mcp
> # 或
> where notebooklm-mcp.exe   (Windows)
> which notebooklm-mcp       (macOS/Linux)
> ```

設定完成後，確認：

```bash
nlm setup list
```

> 應該能看到目前 agent 的設定狀態。

---

### 步驟四：建立本地資料夾

請根據使用者的作業系統，在文件資料夾下建立以下目錄結構：

```
Documents/
  └── NotebookLM/
      ├── slides/          ← 簡報（Slide Deck，可匯出 .pptx）
      ├── infographics/    ← 資訊圖表（多種風格可選）
      ├── audio/           ← 音訊概覽（Audio Overview）
      ├── video/           ← 影片概覽（Video Overview，含 Cinematic / Explainer / Brief）
      ├── docs/            ← Google 文件匯出（Reports、Notes 等）
      ├── sheets/          ← Google 試算表匯出（Data Tables）
      ├── mindmaps/        ← 心智圖（Mind Map）
      └── quizzes/         ← 測驗與閃卡（Quiz、Flashcards）
```

建立完成後，告知使用者資料夾的完整路徑。

---

### 步驟五：重啟 Agent 並驗證連接

> 🖐️ **需要手動操作**：請使用者完全關閉 Claude Code / opencode，然後重新開啟。

重新開啟後，測試 NotebookLM 連接是否成功：
1. 嘗試列出使用者的 NotebookLM 筆記本清單
2. 如果成功顯示清單（即使是空的），代表連接成功

---

### 步驟六：功能測試

連接成功後，請執行一個簡單的測試：
1. 在 NotebookLM 中建立一個新的 notebook，名稱為「測試筆記本」
2. 確認建立成功
3. 建立成功後，刪除這個測試筆記本
4. 告知使用者：「✅ 全部完成！你的 AI agent 已成功連接 NotebookLM。」

---

## 完成！接下來你可以這樣用

連接成功後，你隨時可以在 agent 裡用自然語言操控 NotebookLM：

| 你說的話 | NotebookLM 會做的事 | 存放位置 |
|----------|-------------------|---------|
| 「幫我用這份 PDF 建一個 notebook」 | 建立 notebook + 上傳 PDF 作為資料來源 | — |
| 「幫我產生教學簡報」 | 生成 Slide Deck（可匯出 .pptx） | slides/ |
| 「幫我做一張資訊圖表」 | 生成 Infographic（多種風格可選） | infographics/ |
| 「幫我產生音訊概覽（Podcast）」 | 生成 Audio Overview | audio/ |
| 「幫我產生影片概覽」 | 生成 Video Overview（Cinematic / Explainer / Brief） | video/ |
| 「幫我產生報告並匯出成文件」 | 生成 Report，匯出為 Google Docs | docs/ |
| 「幫我做數據表格並匯出試算表」 | 生成 Data Table，匯出為 Google Sheets | sheets/ |
| 「幫我產生心智圖」 | 生成 Mind Map | mindmaps/ |
| 「幫我出測驗題 / 閃卡」 | 生成 Quiz / Flashcards | quizzes/ |

---

## 如果安裝失敗，如何重來

> 如果執行過程中遇到錯誤，不用緊張。
> 對 Agent 說以下這段話，它會幫你清除之前的設定，從頭再來：

**請對 Agent 說：**
「上次 NotebookLM 懶人包執行失敗了，幫我清除之前的設定，重新跑一次。」

**Agent 會自動執行以下復原步驟：**

1. Claude Code：`nlm setup remove claude-code`
   opencode：手動從 `opencode.json` 的 `mcp` 區塊移除 `notebooklm` 項目
2. 移除 notebooklm-mcp-cli：`pip uninstall notebooklm-mcp-cli`（或 `uv tool uninstall notebooklm-mcp-cli`）
3. 清除登入狀態：`nlm logout`（或直接刪除 `~\.notebooklm-mcp-cli\` 目錄）
4. 確認環境乾淨後，從步驟零重新開始

---

## 常見問題

| 問題 | 解法 |
|------|------|
| `nlm: command not found` | 重開終端機，或確認 uv/pip 安裝路徑已加入 PATH |
| `uv: command not found` | Windows 需重開 PowerShell；macOS/Linux 需執行 `source ~/.bashrc` 或 `source ~/.zshrc` |
| 登入後 `nlm doctor` 顯示未認證 | 重新執行 `nlm login`，確認瀏覽器登入成功 |
| 瀏覽器沒有自動開啟 | 手動開啟瀏覽器登入 Google，或嘗試 `nlm login --manual` |
| Claude Code 看不到 NotebookLM 工具 | 確認有執行 `nlm setup add claude-code`，並完全關閉再重啟 Claude Code |
| opencode 看不到 NotebookLM 工具 | 檢查 `opencode.json` 中 `mcp.notebooklm.command` 路徑是否指向正確的 `notebooklm-mcp.exe`（見步驟三之「路徑陷阱」）|
| `ModuleNotFoundError: No module named 'notebooklm_tools'` | ❌ 你用的是 `.local\bin\` 中損壞的獨立 exe！改用 pip 安裝的版本（見步驟三之「路徑陷阱」）|
| Windows 上指令格式錯誤 | 確認使用 PowerShell 而非 CMD，或改用 Git Bash |
| `nlm setup list` 在 Windows 顯示亂碼 | 這是已知的 cp950 編碼問題，不影響功能 |

---

## 更新紀錄

| 日期 | 版本 | 更新內容 |
|------|------|---------|
| 2026-04-04 | v0.1 | 初版，根據官方文件建立基本流程 |
| 2026-04-04 | v0.2 | 加入環境檢查、復原機制、跨平台支援、常見問題擴充 |
| 2026-06-10 | v0.3 | 加入 opencode 支援、pip 安裝方式、`.local\bin` 路徑陷阱警告、`nlm setup list` 編碼問題說明、版本更新至 v0.6.11 |

---

## 相關連結

- [notebooklm-mcp-cli GitHub](https://github.com/jacob-bd/notebooklm-mcp-cli)
- [NotebookLM Downloader MCP](https://lobehub.com/mcp/pmane-notebooklm-downloader)
- [[Claude基本功EP03 - 懶人包先備工作]]
- [[README|Claude Code 懶人包索引]]
