---
name: cc-ollama
description: Claude Code 安裝本地 AI Ollama。說「安裝 Ollama」「本地 AI」時載入。
---

# 安裝本地 AI Ollama（Claude Code 版）

1. 下載安裝：https://ollama.com/download
2. `ollama --version`
3. 拉取模型：`ollama pull llama3.2:latest` 或 `ollama pull gemma3:latest`
4. 如需 GPU 加速確認：`ollama run llama3.2:latest "hello"`

## 可選：加入 Claude Code MCP
若想讓 Claude 呼叫本地模型：
```json
"mcpServers": { "ollama": { "command": "npx", "args": ["-y", "@ollama/mcp-server"] } }
```

回報：Ollama 版本、模型清單、GPU 狀態。
