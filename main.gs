// === Model Auto-Detection System ===
// 自動偵測 API Key 可用的 Gemini 模型，避免使用已停用/不存在的模型名稱
const ModelResolver = (function() {
  let cache = {};
  let lastFetch = 0;
  const CACHE_TTL = 3600000;

  function getApiKey() {
    try {
      return CONFIG?.GEMINI_API_KEY ||
             PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    } catch(e) { return null; }
  }

  function fetchModels() {
    const apiKey = getApiKey();
    if (!apiKey) return {};
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, timeout: 10 });
      const data = JSON.parse(resp.getContentText());
      if (!data.models) return {};
      const names = data.models.map(m => m.name.replace('models/', ''));
      // 依能力分級：找最新穩定版，降級備援
      const findBest = (patterns) => {
        for (const p of patterns) {
          const found = names.find(m => p.test(m));
          if (found) return found;
        }
        return 'gemini-2.0-flash';
      };
      return {
        all: names,
        flash: findBest([/gemini-2\.5-flash/i, /gemini-2\.0-flash/i, /gemini-1\.5-flash/i]),
        pro:   findBest([/gemini-2\.5-pro/i, /gemini-2\.0-flash/i]),
        lite:  findBest([/flash-lite/i, /gemini-2\.0-flash/i]),
        image: findBest([/imagen/i, /gemini-2\.5-flash/i, /gemini-2\.0-flash/i]),
        supported: names.filter(m => /^gemini-/i.test(m) || /^imagen/i.test(m)).sort()
      };
    } catch(e) {
      console.error('ModelResolver fetchModels 失敗:', e.message);
      return {};
    }
  }

  function ensureCache() {
    if (!lastFetch || Date.now() - lastFetch > CACHE_TTL) {
      cache = fetchModels();
      lastFetch = Date.now();
    }
    return cache;
  }

  return {
    getModel(type = 'flash') {
      const c = ensureCache();
      return c[type] || 'gemini-2.0-flash';
    },
    getAllSupported() {
      return ensureCache().supported || ['gemini-2.0-flash'];
    },
    getModelListForUI() {
      const c = ensureCache();
      const supported = c.supported || ['gemini-2.0-flash', 'gemini-2.5-flash'];
      // 按家族分組
      const result = [];
      const seen = new Set();
      supported.forEach(m => {
        if (seen.has(m)) return;
        seen.add(m);
        const label = m.replace(/^gemini-/i, '').replace(/-/g, ' ').replace(/(^\w|\s\w)/g, s => s.toUpperCase());
        result.push({ name: `✨ ${label}`, id: m });
      });
      if (result.length === 0) {
        return [
          {name: '⚡ Flash 2.0', id: 'gemini-2.0-flash'},
          {name: '🚀 Flash 2.5', id: 'gemini-2.5-flash'}
        ];
      }
      return result;
    },
    forceRefresh() {
      lastFetch = 0;
      return this.getModel('flash');
    }
  };
})();

function doGet(e) {
    if (e.parameter && e.parameter.action === 'search_sheet_models') {
        try {
            const props = PropertiesService.getScriptProperties().getProperties();
            const sheetId = props['SHEET_ID'] || "1b9Ge4uVe21kgPGVIqt0BTmd_8yPIfxWqazDIxnaSvKw";
            const ss = SpreadsheetApp.openById(sheetId);
            const found = [];
            const sheetsToSearch = ["setting", "Models", "Gems"];
            sheetsToSearch.forEach(name => {
                const sh = ss.getSheetByName(name);
                if (!sh) return;
                const data = sh.getDataRange().getValues();
                found.push({ sheet: name, rows: data });
            });
            return ContentService.createTextOutput(JSON.stringify(found, null, 2)).setMimeType(ContentService.MimeType.JSON);
        } catch(err) {
            return ContentService.createTextOutput(err.toString()).setMimeType(ContentService.MimeType.TEXT);
        }
    }

    if (e.parameter && e.parameter.action === 'search_sheet_keys') {
        try {
            const props = PropertiesService.getScriptProperties().getProperties();
            const sheetId = props['SHEET_ID'] || "1b9Ge4uVe21kgPGVIqt0BTmd_8yPIfxWqazDIxnaSvKw";
            const ss = SpreadsheetApp.openById(sheetId);
            const sheets = ss.getSheets();
            const foundKeys = [];
            sheets.forEach(sh => {
                const name = sh.getName();
                if (name.startsWith("_db_")) return;
                const data = sh.getDataRange().getValues();
                for (let r = 0; r < data.length; r++) {
                    for (let c = 0; c < data[r].length; c++) {
                        const val = String(data[r][c]).trim();
                        if (val.startsWith("AIzaSy")) {
                            foundKeys.push({ sheet: name, cell: `Row ${r+1}, Col ${c+1}`, key: val });
                        }
                    }
                }
            });
            return ContentService.createTextOutput(JSON.stringify(foundKeys, null, 2)).setMimeType(ContentService.MimeType.JSON);
        } catch(err) {
            return ContentService.createTextOutput(err.toString()).setMimeType(ContentService.MimeType.TEXT);
        }
    }

    if (e.parameter && e.parameter.action === 'get_all_gemini_keys') {
        try {
            const props = PropertiesService.getScriptProperties().getProperties();
            const geminiKeys = {};
            Object.keys(props).forEach(k => {
                if (k.startsWith('GEMINI_API_KEY')) {
                    geminiKeys[k] = props[k];
                }
            });
            return ContentService.createTextOutput(JSON.stringify(geminiKeys)).setMimeType(ContentService.MimeType.JSON);
        } catch(err) {
            return ContentService.createTextOutput(err.toString()).setMimeType(ContentService.MimeType.TEXT);
        }
    }

    if (e.parameter && e.parameter.action === 'diag') {
        const diag = {
            status: "success",
            role: "anyGem Diagnostics System",
            timestamp: new Date().toISOString(),
            scriptTimeZone: Session.getScriptTimeZone(),
            scriptProperties: {},
            spreadsheet: {},
            firebase: {},
            line: {}
        };
        
        try {
            const props = PropertiesService.getScriptProperties().getProperties();
            diag.scriptProperties.keys = Object.keys(props);
            diag.scriptProperties.GEMINI_API_KEY_exists = !!props['GEMINI_API_KEY'];
            diag.scriptProperties.LINE_CHANNEL_ACCESS_TOKEN_exists = !!props['LINE_CHANNEL_ACCESS_TOKEN'];
            diag.scriptProperties.SHEET_ID_exists = !!props['SHEET_ID'];
            diag.scriptProperties.FB_PROJECT_ID_exists = !!props['FB_PROJECT_ID'];
            diag.scriptProperties.FB_API_KEY_exists = !!props['FB_API_KEY'];
            diag.scriptProperties.GITHUB_PAT_exists = !!props['GITHUB_PAT'];
            if (props['GITHUB_PAT']) {
                diag.scriptProperties.GITHUB_PAT_preview = props['GITHUB_PAT'];
            }
            const tempConfig = { ...BASE_CONFIG };
            try {
                const sheetId = props['SHEET_ID'] || BASE_CONFIG.SHEET_ID;
                const ss = SpreadsheetApp.openById(sheetId);
                Object.assign(tempConfig, loadSettings(ss));
            } catch(e) {}
            const accumulatedKeys = getAccumulatedGeminiApiKeys(tempConfig);
            if (accumulatedKeys) {
                diag.scriptProperties.accumulated_gemini_keys_count = accumulatedKeys.split(',').length;
                diag.scriptProperties.accumulated_gemini_keys_previews = accumulatedKeys.split(',').map(k => k.substring(0, 7) + "..." + k.substring(k.length - 4));
            }
        } catch(err) { diag.scriptProperties.error = err.toString(); }
        
        try {
            const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || BASE_CONFIG.SHEET_ID;
            diag.spreadsheet.target_id = sheetId;
            const ss = SpreadsheetApp.openById(sheetId);
            diag.spreadsheet.name = ss.getName();
            diag.spreadsheet.sheets = ss.getSheets().map(s => s.getName());
            
            const settings = loadSettings(ss);
            diag.spreadsheet.settings_keys = Object.keys(settings);
            diag.spreadsheet.GEMINI_API_KEY_in_settings_exists = !!settings['GEMINI_API_KEY'];
            diag.spreadsheet.LINE_CHANNEL_ACCESS_TOKEN_in_settings_exists = !!settings['LINE_CHANNEL_ACCESS_TOKEN'];
        } catch(err) { diag.spreadsheet.error = err.toString(); }
        
        try {
            const db = new FirebaseClient();
            diag.firebase.projectId = db.projectId;
            diag.firebase.apiKey_exists = !!db.apiKey;
            if (db.apiKey && db.projectId) {
                const testGet = db.get("sessions", "line_verify_test");
                diag.firebase.connection = "ok (authenticated)";
            } else {
                diag.firebase.connection = "failed (credentials missing)";
            }
        } catch(err) { diag.firebase.error = err.toString(); }
        
        return ContentService.createTextOutput(JSON.stringify(diag, null, 2))
            .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (e.parameter && e.parameter.action === 'ping') {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'pong' }))
            .setMimeType(ContentService.MimeType.JSON);
    }
    
    const frontendUrl = "https://kiteyoung0520.github.io/agent/";
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>anyGem Backend API</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #1a1a1a; color: #fff; text-align: center; }
                .card { background-color: #2a2b2f; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 400px; }
                h1 { color: #8ab4f8; margin-top: 0; font-size: 24px; }
                p { color: #ccc; font-size: 14px; line-height: 1.6; }
                .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #38bdf8; color: #000; text-decoration: none; border-radius: 10px; font-weight: bold; transition: all 0.2s; }
                .btn:hover { background-color: #0ea5e9; transform: scale(1.05); }
            </style>
            <script>
                setTimeout(function() {
                    window.location.href = "${frontendUrl}";
                }, 3000);
            </script>
        </head>
        <body>
            <div class="card">
                <h1>anyGem 後端服務已啟動</h1>
                <p>後端 API 正在正常運行中。系統將在 3 秒後自動導向至託管於 GitHub Pages 的前端網頁...</p>
                <a class="btn" href="${frontendUrl}">立刻前往前端</a>
            </div>
        </body>
        </html>
    `;
    return HtmlService.createHtmlOutput(htmlContent)
        .setTitle('anyGem Backend')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
    try {
        if (!e.postData || !e.postData.contents) throw new Error("無效請求");
        const payload = JSON.parse(e.postData.contents);
        
        if (payload.events && Array.isArray(payload.events)) {
            if (payload.events.length === 0 || (payload.events[0] && (payload.events[0].replyToken === '00000000000000000000000000000000' || payload.events[0].replyToken === 'ffffffffffffffffffffffffffffffff'))) {
                return ContentService.createTextOutput("OK");
            }
        }

        const { message, session_id, workspace, mode, old_text, target_text, target_role, file_data, mime_type, web_search, youtube_id, auto_image, draw_mode, gem_prompt, gem_model, selected_model, confirmed } = payload;
        
        let ss = null;
        try {
            if (BASE_CONFIG.SHEET_ID) ss = SpreadsheetApp.openById(BASE_CONFIG.SHEET_ID);
        } catch (e) { console.warn("SpreadsheetApp missing:", e); }
        const CONFIG = ss ? { ...BASE_CONFIG, ...loadSettings(ss) } : { ...BASE_CONFIG };
        const apiKey = getAccumulatedGeminiApiKeys(CONFIG);
        const lineToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || CONFIG.LINE_CHANNEL_ACCESS_TOKEN;
        const db = new FirebaseClient();

        if (payload.events && Array.isArray(payload.events)) {
            return handleLineWebhook(payload, ss, apiKey, lineToken, CONFIG, db);
        }

        let wsName = String(workspace || "").trim();
        if (!wsName) {
            const excluded = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
            const validSheets = ss ? ss.getSheets().filter(sh => !excluded.includes(sh.getName()) && !sh.getName().startsWith("_db_")) : [];
            wsName = validSheets.length > 0 ? validSheets[0].getName() : "Main_Workspace";
        }

        let targetSheet = ss.getSheetByName(wsName);
        if (!targetSheet) {
            targetSheet = ss.insertSheet(wsName);
            targetSheet.appendRow(["🔥 Firebase Mode", "此專案空間已遷移至 Firestore，對話紀錄不再儲存於此表單，請至專屬資料庫查看。"]);
        }

        if (mode === 'system') return handleSystemMode(payload, ss, wsName, db, apiKey);

        if (mode === 'edit_and_regenerate') {
            const session = db.get("sessions", session_id);
            if (session && session.history_json) {
                let hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json);
                let targetIdx = -1;
                for (let i = 0; i < hist.length; i++) {
                    if (hist[i].role === 'user' && hist[i].text === String(old_text).trim()) {
                        targetIdx = i; break;
                    }
                }
                if (targetIdx !== -1) {
                    hist = hist.slice(0, targetIdx);
                    session.history_json = hist;
                    db.write("sessions", session_id, session);
                    CacheService.getScriptCache().remove(`history_${wsName}_${session_id}`);
                }
            }
        }

        let finalSystemInstruction = getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES);

        if (gem_prompt) {
            let actualGemPrompt = gem_prompt;
            if (typeof gem_prompt === 'string' && gem_prompt.includes("docs.google.com/document/d/")) {
                try {
                    const docIdMatch = gem_prompt.match(/[-\w]{25,}/);
                    if (docIdMatch && docIdMatch[0]) {
                        actualGemPrompt = DocumentApp.openById(docIdMatch[0]).getBody().getText();
                    }
                } catch (err) {
                    console.error("無法讀取 Google Doc 作為提示詞: ", err);
                    actualGemPrompt = "【系統警告：無法讀取您設定的 Google Doc 提示詞，請確認文件已開啟共用權限。】\n" + gem_prompt;
                }
            }
            finalSystemInstruction += `\n\n【💎 當前切換的 Gem 角色設定】\n使用者目前已切換為特定的 Gem 角色。請你完全沉浸並遵守以下角色設定與指示：\n<gem_role>\n${actualGemPrompt}\n</gem_role>`;
        }

        let fallbackModel = "gemini-2.5-flash";
        try {
            const modelSheet = ss ? ss.getSheetByName("Models") : null;
            if (modelSheet && modelSheet.getLastRow() > 1) {
                fallbackModel = String(modelSheet.getRange(2, 2).getValue()).trim() || fallbackModel;
            }
        } catch(e) {}

        let modelId = file_data ? (CONFIG.MODEL_EDITOR || fallbackModel) : (CONFIG.MODEL_GATHERER || fallbackModel);
        if (gem_model && String(gem_model).trim() !== "") modelId = String(gem_model).trim();
        if (selected_model && String(selected_model).trim() !== "") modelId = String(selected_model).trim();

        const history = getOptimizedHistoryFB(db, wsName, session_id || "default");
        
        let finalMessage = message;
        if (youtube_id) {
            const transcript = fetchYouTubeTranscriptNative(youtube_id);
            if (transcript && !transcript.startsWith("【錯誤】")) {
                finalMessage = `【系統強制注入：以下為該 YouTube 影片的真實逐字稿】\n\n${transcript.substring(0, 150000)}\n\n---\n使用者的指令：${message}`;
            } else {
                const fallbackReply = "⚠️ **本影片無字幕**。無法解析。";
                logToFirebaseAndCache(db, wsName, session_id || "default", message, fallbackReply);
                return response({ status: "success", reply: fallbackReply, model: "System-Interceptor" });
            }
        }

        let finalTools;
        if (draw_mode) {
            finalTools = [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }];
            finalSystemInstruction += `\n\n【🎨 強制繪圖模式 (Draw Mode)】\n使用者已開啟「純繪圖模式」。請將使用者的文字轉換為精確的英文生圖 Prompt，並直接輸出 Markdown 圖片語法 "![圖片描述](https://image.pollinations.ai/prompt/經過URL編碼的英文提示詞?width=800&height=800&nologo=true)"。不要講多餘的廢話，直接顯示圖片！`;
        } else if (web_search) {
            finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
            finalSystemInstruction += `\n\n【🌍 強制聯網模式】請優先使用 google_search 與 read_web_page 工具來完成深度探勘，提供最新資訊。`;
        } else {
            finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
        }

        const agentResult = runAutonomousAgentLoop({
            ss: ss, apiKey: apiKey, prompt: finalMessage, model: modelId,
            wsName: wsName, sessionId: session_id || "default",
            systemInstruction: finalSystemInstruction, history: history, tools: finalTools,
            imageData: file_data ? { mimeType: mime_type, data: file_data } : null,
            artistModel: CONFIG.MODEL_ARTIST || ModelResolver.getModel('image'),
            configData: { ...CONFIG, autoImageEnabled: auto_image },
            confirmed: confirmed
        });

        logToFirebaseAndCache(db, wsName, session_id || "default", message, agentResult.reply || "執行完成", agentResult.html_presentation || null, agentResult.html_artifact || null, agentResult.image || null, agentResult.mime || null, agentResult.model || null);
        return response({ 
            status: "success", 
            reply: agentResult.reply, 
            model: agentResult.model || modelId, 
            image: agentResult.image || null, 
            mime: agentResult.mime || null, 
            html_presentation: agentResult.html_presentation || null, 
            html_artifact: agentResult.html_artifact || null,
            needs_confirmation: agentResult.needs_confirmation || false,
            pending_tool_call: agentResult.pending_tool_call || null,
            python_browser_request: agentResult.python_browser_request || null,
            local_agent_request: agentResult.local_agent_request || null
        });
    } catch (err) { return response({ error: err.toString(), status: "error" }); }
}

function response(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleSystemMode(payload, ss, wsName, db, apiKey) {
    const action = payload.action; 

    const routeHandlers = {
        'get_workspaces': () => {
            try {
                const excluded = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                const workspaces = ss ? ss.getSheets().map(sh => sh.getName()).filter(name => !excluded.includes(name) && !name.startsWith("_db_")) : [];
                if (workspaces.length > 0) return response({ workspaces: workspaces });
            } catch(e) { console.warn("Sheets workspace list failed:", e); }
            // 備援：從 Firebase sessions 提取 workspace 列表
            try {
                const allSessions = db.queryAllSessions();
                const wsSet = new Set();
                allSessions.forEach(s => { if (s.workspace) wsSet.add(s.workspace); });
                const fbWorkspaces = Array.from(wsSet);
                if (fbWorkspaces.length > 0) return response({ workspaces: fbWorkspaces });
            } catch(e) { console.warn("Firebase workspace list failed:", e); }
            return response({ workspaces: ["預設工作區"] });
        },
        'move_session': () => {
            const targetWsName = String(payload.target_workspace || "").trim();
            if (!targetWsName || targetWsName === payload.workspace) return response({status: "success"});

            let targetSheet = ss.getSheetByName(targetWsName);
            if (!targetSheet) {
                targetSheet = ss.insertSheet(targetWsName);
                targetSheet.appendRow(["🔥 Firebase Mode", "此專案空間已遷移至 Firestore，對話紀錄不再儲存於此表單，請至專屬資料庫查看。"]);
                targetSheet.getRange("A1:B1").setFontColor("red").setFontWeight("bold");
            }

            const session = db.get("sessions", payload.session_id);
            if (session) {
                session.workspace = targetWsName;
                db.write("sessions", payload.session_id, session);
                CacheService.getScriptCache().remove(`history_${payload.workspace}_${payload.session_id}`);
            }
            return response({status: "success"});
        },
        'delete_message': () => {
            const session = db.get("sessions", payload.session_id);
            if (session && session.history_json) {
                let hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json);
                let targetIdx = -1;
                for (let i = hist.length - 1; i >= 0; i--) {
                    if (hist[i].role === payload.target_role && hist[i].text === String(payload.target_text).trim()) {
                        targetIdx = i; break;
                    }
                }
                if (targetIdx !== -1) {
                    hist.splice(targetIdx, 1);
                    session.history_json = hist;
                    db.write("sessions", payload.session_id, session);
                    CacheService.getScriptCache().remove(`history_${wsName}_${payload.session_id}`);
                }
            }
            return response({status: "success"});
        },
        'get_gems': () => {
            const gemSheet = ss ? ss.getSheetByName("Gems") : null; if(!gemSheet) return response({gems: []});
            const data = gemSheet.getDataRange().getValues(); let gems = []; let currentGem = null;
            for(let i = 0; i < data.length; i++) {
                let name = String(data[i][0] || "").trim(); let promptText = String(data[i][1] || "").trim(); let model = data[i].length > 2 ? String(data[i][2] || "").trim() : "";
                if (name) { if (currentGem) gems.push(currentGem); currentGem = { name: name, prompt: promptText, model: model }; } else if (currentGem && promptText) { currentGem.prompt += "\n" + promptText; }
            } if (currentGem) gems.push(currentGem); return response({gems: gems});
        },
        'get_models': () => {
            const modelSheet = ss ? ss.getSheetByName("Models") : null; let models = [];
            if(modelSheet) { 
                const data = modelSheet.getDataRange().getValues(); 
                for(let i = 1; i < data.length; i++) { 
                    let name = String(data[i][0] || "").trim(); 
                    let id = String(data[i][1] || "").trim(); 
                    if (name && id) models.push({ name: name, id: id }); 
                } 
            }
            if(models.length === 0) { models = ModelResolver.getModelListForUI(); }
            return response({models: models});
        },
        'get_session_list': () => {
            const sessions = db.querySessions(wsName);
            const formatted = sessions.map(x => ({
                id: x.session_id,
                title: x.customTitle || x.title || "未命名對話",
                date: x.updated_at,
                pinned: x.pinned
            }));
            return response({sessions: formatted});
        },
        'load_session': () => {
            const session = db.get("sessions", payload.session_id);
            let logs = [];
            if (session && session.history_json) {
                logs = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json);
            }
            return response({logs: logs});
        },
        'delete_session': () => {
            db.delete("sessions", payload.session_id);
            CacheService.getScriptCache().remove(`history_${wsName}_${payload.session_id}`);
            return response({status: "success"});
        },
        'rename_session': () => {
            const session = db.get("sessions", payload.session_id);
            if (session) {
                session.customTitle = payload.new_title;
                db.write("sessions", payload.session_id, session);
            }
            return response({status: "success"});
        },
        'pin_session': () => {
            const session = db.get("sessions", payload.session_id);
            if (session) {
                session.pinned = payload.is_pinned;
                db.write("sessions", payload.session_id, session);
            }
            return response({status: "success", pinned: payload.is_pinned});
        },
        'get_sources': () => {
            const sources = db.querySources(wsName);
            return response({ sources: sources });
        },
        'add_source': () => {
            const id = "src_" + Math.random().toString(36).substring(2, 12);
            const sourceData = {
                workspace: wsName,
                title: payload.title || "未命名來源",
                url: payload.url || "",
                type: payload.type || "web",
                content: payload.content || "",
                created_at: new Date()
            };
            db.write("sources", id, sourceData);
            return response({ status: "success", id: id });
        },
        'remove_source': () => {
            db.delete("sources", payload.source_id);
            return response({ status: "success" });
        },
        'get_workspace_context': () => {
            const context = db.queryContext(wsName);
            return response({ context: context });
        },
        'toggle_message_sharing': () => {
            const text = String(payload.text).trim();
            const existing = db.queryContext(wsName).find(c => c.text.trim() === text);
            if (existing) {
                db.delete("context", existing.id);
                return response({ status: "success", shared: false });
            } else {
                const id = "ctx_" + Math.random().toString(36).substring(2, 12);
                db.write("context", id, { workspace: wsName, text: text, created_at: new Date() });
                return response({ status: "success", shared: true });
            }
        },
        'get_user_info': () => {
            let email = "未知使用者";
            try { email = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail(); } catch(e) {}
            return response({ email: email });
        },
        'search_drive_files': () => {
            try {
                let safeKw = (payload.keyword || "").replace(/'/g, "\\'");
                let query = `fullText contains '${safeKw}' and trashed = false`;
                let files = DriveApp.searchFiles(query);
                let results = [];
                let count = 0;
                while (files.hasNext() && count < 40) {
                    let f = files.next();
                    results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                    count++;
                }
                if (results.length === 0) {
                    let titleFiles = DriveApp.searchFiles(`title contains '${safeKw}' and trashed = false`);
                    while (titleFiles.hasNext() && count < 40) {
                        let f = titleFiles.next();
                        results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                        count++;
                    }
                }
                return response({ status: "success", data: results });
            } catch(e) { return response({ status: "error", error_message: e.toString() }); }
        },
        'read_drive_file': () => {
            try {
                let idMatch = payload.fileUrl.match(/[-\w]{25,}/);
                if (!idMatch) return response({ status: "error", error_message: "無法辨識的檔案網址" });
                const file = DriveApp.getFileById(idMatch[0]);
                let content = extractTextFromAnyFile(file, apiKey);
                return response({ status: "success", data: content });
            } catch(e) { return response({ status: "error", error_message: e.toString() }); }
        },
        'parse_pptx': () => {
            try {
                const blob = Utilities.newBlob(Utilities.base64Decode(payload.file_data), "application/vnd.openxmlformats-officedocument.presentationml.presentation", payload.file_name);
                const tempFile = DriveApp.createFile(blob);
                const content = extractTextFromAnyFile(tempFile, apiKey);
                tempFile.setTrashed(true);
                return response({ status: "success", text: content });
            } catch(e) { return response({ status: "error", message: e.toString() }); }
        },
        'export_google_slides': () => {
            try {
                let sData = payload.slidesData;
                if (typeof sData === 'string') sData = JSON.parse(sData);
                const isAutoImage = (payload.autoImage !== undefined) ? payload.autoImage : (payload.auto_image !== undefined ? payload.auto_image : true);
                const pid = createGeometricSlides(payload.topic, sData, payload.theme || PPT_THEMES['modern_blue'], payload.style || 'minimalist', isAutoImage, apiKey, ModelResolver.getModel('flash'));
                return response({status: "success", url: `https://docs.google.com/presentation/d/${pid}/edit`});
            } catch(e) {
                return response({ status: "error", message: e.toString() });
            }
        },
        'update_presentation_data': () => {
            try {
                const session = db.get("sessions", payload.session_id);
                if (session && session.history_json) {
                    let hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json);
                    for (let i = hist.length - 1; i >= 0; i--) {
                        if (hist[i].role === 'ai' && hist[i].html_presentation) {
                            hist[i].html_presentation = payload.presentationData;
                            break;
                        }
                    }
                    session.history_json = hist;
                    db.write("sessions", payload.session_id, session);
                    CacheService.getScriptCache().remove(`history_${wsName}_${payload.session_id}`);
                    return response({ status: "success" });
                }
                return response({ status: "error", message: "Session not found" });
            } catch(e) { return response({ status: "error", message: e.toString() }); }
        },
        'deploy_frontend': () => {
            try {
                const props = PropertiesService.getScriptProperties().getProperties();
                const githubPat = props['GITHUB_PAT'];
                if (!githubPat) return response({ status: "error", message: "後端未配置 GITHUB_PAT 變數" });
                
                const owner = "kiteyoung0520";
                const repo = "agent";
                const path = "index.html";
                
                const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                const getRes = UrlFetchApp.fetch(getUrl, {
                    method: "get",
                    headers: {
                        "Authorization": "token " + githubPat,
                        "Accept": "application/vnd.github.v3+json",
                        "User-Agent": "Google-Apps-Script"
                    },
                    muteHttpExceptions: true
                });
                
                let sha = null;
                if (getRes.getResponseCode() === 200) {
                    const getData = JSON.parse(getRes.getContentText());
                    sha = getData.sha;
                }
                
                const htmlContent = HtmlService.createHtmlOutputFromFile('index').getContent();
                const base64Content = Utilities.base64Encode(Utilities.newBlob(htmlContent).getBytes());
                
                const payload = {
                    message: "Deploy index.html from Google Apps Script",
                    content: base64Content
                };
                if (sha) payload.sha = sha;
                
                const putRes = UrlFetchApp.fetch(getUrl, {
                    method: "put",
                    headers: {
                        "Authorization": "token " + githubPat,
                        "Accept": "application/vnd.github.v3+json",
                        "User-Agent": "Google-Apps-Script"
                    },
                    contentType: "application/json",
                    payload: JSON.stringify(payload),
                    muteHttpExceptions: true
                });
                
                if (putRes.getResponseCode() === 200 || putRes.getResponseCode() === 201) {
                    return response({ status: "success", message: "網頁已成功推播至 GitHub Pages 部署！" });
                } else {
                    return response({ status: "error", message: "GitHub API 回傳錯誤: " + putRes.getContentText() });
                }
            } catch(e) {
                return response({ status: "error", message: e.toString() });
            }
        },
        'get_artifact_code': () => {
            const fileId = payload.file_id;
            if (!fileId) return response({ status: "error", message: "缺少 file_id" });
            try {
                const file = DriveApp.getFileById(fileId);
                const code = file.getAs("text/plain").getDataAsString();
                return response({ status: "success", code: code });
            } catch(e) {
                return response({ status: "error", message: `讀取雲端檔案失敗: ${e.toString()}` });
            }
        }
    };
    if (routeHandlers[action]) return routeHandlers[action](); else return response({status: "error", message: "Unknown action"});
}