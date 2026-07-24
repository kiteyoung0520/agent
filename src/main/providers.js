const axios = require('axios');

class AIProvider {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async getModels() { return []; }
    async sendMessage(params) { throw new Error('Not implemented'); }
}


const anygemToolsGemini = [{
    functionDeclarations: [
        {
            name: "execute_command",
            description: "在使用者的電腦上執行終端機指令 (Terminal Command)，例如安裝套件、編譯程式、git 操作等。請確保指令的安全與正確性。",
            parameters: {
                type: "OBJECT",
                properties: { command: { type: "STRING", description: "要執行的 CMD 或 PowerShell 指令" } },
                required: ["command"]
            }
        },
        {
            name: "read_file",
            description: "讀取使用者電腦上指定路徑的檔案內容。",
            parameters: {
                type: "OBJECT",
                properties: { path: { type: "STRING", description: "檔案絕對路徑" } },
                required: ["path"]
            }
        },
        {
            name: "write_file",
            description: "建立或修改使用者電腦上指定路徑的檔案。",
            parameters: {
                type: "OBJECT",
                properties: { 
                    path: { type: "STRING", description: "檔案絕對路徑" },
                    content: { type: "STRING", description: "要寫入的檔案內容" }
                },
                required: ["path", "content"]
            }
        }
    ]
}];


const anygemToolsOpenAI = [
    {
        type: "function",
        function: {
            name: "execute_command",
            description: "在使用者的電腦上執行終端機指令 (Terminal Command)，例如安裝套件、編譯程式、git 操作等。",
            parameters: {
                type: "object",
                properties: { command: { type: "string", description: "要執行的 CMD 或 PowerShell 指令" } },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "讀取使用者電腦上指定路徑的檔案內容。",
            parameters: {
                type: "object",
                properties: { path: { type: "string", description: "檔案絕對路徑" } },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "建立或修改使用者電腦上指定路徑的檔案。",
            parameters: {
                type: "object",
                properties: { 
                    path: { type: "string", description: "檔案絕對路徑" },
                    content: { type: "string", description: "要寫入的檔案內容" }
                },
                required: ["path", "content"]
            }
        }
    }
];




class GeminiProvider extends AIProvider {
    async getModels() {
        if (!this.apiKey) return [];
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
            const res = await axios.get(url);
            return res.data.models
                .filter(m => m.name.includes('gemini') && (m.supportedGenerationMethods.includes('generateContent') || m.supportedGenerationMethods.includes('generateMessage')))
                .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name, provider: 'gemini' }));
        } catch (e) {
            console.error('Gemini getModels error:', e.message);
            return [];
        }
    }
    
    // Minimal implementation for sending message, needs full integration with AnyGem format
    async sendMessage({ model, messages, systemInstruction, tools }) {
        if (!this.apiKey) throw new Error('Gemini API Key missing');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const payload = {
            contents: messages.map(msg => {
                if (msg.role === 'tool_response') {
                    return { role: 'function', parts: [{ functionResponse: { name: 'any', response: { result: msg.parts[0].text } } }] };
                } else if (msg.role === 'model' && msg.toolCall) {
                    return { role: 'model', parts: [{ functionCall: { name: msg.toolCall.name, args: msg.toolCall.args } }] };
                }
                return msg;
            }),
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            tools: anygemToolsGemini
        };
        const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        return res.data;
    }
}

class OpenAIProvider extends AIProvider {
    async getModels() {
        if (!this.apiKey) return [];
        try {
            const res = await axios.get('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            return res.data.data
                .filter(m => m.id.includes('gpt'))
                .map(m => ({ id: m.id, name: m.id, provider: 'openai' }));
        } catch (e) {
            console.error('OpenAI getModels error:', e.message);
            return [];
        }
    }

    async sendMessage({ model, messages, systemInstruction, tools }) {
        if (!this.apiKey) throw new Error('OpenAI API Key missing');
        const formattedMessages = [];
        // Map AnyGem tool call responses to OpenAI format if any
        messages.forEach(msg => {
            if (msg.role === 'tool_response') {
                formattedMessages.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.parts[0].text });
            } else if (msg.role === 'model' && msg.toolCall) {
                formattedMessages.push({ role: 'assistant', tool_calls: [{ id: msg.toolCall.id, type: 'function', function: { name: msg.toolCall.name, arguments: JSON.stringify(msg.toolCall.args) } }] });
            }
        });
        // Map AnyGem tool call responses to OpenAI format if any
        messages.forEach(msg => {
            if (msg.role === 'tool_response') {
                formattedMessages.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.parts[0].text });
            } else if (msg.role === 'model' && msg.toolCall) {
                formattedMessages.push({ role: 'assistant', tool_calls: [{ id: msg.toolCall.id, type: 'function', function: { name: msg.toolCall.name, arguments: JSON.stringify(msg.toolCall.args) } }] });
            }
        });
        if (systemInstruction) formattedMessages.push({ role: 'system', content: systemInstruction });
        
        // Basic mapping from Gemini format to OpenAI format
        messages.forEach(msg => {
            const content = msg.parts.map(p => p.text).join('\n');
            formattedMessages.push({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: content
            });
        });

        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: model,
            messages: formattedMessages,
            tools: anygemToolsOpenAI
        }, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        return res.data;
    }
}

class NvidiaProvider extends AIProvider {
    async getModels() {
        if (!this.apiKey) return [];
        try {
            // Using Nvidia NIM / API endpoints (assuming standard OpenAI compatible endpoint)
            const res = await axios.get('https://integrate.api.nvidia.com/v1/models', {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            return res.data.data.map(m => ({ id: m.id, name: m.id, provider: 'nvidia' }));
        } catch (e) {
            console.error('Nvidia getModels error:', e.message);
            return [];
        }
    }
    async sendMessage({ model, messages, systemInstruction, tools }) {
        // Similar to OpenAI format
        if (!this.apiKey) throw new Error('Nvidia API Key missing');
        const formattedMessages = [];
        if (systemInstruction) formattedMessages.push({ role: 'system', content: systemInstruction });
        messages.forEach(msg => {
            const content = msg.parts.map(p => p.text).join('\n');
            formattedMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: content });
        });

        const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
            model: model,
            messages: formattedMessages,
            max_tokens: 1024
        }, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        return res.data;
    }
}

class OpenRouterProvider extends AIProvider {
    async getModels() {
        if (!this.apiKey) return [];
        try {
            const res = await axios.get('https://openrouter.ai/api/v1/models');
            return res.data.data.map(m => ({ id: m.id, name: m.name, provider: 'openrouter' }));
        } catch (e) {
            console.error('OpenRouter getModels error:', e.message);
            return [];
        }
    }
    
    async sendMessage({ model, messages, systemInstruction, tools }) {
        if (!this.apiKey) throw new Error('OpenRouter API Key missing');
        const formattedMessages = [];
        if (systemInstruction) formattedMessages.push({ role: 'system', content: systemInstruction });
        messages.forEach(msg => {
            const content = msg.parts.map(p => p.text).join('\n');
            formattedMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: content });
        });

        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: model,
            messages: formattedMessages
        }, {
            headers: { 'Authorization': `Bearer ${this.apiKey}`, 'HTTP-Referer': 'http://localhost', 'X-Title': 'AnyGem' }
        });
        return res.data;
    }
}

module.exports = {
    GeminiProvider,
    OpenAIProvider,
    NvidiaProvider,
    OpenRouterProvider
};
