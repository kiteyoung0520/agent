---
name: cc-gemini
description: Claude Code 設定 Gemini 免費 API。說「設定 Gemini」「Gemini API」時載入。
---

# 設定 Gemini 免費 API（Claude Code 版）

1. 到 https://aistudio.google.com/apikey 建立免費 API key
2. 存到 `~/.gemini.env`：`GEMINI_API_KEY=你的key`
3. 若要在 Claude 中使用，可透過 Skill 腳本呼叫

## 測試
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

⚠️ Gemini API key 在 AI Studio 建立，不需信用卡。
