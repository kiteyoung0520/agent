---
name: cc-workspace
description: Claude Code 老師建專案工作模式。說「初始化班級工具」「老師建專案」時載入。
---

# 老師建專案工作模式（Claude Code 版）

## 初始化
1. 問：專案名稱、用途、資料夾、GitHub repo（公開/私有）、部署需求
2. 建立：CLAUDE.md、README.md、.gitignore、Git repo、GitHub repo、Obsidian 工作筆記
3. 安裝或確認 Claude Code 專用收工流程，不要套用 OpenCode 的 `07-workflow-skills`

## 開工/收工
開工：讀 CLAUDE.md → 讀 Obsidian 工作筆記 → git status → 回報下一步
收工：檢查敏感資料 → 更新筆記 → git commit/push → chezmoi 同步

回報：已建立的檔案清單、GitHub repo URL、Obsidian 筆記路徑。
