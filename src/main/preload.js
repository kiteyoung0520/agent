const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    
    // History
    getHistory: () => ipcRenderer.invoke('get-history'),
    saveHistory: (history) => ipcRenderer.invoke('save-history', history),
    
    // Agents
    getAgents: () => ipcRenderer.invoke('get-agents'),
    saveAgents: (agents) => ipcRenderer.invoke('save-agents', agents),
    
    // Artifact Saving
    saveArtifact: (filename, content, type) => ipcRenderer.invoke('save-artifact', { filename, content, type }),
    
    // AI Providers
    getModels: () => ipcRenderer.invoke('get-models'),
    sendMessage: (params) => ipcRenderer.invoke('send-message', params),
    
    // Polyfill for old GAS fetch calls
    apiRequest: (payload) => ipcRenderer.invoke('api-request', payload),
    executeTool: (payload) => ipcRenderer.invoke('execute-tool', payload),
    
    // Google Drive
    googleLogin: () => ipcRenderer.invoke('google-login'),
    googleLogout: () => ipcRenderer.invoke('google-logout'),
    googleDriveList: (query) => ipcRenderer.invoke('google-drive-list', query),
    googleDriveRead: (fileId) => ipcRenderer.invoke('google-drive-read', fileId)
});
