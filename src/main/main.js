const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Create default save directory if it doesn't exist
const SAVE_DIR = 'D:\\AnyGem_Projects';
if (!fs.existsSync(SAVE_DIR)) {
    try {
        fs.mkdirSync(SAVE_DIR, { recursive: true });
    } catch (err) {
        console.error('Failed to create save directory:', err);
    }
}

// Ensure subdirectories exist
const subDirs = ['Images', 'Artifacts', 'Exports'];
subDirs.forEach(dir => {
    const dirPath = path.join(SAVE_DIR, dir);
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch (err) {
            console.error('Failed to create subdirectory:', err);
        }
    }
});

// App data directory for settings, history, agents
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');
const historyPath = path.join(userDataPath, 'history.json');
const agentsPath = path.join(userDataPath, 'agents.json');

// Initialize default JSON files if they don't exist
const initJSONFile = (filePath, defaultContent) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf-8');
    }
};

initJSONFile(settingsPath, { apiKeys: { gemini: '', openai: '', nvidia: '', openrouter: '' } });
initJSONFile(historyPath, { sessions: {} });
initJSONFile(agentsPath, { agents: [] });


function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolated: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    // Open DevTools for debugging (can be removed later)
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

// Settings
ipcMain.handle('get-settings', () => {
    try {
        const data = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return { apiKeys: {} };
    }
});

ipcMain.handle('save-settings', (event, settings) => {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// History
ipcMain.handle('get-history', () => {
    try {
        const data = fs.readFileSync(historyPath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return { sessions: {} };
    }
});

ipcMain.handle('save-history', (event, history) => {
    try {
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Agents
ipcMain.handle('get-agents', () => {
    try {
        const data = fs.readFileSync(agentsPath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return { agents: [] };
    }
});

ipcMain.handle('save-agents', (event, agents) => {
    try {
        fs.writeFileSync(agentsPath, JSON.stringify(agents, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

const { GeminiProvider, OpenAIProvider, NvidiaProvider, OpenRouterProvider } = require('./providers');

// File Saving
ipcMain.handle('save-artifact', (event, { filename, content, type }) => {
    try {
        let folder = 'Artifacts';
        if (type === 'image') folder = 'Images';
        else if (type === 'export') folder = 'Exports';
        
        const savePath = path.join(SAVE_DIR, folder, filename);
        if (type === 'image') {
            const base64Data = content.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(savePath, buffer);
        } else {
            fs.writeFileSync(savePath, content, 'utf-8');
        }
        return { success: true, path: savePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// AI Providers
function getProviders() {
    let settings = { apiKeys: {} };
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch (e) {}
    return {
        gemini: new GeminiProvider(settings.apiKeys.gemini),
        openai: new OpenAIProvider(settings.apiKeys.openai),
        nvidia: new NvidiaProvider(settings.apiKeys.nvidia),
        openrouter: new OpenRouterProvider(settings.apiKeys.openrouter)
    };
}

ipcMain.handle('get-models', async () => {
    const providers = getProviders();
    const allModels = [];
    for (const [key, provider] of Object.entries(providers)) {
        if (provider.apiKey) {
            const models = await provider.getModels();
            allModels.push(...models);
        }
    }
    return allModels;
});

ipcMain.handle('send-message', async (event, { provider, model, messages, systemInstruction, tools }) => {
    const providers = getProviders();
    if (!providers[provider]) return { error: `Provider ${provider} not found` };
    try {
        const response = await providers[provider].sendMessage({ model, messages, systemInstruction, tools });
        return { success: true, response };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Polyfill for old GAS API

const readHistory = () => { try { return JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch { return { sessions: {} }; } };
const writeHistory = (data) => fs.writeFileSync(historyPath, JSON.stringify(data, null, 2), 'utf-8');

const { exec } = require('child_process');

ipcMain.handle('execute-tool', async (event, payload) => {
    const { session_id, tool_call, result, error } = payload;
    const h = readHistory();
    const session = h.sessions[session_id];
    if (!session) return { error: 'Session not found' };

    let toolResponseText = result;
    if (!result && !error) {
        try {
            if (tool_call.name === 'execute_command') {
                toolResponseText = await new Promise((resolve) => {
                    exec(tool_call.args.command, { cwd: app.getPath('userData') }, (err, stdout, stderr) => {
                        resolve(stdout + (stderr ? '\nError:\n' + stderr : ''));
                    });
                });
            } else if (tool_call.name === 'read_file') {
                toolResponseText = fs.readFileSync(tool_call.args.path, 'utf-8');
            } else if (tool_call.name === 'write_file') {
                fs.writeFileSync(tool_call.args.path, tool_call.args.content, 'utf-8');
                toolResponseText = "File written successfully.";
            }
        } catch (e) {
            toolResponseText = "Error: " + e.message;
        }
    }

    if (error) toolResponseText = "User Rejected: " + error;

    session.messages.push({ role: 'tool_response', toolCallId: tool_call.id, parts: [{ text: toolResponseText }] });
    writeHistory(h);

    return { status: 'success' };
});

ipcMain.handle('api-request', async (event, payload) => {
    const { action, workspace, session_id } = payload;
    


    if (action === 'get_user_info') {
        return { email: 'local@anygem.app' };
    }
    
    if (action === 'get_workspaces') {
        // Just return a default local workspace for now
        return { workspaces: [{ id: 'local_ws', name: 'Local Workspace' }] };
    }
    
    if (action === 'get_session_list') {
        const h = readHistory();
        const sessions = Object.keys(h.sessions).map(k => ({
            id: k,
            title: h.sessions[k].title || '未命名對話',
            isPinned: h.sessions[k].isPinned || false,
            updatedAt: h.sessions[k].updatedAt || Date.now()
        })).sort((a, b) => b.updatedAt - a.updatedAt);
        return { sessions };
    }
    
    if (action === 'load_session') {
        const h = readHistory();
        if (h.sessions[session_id]) {
            return {
                status: 'success',
                session_id,
                history: h.sessions[session_id].messages || [],
                sources: h.sessions[session_id].sources || []
            };
        }
        return { status: 'error', message: 'Not found' };
    }
    
    if (action === 'get_gems') {
        const agents = JSON.parse(fs.readFileSync(agentsPath, 'utf-8')).agents || [];
        return { gems: agents };
    }
    
    if (action === 'get_models') {
        const allModels = [];
        for (const [providerName, provider] of Object.entries(providers)) {
            try {
                const models = await provider.getModels();
                allModels.push(...models);
            } catch (error) {
                console.error(`Failed to get models from ${providerName}:`, error);
            }
        }
        return { models: allModels.map(m => `${m.provider}:${m.id}`) };
    }

    // Chat Message handling
    if (!action) {
        const { message, session_id, selected_model, systemInstruction } = payload;
        const h = readHistory();
        if (!h.sessions[session_id]) {
            h.sessions[session_id] = { title: (message || "Tool Continuation").substring(0, 20) + '...', messages: [], updatedAt: Date.now() };
        }
        
        const session = h.sessions[session_id];
        if (message) {
            session.messages.push({ role: 'user', parts: [{ text: message }] });
        }
        
        let provider = 'gemini';
        let model = 'gemini-1.5-pro'; // fallback
        if (selected_model && selected_model.includes(':')) {
            [provider, model] = selected_model.split(':');
        }

        try {
            const providers = getProviders();
            if (!providers[provider]) throw new Error(`Provider ${provider} not configured`);
            
            const response = await providers[provider].sendMessage({
                model,
                messages: session.messages,
                systemInstruction: systemInstruction || payload.gem_prompt
            });
            
            
            // Extract Tool Call if any
            let toolCall = null;
            let replyText = '';

            if (provider === 'gemini') {
                const part = response.candidates[0].content.parts[0];
                if (part.functionCall) {
                    toolCall = { id: 'call_' + Date.now(), name: part.functionCall.name, args: part.functionCall.args };
                } else {
                    replyText = response.candidates[0].content.parts.map(p => p.text).join('\n');
                }
            } else {
                const msg = response.choices[0].message;
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    const tc = msg.tool_calls[0];
                    toolCall = { id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments) };
                } else {
                    replyText = msg.content;
                }
            }

            if (toolCall) {
                session.messages.push({ role: 'model', toolCall: toolCall });
                writeHistory(h);
                return { status: 'tool_call', pending_tool_call: toolCall };
            }

            session.messages.push({ role: 'model', parts: [{ text: replyText }] });

            session.updatedAt = Date.now();
            writeHistory(h);
            
            return { status: 'success', reply: replyText };
        } catch (e) {
            console.error('Send message error:', e);
            return { status: 'error', error: e.message };
        }
    }

    // Default response for unhandled actions to prevent crash
    return { status: 'success', message: 'Mocked locally' };
});

// Google Drive Integration
const googleAuthManager = require('./google_auth');

// Initialize Google Auth on start
const gSettings = getProviders(); // Wait, we need to read raw settings
let rawSettings = { googleClientId: '', googleClientSecret: '', googleTokens: null, googleUser: null };
try { 
    rawSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); 
    if(rawSettings.googleClientId && rawSettings.googleClientSecret) {
        googleAuthManager.init(rawSettings.googleClientId, rawSettings.googleClientSecret);
        if (rawSettings.googleTokens) {
            googleAuthManager.setCredentials(rawSettings.googleTokens);
        }
    }
} catch (e) {}

ipcMain.handle('google-login', async () => {
    try {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (!s.googleClientId || !s.googleClientSecret) {
            return { success: false, error: '請先在設定中填入 Google Client ID 與 Secret' };
        }
        
        googleAuthManager.init(s.googleClientId, s.googleClientSecret);
        const { tokens, user } = await googleAuthManager.login();
        
        // Save tokens
        s.googleTokens = tokens;
        s.googleUser = user;
        fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8');
        
        return { success: true, user };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('google-logout', async () => {
    try {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        s.googleTokens = null;
        s.googleUser = null;
        fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8');
        
        // Reset auth manager credentials
        googleAuthManager.oauth2Client?.setCredentials(null);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('google-drive-list', async (event, query) => {
    try {
        const files = await googleAuthManager.listFiles(query || "trashed=false");
        return { success: true, files };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('google-drive-read', async (event, fileId) => {
    try {
        const text = await googleAuthManager.readFileText(fileId);
        return { success: true, text };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

