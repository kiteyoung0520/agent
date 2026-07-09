---
name: cc-firebase
description: Claude Code 連接 Firebase MCP。說「連接 Firebase」時載入。
---

# 連接 Firebase（Claude Code 版）

1. `npm install -g firebase-tools` → `firebase login`
2. 在專案目錄 `firebase init`
3. 用 `claude mcp add firebase -- npx -y firebase-tools@latest mcp` 或手動編輯 `~/.claude/settings.json`
4. 重啟後驗證：列出專案

⚠️ Admin SDK 憑證不可公開，學生資料只存代號。
