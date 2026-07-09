---
name: cc-github
description: Claude Code 連接 GitHub CLI。說「連接 GitHub」時載入。
---

# 連接 GitHub（Claude Code 版）

1. `git --version && gh --version`
2. `gh auth login --web --git-protocol https`
3. `git config --global user.name "你的名字"` + `git config --global user.email "..."`
4. 建立測試 repo → commit → push，成功後詢問保留或刪除。

回報：Git/GitHub CLI 版本、登入狀態、使用者資訊、測試結果。
