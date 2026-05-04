/**
 * anyGem Backend v93.0 - 模組化精簡版 (Modular Core)
 * 1. doPost: Web/LINE 入口
 * 2. handleLineWebhook: LINE 邏輯
 * 3. handleSystemMode: UI 系統路由
 * 4. forceAuthSetup: 授權工具
 */

function doPost(e) {
    try {
        if (!e.postData || !e.postData.contents) throw new Error("無效請求");
        const payload = JSON.parse(e.postData.contents);
        
        if (payload.events && Array.isArray(payload.events)) {
            if (payload.events.length === 0 || (payload.events[0] && (payload.events[0].replyToken === '00000000000000000000000000000000' || payload.events[0].replyToken === 'ffffffffffffffffffffffffffffffff'))) {
                return ContentService.createTextOutput("OK");
            }
        }

        const { message, session_id, workspace, mode, old_text, target_text, target_role, file_data, mime_type, web_search, youtube_id, auto_image, draw_mode, gem_prompt, gem_model, selected_model } = payload;
        const ss = SpreadsheetApp.openById(BASE_CONFIG.SHEET_ID);
        const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
        const lineToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
        const CONFIG = { ...BASE_CONFIG, ...loadSettings(ss) };
        const db = new FirebaseClient();

        if (payload.events && Array.isArray(payload.events)) return handleLineWebhook(payload, ss, apiKey, lineToken, CONFIG, db);
        if (mode === 'system') return handleSystemMode(payload, ss, workspace, db);

        // 初始化對話紀錄與 Gem 角色
        let wsName = String(workspace || "Main_Workspace");
        let finalInstruction = getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES);
        if (gem_prompt) finalInstruction += `\n\n【💎 Gem 角色設定】\n${gem_prompt}`;

        let modelId = selected_model || gem_model || (file_data ? CONFIG.MODEL_EDITOR : CONFIG.MODEL_GATHERER) || "gemini-2.5-flash";
        const history = getOptimizedHistoryFB(db, wsName, session_id || "default");
        
        let finalMessage = message;
        if (youtube_id) {
            let transcript = fetchYouTubeTranscriptNative(youtube_id);
            if (transcript !== "無字幕") finalMessage = `【YouTube 逐字稿】\n${transcript}\n\n指令：${message}`;
        }

        let tools = draw_mode ? [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }] : (web_search ? [{ google_search: {} }] : AGENT_TOOLS);

        const result = runAutonomousAgentLoop({
            ss, apiKey, prompt: finalMessage, model: modelId,
            systemInstruction: finalInstruction, history, tools,
            imageData: file_data ? { mimeType: mime_type, data: file_data } : null,
            artistModel: CONFIG.MODEL_ARTIST || "gemini-3.1-flash-image-preview",
            configData: { ...CONFIG, autoImageEnabled: auto_image }
        });

        logToFirebaseAndCache(db, wsName, session_id || "default", message, result.reply);
        return response({ status: "success", reply: result.reply, model: result.model || modelId, image: result.image, mime: result.mime });
    } catch (err) { return response({ error: err.toString(), status: "error" }); }
}

function handleLineWebhook(payload, ss, apiKey, lineToken, CONFIG, db) {
    payload.events.forEach(event => {
        if (event.type !== 'message') return;
        const replyToken = event.replyToken;
        const session_id = "line_" + event.source.userId;
        const wsName = "LINE_Workspace";
        
        let userMessage = event.message.text || "請分析這張圖片";
        if (userMessage === '/clear' || userMessage === '新對話') {
            db.delete("sessions", session_id);
            CacheService.getScriptCache().remove(`history_${wsName}_${session_id}`);
            return sendMessageToLine(lineToken, replyToken, "✨ 已為您開啟新對話！");
        }

        const history = getOptimizedHistoryFB(db, wsName, session_id);
        const result = runAutonomousAgentLoop({
            ss, apiKey, prompt: userMessage, model: CONFIG.MODEL_LINE || "gemini-2.5-flash",
            systemInstruction: getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES),
            history, tools: AGENT_TOOLS, configData: CONFIG
        });

        logToFirebaseAndCache(db, wsName, session_id, userMessage, result.reply);
        sendMessageToLine(lineToken, replyToken, result.reply);
    });
    return ContentService.createTextOutput("OK");
}

function sendMessageToLine(token, replyToken, text) {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'post', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        payload: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] })
    });
}

function handleSystemMode(payload, ss, wsName, db) {
    const action = payload.action;
    if (action === 'get_session_list') {
        const list = db.querySessions(wsName).map(x => ({ id: x.session_id, title: x.customTitle || x.title, date: x.updated_at, pinned: x.pinned }));
        return response({ sessions: list });
    }
    if (action === 'load_session') return response({ logs: db.get("sessions", payload.session_id).history_json || [] });
    if (action === 'delete_session') { db.delete("sessions", payload.session_id); return response({status:"success"}); }
    return response({status: "error", message: "Unknown action"});
}

function forceAuthSetup() {
    SpreadsheetApp.getActiveSpreadsheet(); DriveApp.getRootFolder(); DocumentApp.create("Auth"); SlidesApp.create("Auth"); FormApp.create("Auth"); GmailApp.getInboxThreads(0,1); CalendarApp.getDefaultCalendar();
    console.log("✅ 授權完成");
}