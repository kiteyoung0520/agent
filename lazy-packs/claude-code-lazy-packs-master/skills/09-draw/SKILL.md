---
name: cc-draw
description: Claude Code 安裝 gpt-image-2 生圖 skill。說「安裝生圖」「畫圖」「生圖」時載入。
---

# 生圖技能安裝（Claude Code 版）

## 前置需求
1. OpenAI API Key：https://platform.openai.com/api-keys
2. Organization Individual 驗證：platform.openai.com/settings/organization/general
3. Billing 儲值（最低 US$5）：platform.openai.com → Billing

## 安裝

### 1. 安裝 Python openai 套件
```bash
pip install openai
```

### 2. 儲存 API Key
```bash
# 建立 ~/.openai.env
echo "OPENAI_API_KEY=sk-proj-你的key" > ~/.openai.env
```

### 3. 安裝 draw skill
```bash
npx skills add mathruffian-dot/claude-code-lazy-packs --skill 09-draw -g -y
```
確認 `~/.claude/skills/draw/draw.py` 或 `~/.claude/skills/09-draw/draw.py` 存在；不要從 OpenCode 的 `~/.config/opencode/skills/` 混用。

### 4. 測試
```bash
python ~/.claude/skills/draw/draw.py "一隻橘貓坐在窗邊，水彩風格" --name test --quality low
```

## 品質與費用
| 等級 | 適用 |
|------|------|
| low | 99% 情境（預設）|
| medium | low 明顯不夠時 |
| high | 印刷品 |

實際費用以 OpenAI 官方 pricing 為準，不在 skill 裡寫死金額。

安裝後在任何專案對 Claude 說「畫一張 XX」就會自動生圖。

回報：API key 狀態、draw skill 已安裝、測試生圖結果。
