---
name: cc-obsidian
description: Claude Code 連接 Obsidian MCPVault。說「連接 Obsidian」時載入。
---

# 連接 Obsidian（Claude Code 版）

1. 找 vault 路徑：搜尋含 `.obsidian` 子資料夾的目錄
2. `npm install -g @bitbonsai/mcpvault`
3. 用 `claude mcp add obsidian -- npx @bitbonsai/mcpvault <VAULT_PATH>` 或手動編輯 `~/.claude/settings.json`
4. 重啟後驗證讀寫

### 進階
若需全文檢索：安裝 Obsidian Local REST API plugin + `pip install cli-anything-hub && cli-hub install obsidian`

回報：vault 路徑、mcpvault 版本、讀取/寫入測試結果。
