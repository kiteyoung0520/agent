/**
 * Manus Clone Backend v1.0 (Pure Agentic Architecture)
 * - Async Task Queue
 * - Dynamic Code Sandbox
 * - ReAct Reasoning Loop
 */

function getGlobalConfig() {
    return {
        FB_PROJECT_ID: PropertiesService.getScriptProperties().getProperty('FB_PROJECT_ID'),
        FB_API_KEY: PropertiesService.getScriptProperties().getProperty('FB_API_KEY'),
        GEMINI_API_KEY: PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || PropertiesService.getScriptProperties().getProperty('GEMINI_API'),
    };
}


function response(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ====== Firebase Client ======
class FirebaseClient {
    constructor() {
        const config = getGlobalConfig();
        this.projectId = config.FB_PROJECT_ID;
        this.apiKey = config.FB_API_KEY;
        this.baseUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
    }

    fetchWithRetry(url, options, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const res = UrlFetchApp.fetch(url, options);
                if (res.getResponseCode() === 200 || res.getResponseCode() === 404) return res;
            } catch (e) {
                if (i === retries - 1) return null;
            }
            Utilities.sleep(1000);
        }
        return null;
    }

    write(collection, docId, data) {
        if (!this.apiKey) return false;
        const url = `${this.baseUrl}/${collection}/${docId}?key=${this.apiKey}`;
        const options = {
            method: "patch", 
            contentType: "application/json",
            payload: JSON.stringify({ fields: this._formatData(data) }),
            muteHttpExceptions: true
        };
        const res = this.fetchWithRetry(url, options);
        return res && res.getResponseCode() === 200;
    }

    get(collection, docId) {
        if (!this.apiKey) return null;
        const url = `${this.baseUrl}/${collection}/${docId}?key=${this.apiKey}`;
        const res = this.fetchWithRetry(url, { muteHttpExceptions: true });
        if (res && res.getResponseCode() === 200) {
            return this._parseData(JSON.parse(res.getContentText()).fields);
        }
        return null;
    }

    _formatData(data) {
        const fields = {};
        for (const [key, value] of Object.entries(data)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'string') fields[key] = { stringValue: value };
            else if (typeof value === 'number') fields[key] = { doubleValue: value };
            else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
            else if (value instanceof Date) fields[key] = { timestampValue: value.toISOString() };
            else fields[key] = { stringValue: JSON.stringify(value) };
        }
        return fields;
    }

    _parseData(fields) {
        const data = {};
        if (!fields) return data;
        for (const [key, value] of Object.entries(fields)) {
            if (value.stringValue !== undefined) data[key] = value.stringValue;
            else if (value.doubleValue !== undefined) data[key] = value.doubleValue;
            else if (value.booleanValue !== undefined) data[key] = value.booleanValue;
            else if (value.timestampValue !== undefined) data[key] = new Date(value.timestampValue);
        }
        return data;
    }
}

// ====== Web App Entry ======
function doGet() {
    return HtmlService.createTemplateFromFile('index').evaluate()
        .setTitle('Manus Agent')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
    try {
        const payload = JSON.parse(e.postData.contents);
        const db = new FirebaseClient();
        
        if (payload.action === 'start_task') {
            return startTask(payload, db);
        } else if (payload.action === 'run_step') {
            return runTaskStep(payload, db);
        }
        return response({error: "Unknown action"});
    } catch(err) {
        return response({status: "error", error: err.toString()});
    }
}

// ====== Task Management & Agent Loop ======
function startTask(payload, db) {
    const taskId = "task_" + Math.random().toString(36).substring(2, 12);
    const initialHistory = [{ role: "user", parts: [{ text: payload.prompt }] }];
    
    db.write("tasks", taskId, {
        status: "running",
        history: JSON.stringify(initialHistory),
        created_at: new Date(),
        logs: JSON.stringify(["[System] 任務已接收，環境初始化中..."])
    });
    
    return response({ status: "success", taskId: taskId });
}

function runTaskStep(payload, db) {
    const taskId = payload.taskId;
    const task = db.get("tasks", taskId);
    if (!task) return response({ status: "error", error: "Task not found" });
    if (task.status === "completed") return response({ status: "completed", final_answer: task.final_answer, logs: JSON.parse(task.logs || "[]") });

    let history = JSON.parse(task.history);
    let logs = JSON.parse(task.logs || "[]");

    try {
        const aiResponse = callGemini(history);
        const cand = aiResponse.candidates[0];
        const parts = cand.content.parts || [];
        
        let toolCalls = parts.filter(p => p.functionCall);
        let textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
        
        if (textParts) {
            logs.push("[Thought] " + textParts);
        }

        history.push({ role: "model", parts: parts });

        if (toolCalls.length > 0) {
            let functionResponses = [];
            for (let tc of toolCalls) {
                const fnName = tc.functionCall.name;
                const args = tc.functionCall.args;
                
                if (fnName === "deliver_final_result") {
                    logs.push(`[Action] 呼叫工具: ${fnName}`);
                    task.status = "completed";
                    task.final_answer = args.markdown_report;
                    logs.push("[System] 任務完成，結果已交付。");
                    functionResponses.push({
                        functionResponse: { name: fnName, response: { result: "Success" } }
                    });
                } else {
                    logs.push(`[Action] 呼叫工具: ${fnName} (執行腳本)`);
                    let result = executeTool(fnName, args);
                    let obsSnippet = String(result).substring(0, 300).replace(/\n/g, ' ');
                    logs.push(`[Observation] 執行結果: ${obsSnippet}...`);
                    
                    functionResponses.push({
                        functionResponse: { name: fnName, response: { result: result } }
                    });
                }
            }
            if (task.status !== "completed") {
                history.push({ role: "user", parts: functionResponses });
            }
        } else {
            // No tool call, implicit completion
            task.status = "completed";
            task.final_answer = textParts || "執行完畢。";
            logs.push("[System] 任務自動完成 (無後續動作)。");
        }

        task.history = JSON.stringify(history);
        task.logs = JSON.stringify(logs);
        task.updated_at = new Date();
        
        db.write("tasks", taskId, task);

        return response({ 
            status: task.status, 
            logs: logs, 
            final_answer: task.final_answer || null 
        });

    } catch(e) {
        logs.push(`[Error] 系統異常: ${e.toString()}`);
        task.logs = JSON.stringify(logs);
        db.write("tasks", taskId, task);
        // 回傳 running 讓前端可以延遲重試
        return response({ status: "running", logs: logs, error: e.toString() }); 
    }
}

// ====== Agent Core ======
const SYSTEM_PROMPT = `你是 Manus，一個高度自主、專業的 AI 代理人工程師。
你的核心目標是透過「編寫程式碼」來解決使用者的問題，而不是單純用文字回答。你具備極強的分析與除錯能力。
你擁抱「Plan -> Code -> Execute -> Verify」的工作流。

【你的能力】
你有一個核心工具 \`run_gas_script\`，這是一個沙盒環境，你可以寫 JavaScript 代碼並直接在 Google Apps Script (GAS) 伺服器上執行。
你可以呼叫 Google Apps Script 的內建服務，例如：
- DriveApp (搜尋、讀取、建立檔案與資料夾)
- SpreadsheetApp (操作試算表)
- DocumentApp (操作文件)
- GmailApp (收發信件)
- UrlFetchApp (發送 HTTP 請求，進行網路爬蟲或呼叫外部 API)
- Utilities (資料處理)

【執行規則】
1. **先思考再行動**：收到任務後，務必先在 \`text\` 中輸出你的分析、計畫與推理過程，然後再呼叫 \`run_gas_script\` 執行第一步。
2. **每次一小步**：不要試圖在一段代碼中做完所有事。分多次呼叫工具，每次撰寫一段腳本取得中繼資料 (Observation) 後，再決定下一步。
3. **回傳規範**：你撰寫的 \`code\` 最後必須使用 \`return\` 語句回傳結果字串或物件（例如：\`return data;\`），否則你將得不到任何輸出。
4. **錯誤修正**：如果代碼執行發生 Error，不要放棄！請仔細閱讀錯誤訊息，修改代碼後重新執行，展現你的韌性。
5. **交付結果**：當確認所有任務都已完成後，強制呼叫 \`deliver_final_result\` 工具，將最終成果、數據或結論彙整為美觀、專業的 Markdown 報告。
6. **不說廢話**：你是一個行動派工程師。不要問「需要我幫忙嗎？」，直接動手寫腳本執行！`;

const AGENT_TOOLS = [{
    functionDeclarations: [
        {
            name: "run_gas_script",
            description: "執行 JavaScript/GAS 代碼。可操作 Google 服務 (DriveApp, SpreadsheetApp, UrlFetchApp 等)。⚠️ 重要：代碼必須包含 `return` 語句才能將結果傳回給你。",
            parameters: {
                type: "OBJECT",
                properties: {
                    code: { type: "STRING", description: "要執行的 JavaScript 代碼。" }
                },
                required: ["code"]
            }
        },
        {
            name: "deliver_final_result",
            description: "當任務全部執行完成時，使用此工具提交最終的 Markdown 報告給使用者。",
            parameters: {
                type: "OBJECT",
                properties: {
                    markdown_report: { type: "STRING", description: "最終交付給使用者的詳細 Markdown 內容。" }
                },
                required: ["markdown_report"]
            }
        }
    ]
}];

function callGemini(history) {
    const config = getGlobalConfig();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${config.GEMINI_API_KEY}`;
    
    const payload = {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: history,
        tools: AGENT_TOOLS,
        generationConfig: { temperature: 0.1 }
    };
    
    const options = {
        method: "post", contentType: "application/json",
        payload: JSON.stringify(payload), muteHttpExceptions: true
    };
    
    const res = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(res.getContentText());
    if (!json.candidates) throw new Error("Gemini API Error: " + res.getContentText());
    return json;
}

function executeTool(name, args) {
    if (name === "run_gas_script") {
        try {
            const runner = new Function('SpreadsheetApp', 'DriveApp', 'GmailApp', 'DocumentApp', 'SlidesApp', 'UrlFetchApp', 'Utilities', 'LanguageApp', args.code);
            const result = runner(SpreadsheetApp, DriveApp, GmailApp, DocumentApp, SlidesApp, UrlFetchApp, Utilities, LanguageApp);
            return typeof result === 'object' ? JSON.stringify(result) : String(result);
        } catch(e) {
            return "Execution Error: " + e.toString();
        }
    }
    return "Unknown tool";
}

// ⚠️ 確保 GAS 靜態分析器自動寫入這些權限範圍
function forceAuthSetup() {
    SpreadsheetApp.getActiveSpreadsheet();
    DriveApp.getRootFolder();
    DocumentApp.create("Temp");
    SlidesApp.create("Temp");
    GmailApp.getInboxThreads(0, 1);
    LanguageApp.translate("test", "en", "zh-TW");
}