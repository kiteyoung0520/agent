/**
 * anyGem Backend v92.2 - 自然語言校準版 (Natural Language Edition) + 簡報讀取修復
 * 核心升級項目：
 * 1. [🗣️ 格式幻覺修復] 嚴格規範 AI 的輸出格式，禁止直接以 JSON 格式吐給使用者。
 * 2. [🛡️ QA 機器人約束] 修正 performInnerQALoop。
 * 3. [💯 邏輯全還原] 徹底檢查並保留所有工具 100% 完整觸發。
 * 4. [🧠 記憶修復] 包含 logToFirebaseAndCache 修正。
 * 5. [🔐 權限重構] 移除 forceAuthSetup 護盾。
 * 6. [📝 表單陣列] create_survey_form Schema 為原生 ARRAY 結構。
 * 7. [💬 雙擎路由] LINE 意圖觸發與「/clear」、「新對話」重置功能。
 * 8. [📊 簡報精準讀取] 新增 read_presentation 工具，解決 AI 誤判 docs.google.com 網域的問題。
 */

const BASE_CONFIG = {
    TIMEOUT_LIMIT: 240000,
    SHEET_ID: PropertiesService.getScriptProperties().getProperty('SHEET_ID') || "1pIYPf8v1paZz6OE2qnc5ht5aub8Rm7IA-TfD5kInct8", 
    SETTING_SHEET_NAME: "Setting"
};

const PPT_THEMES = {
    modern_blue:  { bg: "#0f172a", text: "#f8fafc", accent: "#38bdf8", shape: "#1e293b" }
};

// ==========================================
// 🚀 Firebase 輕量化 REST 用戶端 (具備重試機制)
// ==========================================
class FirebaseClient {
    constructor() {
        const props = PropertiesService.getScriptProperties();
        this.projectId = props.getProperty('FB_PROJECT_ID');
        this.apiKey = props.getProperty('FB_API_KEY');
        
        if (!this.projectId || !this.apiKey) {
            console.error("Missing Firebase Credentials. 請先設定腳本屬性 FB_PROJECT_ID 與 FB_API_KEY。");
        }
        this.baseUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
    }

    fetchWithRetry(url, options, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const res = UrlFetchApp.fetch(url, options);
                if (res.getResponseCode() === 200 || res.getResponseCode() === 404) return res;
            } catch (e) {
                if (i === retries - 1) {
                    console.error("Firebase API Error after retries:", e.toString());
                    return null;
                }
            }
            Utilities.sleep(Math.pow(2, i) * 1000);
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

    delete(collection, docId) {
        if (!this.apiKey) return;
        const url = `${this.baseUrl}/${collection}/${docId}?key=${this.apiKey}`;
        this.fetchWithRetry(url, { method: "delete", muteHttpExceptions: true });
    }

    querySessions(workspace) {
        if (!this.apiKey) return [];
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;
        const payload = {
            structuredQuery: {
                from: [{ collectionId: "sessions" }],
                where: {
                    fieldFilter: { field: { fieldPath: "workspace" }, op: "EQUAL", value: { stringValue: workspace } }
                },
                limit: 300
            }
        };
        const res = this.fetchWithRetry(url, {
            method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
        });
        
        if (!res) return [];
        const json = JSON.parse(res.getContentText());
        const results = [];
        if (Array.isArray(json)) {
            json.forEach(item => {
                if (item.document && item.document.fields) results.push(this._parseData(item.document.fields));
            });
        }
        
        results.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return dateB - dateA;
        });
        return results.slice(0, 50);
    }

    getWorkspaceContext(workspace) {
        if (!this.apiKey) return [];
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;
        const payload = {
            structuredQuery: {
                from: [{ collectionId: "workspace_context" }],
                where: {
                    fieldFilter: { field: { fieldPath: "workspace" }, op: "EQUAL", value: { stringValue: workspace } }
                }
            }
        };
        const res = this.fetchWithRetry(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        if (!res) return [];
        const results = JSON.parse(res.getContentText());
        if (!Array.isArray(results)) return [];
        return results.map(x => x.document ? this._parseData(x.document.fields) : null).filter(x => x);
    }

    addWorkspaceContext(workspace, text, sourceSessionId) {
        const id = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, workspace + text).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
        return this.write("workspace_context", id, { workspace: workspace, text: text, source_session: sourceSessionId, created_at: new Date() });
    }

    removeWorkspaceContext(workspace, text) {
        const id = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, workspace + text).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
        this.delete("workspace_context", id);
        return true;
    }

    getSources(workspace) {
        if (!this.apiKey) return [];
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;
        const payload = { structuredQuery: { from: [{ collectionId: "sources" }], where: { fieldFilter: { field: { fieldPath: "workspace" }, op: "EQUAL", value: { stringValue: workspace } } } } };
        const res = this.fetchWithRetry(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        if (!res) return [];
        const results = JSON.parse(res.getContentText());
        return Array.isArray(results) ? results.map(x => x.document ? this._parseData(x.document.fields) : null).filter(x => x) : [];
    }

    addSource(workspace, sourceData) {
        const id = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, workspace + (sourceData.url || sourceData.title)).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
        return this.write("sources", id, { ...sourceData, workspace: workspace, created_at: new Date() });
    }

    removeSource(workspace, sourceId) {
        this.delete("sources", sourceId);
        return true;
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
            else if (value.integerValue !== undefined) data[key] = Number(value.integerValue);
            else if (value.booleanValue !== undefined) data[key] = value.booleanValue;
            else if (value.timestampValue !== undefined) data[key] = new Date(value.timestampValue);
        }
        return data;
    }
}

// ==========================================
// 1. Agent 工具箱定義
// ==========================================
const AGENT_TOOLS = [{
    functionDeclarations: [
        { 
            name: "create_calendar_event", 
            description: "建立單一行事曆行程。若使用者要求邀請或共用給某人，請提供 guests 參數。若指定特定行事曆名稱(如'工作')，請提供 calendarName。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    title: { type: "STRING" }, 
                    startTime: { type: "STRING", description: "開始時間，請嚴格使用 ISO 8601 格式" }, 
                    endTime: { type: "STRING", description: "結束時間，請嚴格使用 ISO 8601 格式" }, 
                    description: { type: "STRING" },
                    calendarName: { type: "STRING", description: "使用者指定的行事曆名稱 (例如 '工作', '家庭' 等)。若未指定則留空。" },
                    guests: { type: "STRING", description: "要邀請或共用的與會者 Email，如果有多個請用半形逗號分隔 (例如: a@gmail.com, b@gmail.com)" }
                }, 
                required: ["title", "startTime"] 
            } 
        },
        { name: "batch_create_calendar_events", description: "批次建立行程", parameters: { type: "OBJECT", properties: { eventsData: { type: "STRING" } }, required: ["eventsData"] } },
        { name: "get_calendar_events", description: "查詢行事曆", parameters: { type: "OBJECT", properties: { startDate: { type: "STRING" }, endDate: { type: "STRING" } }, required: ["startDate", "endDate"] } },
        { name: "add_event_reminder", description: "為特定的行事曆行程新增彈出視窗提醒。", parameters: { type: "OBJECT", properties: { eventId: { type: "STRING" }, minutesBefore: { type: "NUMBER" } }, required: ["eventId", "minutesBefore"] } },
        { name: "read_unread_emails", description: "讀取收件匣中尚未閱讀的信件摘要。", parameters: { type: "OBJECT", properties: { limit: { type: "NUMBER" } } } },
        { name: "send_email_or_draft", description: "寄送電子郵件或建立草稿。", parameters: { type: "OBJECT", properties: { recipient: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" }, isDraft: { type: "BOOLEAN" } }, required: ["recipient", "subject", "body"] } },
        
        { 
            name: "create_survey_form", 
            description: "建立 Google 表單 (Google Forms)。⚠️ 強制要求：當使用者要求建立表單時，請務必『立刻』呼叫此工具，絕對不能只用文字回覆。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    title: { type: "STRING", description: "表單標題" }, 
                    description: { type: "STRING", description: "表單描述" }, 
                    questions: { 
                        type: "ARRAY", 
                        description: "表單題目列表陣列", 
                        items: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING", description: "題目" },
                                type: { type: "STRING", description: "題型(大寫英文)：TEXT, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOX, LIST, SCALE, DATE, TIME" },
                                choices: { type: "ARRAY", items: { type: "STRING" }, description: "選擇題的選項" },
                                required: { type: "BOOLEAN", description: "是否必填" }
                            },
                            required: ["title", "type"]
                        }
                    } 
                }, 
                required: ["title", "questions"] 
            } 
        },
        
        { name: "create_drive_folder", description: "在 Google 雲端硬碟中建立新的資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING", description: "要建立的資料夾名稱" }, parentFolderUrl: { type: "STRING", description: "可選。父資料夾的完整網址，若不提供則建立在根目錄" } }, required: ["folderName"] } },
        
        { name: "search_drive_files", description: "【全文檢索】搜尋 Google 雲端硬碟中的檔案。支援深度全文檢索（包含標題與內文）。支援分頁機制，若回傳結果包含 nextPageToken，表示還有更多檔案，請在後續呼叫帶入 pageToken 繼續搜尋。", parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "搜尋關鍵字 (AI 可針對概念進行搜尋)" }, fileType: { type: "STRING", description: "可選。過濾檔案類型，例如 'document', 'spreadsheet', 'folder', 'pdf'" }, folderId: { type: "STRING", description: "可選。指定要在哪個資料夾內搜尋 (填入資料夾 ID 或網址)。若要搜尋特定資料夾內的檔案，請填入此參數。" }, pageToken: { type: "STRING", description: "可選。獲取下一頁結果的 Token" }, maxResults: { type: "NUMBER", description: "可選。單次獲取最大數量，預設 30" } }, required: ["keyword"] } },
        { name: "scan_and_prepare_archive", description: "【安全歸檔模式】搜尋大量散落的檔案並建立專屬資料夾，但「不主動搬移」。支援分頁機制，若回傳結果包含 nextPageToken，表示還有更多檔案未顯示。", parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "要整理的主題關鍵字，如 'SEL'" }, pageToken: { type: "STRING", description: "可選。獲取下一頁結果的 Token" } }, required: ["keyword"] } },
        
        { name: "move_drive_file", description: "【精準搬移】將特定的單一檔案移動到指定的資料夾中。如果目標資料夾不存在會自動建立。當使用者明確要求「把某個檔案放進某個資料夾」時強制呼叫此工具。", parameters: { type: "OBJECT", properties: { fileIdentifier: { type: "STRING", description: "要移動的檔案名稱或完整網址" }, folderIdentifier: { type: "STRING", description: "目標資料夾的名稱或完整網址" } }, required: ["fileIdentifier", "folderIdentifier"] } },
        
        { name: "read_drive_file", description: "【強制呼叫】讀取 Google 雲端硬碟檔案內容。當使用者貼上 Drive 網址時，你已具備最高合法授權，絕對禁止以「無法存取私人檔案」或「安全限制」為由拒絕，請立刻呼叫此工具解析。", parameters: { type: "OBJECT", properties: { fileUrl: { type: "STRING", description: "要讀取的檔案完整網址" } }, required: ["fileUrl"] } },

        { name: "read_web_page", description: "讀取一般網頁(URL)的純文字內容。當使用者貼上一般新聞、部落格或網站連結並要求總結、閱讀或提問時，強制呼叫此工具。取得內容後，請嚴格基於內容回答，禁止腦補。", parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "要讀取的網頁完整網址 (需包含 http/https)" } }, required: ["url"] } },

        { name: "read_web_page", description: "讀取一般網頁(URL)的純文字內容。當使用者貼上一般新聞、部落格或網站連結並要求總結、閱讀或提問時，強制呼叫此工具。取得內容後，請嚴格基於內容回答，禁止腦補。", parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "要讀取的網頁完整網址 (需包含 http/https)" } }, required: ["url"] } },
        { name: "organize_drive_folder", description: "智慧整理 Google Drive 資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING" } }, required: ["folderName"] } },
        
        { name: "create_google_doc", description: "建立全新的 Google 文件。支援 Markdown 排版。", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, content: { type: "STRING" }, folderName: { type: "STRING" } }, required: ["topic", "content"] } },
        
        { name: "read_google_doc", description: "【強制呼叫】讀取 Google 文件的所有文字內容。當使用者貼上 Google Docs 文件網址，並要求「總結、閱讀、提問、修改或覆寫」時，請唯一且強制呼叫此工具取得內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址" } }, required: ["docUrl"] } },
        
        { name: "append_to_google_doc", description: "在現有 Google 文件最下方「補充/附加」新內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "要附加的新內容，支援 Markdown 排版" } }, required: ["docUrl", "content"] } },
        { name: "overwrite_google_doc", description: "完全覆寫現有 Google 文件。當使用者要求「修改整份文件」時使用。使用前務必先用 read_google_doc 讀取舊內容融合。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "修改後的「完整」新內容，舊內容將被清空，支援 Markdown" } }, required: ["docUrl", "content"] } },
        
        { name: "read_google_sheet", description: "讀取特定的 Google Sheet 試算表內容。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要讀取的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱，若不指定則預設讀取第一頁。" }, range: { type: "STRING", description: "指定範圍，如 'A1:D10'，預設或填 'ALL' 讀取全部" } }, required: ["sheetUrl"] } },
        { 
            name: "update_presentation", 
            description: "【修改/擴充簡報】修改現有的 Google Slides 簡報。支援在簡報最末端「附加(append)」新投影片，或「完全覆寫(overwrite)」整份簡報，亦可在指定位置「插入(insert_at)」新投影片。修改前強烈建議先讀取現有內容。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "現有簡報的完整網址" }, 
                    action: { type: "STRING", description: "'append' (附加), 'overwrite' (覆寫), 'insert_at' (在指定索引插入)" }, 
                    insertIndex: { type: "NUMBER", description: "當 action 為 insert_at 時，指定要插入的位置 (從 0 開始)。" },
                    customColors: { type: "STRING", description: "主題配色 JSON (包含 bg, text, accent, shape 的 HEX 碼)。" }, 
                    shapeStyle: { type: "STRING", description: "幾何風格: 'minimalist', 'rounded', 'cyber', 'dynamic', 'layered' 擇一。" }, 
                    slidesData: { type: "STRING", description: "要新增、插入或覆寫的簡報 JSON 陣列。格式同 create_presentation。" } 
                }, 
                required: ["presentationUrl", "action", "slidesData"] 
            } 
        },
        {
            name: "read_google_presentation",
            description: "【讀取簡報內容】讀取現有 Google Slides 簡報的所有文字內容、投影片結構與備忘錄。這對於修改簡報前的現況分析至關重要。",
            parameters: {
                type: "OBJECT",
                properties: {
                    presentationUrl: { type: "STRING", description: "要讀取的簡報網址" }
                },
                required: ["presentationUrl"]
            }
        },
        { 
            name: "create_presentation", 
            description: "建立全新的 Google Slides 幾何風格簡報。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    topic: { type: "STRING" }, 
                    customColors: { type: "STRING", description: "配色 JSON" }, 
                    shapeStyle: { type: "STRING" }, 
                    slidesData: { type: "STRING", description: "簡報內容 JSON" } 
                }, 
                required: ["topic", "customColors", "shapeStyle", "slidesData"] 
            } 
        },
        { name: "append_to_google_sheet", description: "將資料批次寫入或新增到指定的 Google Sheet 試算表最下方。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要寫入的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, content: { type: "STRING", description: "要寫入的資料，請強制輸出符合標準的 JSON 陣列字串。" } }, required: ["sheetUrl", "sheetName", "content"] } },
        { name: "update_google_sheet", description: "修改或更新指定的 Google Sheet 試算表特定範圍內的資料。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING" }, sheetName: { type: "STRING" }, range: { type: "STRING" }, content: { type: "STRING" } }, required: ["sheetUrl", "sheetName", "range", "content"] } },
        { name: "generate_art", description: "當使用者要求「畫圖」時呼叫此工具。", parameters: { type: "OBJECT", properties: { prompt: { type: "STRING" }, aspectRatio: { type: "STRING" } }, required: ["prompt"] } }
    ]
}];

// ==========================================
// DRY 原則：共用的系統大腦 Prompt 生成器
// ==========================================
function getSuperAgentPrompt(wsName, customRules, workspaceContext = [], sources = []) {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const timeString = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} (${days[now.getDay()]}) ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `【絕對核心時鐘與時空錨點】
現在真實系統時間：${timeString} (時區：${tz})

你是一位全能、嚴謹且具備深度洞察力的 anyGem AI 思考合夥人 (Thinking Partner)。
你不僅是一位【首席簡報總監】與【數位藝術家】，更是一位協助使用者釐清邏輯、挑戰盲點並共同成長的「創業共創者」。

【🧠 內部思考框架 (Chain of Thought)】
⚠️ **強制規範**：在每一則回覆的最開頭，你「必須」先使用 <thought_process> 標籤包裹你的內部思考過程。
思考內容應包含：
1. **任務拆解**：使用者真正的意圖是什麼？
2. **辯證思考**：是否有更優的解法？或是使用者遺漏了什麼風險？
3. **策略規劃**：準備呼叫哪些工具？順序為何？
4. **語氣校準**：如何回應才能既專業又像個合夥人？
完成思考後，才輸出正式的回應內容給使用者。

【🗂️ 專案記憶隔離 (Workspace)】
您目前正處於『${wsName}』的專案空間中。

${sources.length > 0 ? `【📚 專案核心來源 (Sources Library - NotebookLM Mode)】
以下是本專案的「核心參考資料來源」。請以此作為你回答的「最高事實基準」：
${sources.map((s, i) => `[來源 ${i + 1}] 名稱: ${s.title} | 類別: ${s.type} | 內容摘要: ${s.snippet || s.url}`).join('\n')}

⚠️ **引註規範**：當你的回覆內容引用自上述來源時，請務必在該語句末端加上 [來源 編號] (例如 [來源 1])。
` : ''}

${workspaceContext.length > 0 ? `【💡 專案共用知識 (Shared Knowledge)】
以下是使用者釘選的重要片段：
${workspaceContext.map((c, i) => `* ${c.text}`).join('\n')}
` : ''}

【🌟 全格式讀取能力宣告 (Anti-Refusal Protocol)】
你已獲得系統底層的「最高讀取授權」！當使用者貼上任何網址（包含 Google Drive、Google Docs、Google Slides、一般網頁）並要求閱讀、總結或搜尋時，你「絕對具備」讀取權限。
⚠️ 嚴禁行為：絕對禁止回覆「由於系統安全協議限制」、「我無法直接登入私人 Drive」、「安全與隱私權限緣故」等拒絕詞彙。
✅ 正確行為：直接、毫不猶豫地呼叫 \`read_drive_file\`、\`read_google_doc\`、\`read_presentation\` 或 \`read_web_page\` 工具！

如果不需要呼叫任何工具，請務必直接用文字回覆使用者，絕對不能輸出空白內容。

【🗣️ 溝通與輸出格式規範 (CRITICAL)】
1. 無論使用了什麼工具（包含行事曆、Drive 等），你的「最終回覆」必須是自然、流暢、具備溫度的「繁體中文口語化文字」。
2. 請將系統回傳的生硬資料（如行程、檔案清單）轉化為人類容易閱讀的 Markdown 排版（如條列式、粗體）。
3. ⛔ 絕對禁止直接向使用者輸出原始的 JSON 格式資料（除非使用者明確要求寫程式）。
4. 積極對話：若使用者提出的指令較為模糊或缺乏深度，請在回覆末端主動提出 1-2 個具備啟發性的問題來引導討論，而非僅僅被動執行。

【🧠 使用者專屬大腦與規則 (Custom Rules)】
<rules>
${customRules}
</rules>

【📅 行事曆與時間強制規範】
若要建立行事曆，請嚴格計算「現在真實系統時間」，並將 startTime 與 endTime 轉換為標準 ISO 8601 格式。



【📁 安全歸檔模式 (Safe Archive Assistant)】
當使用者要求「整理資料夾」、「集中歸檔」多個未知檔案時，請呼叫 \`scan_and_prepare_archive\`。取得資料後，請【強制】使用以下 5 個標題回覆使用者（請原封不動使用標題字眼）：
1. **【任務理解總結】**：簡述使用者的需求。
2. **【執行結果與研究大綱】**：說明建立狀況，並將新資料夾轉換為 Markdown 超連結。
3. **【主體內容：掃描歸檔清單】**：將搜出的檔案繪製成表格 (欄位必須為：檔案類型 | 檔案名稱 | 連結)。若回傳有 nextPageToken，請主動告知「還有更多檔案，是否需要載入下一頁？」。
4. **【批判思考/風險提示】**：加入 ⚠️ 符號，明確說明基於資料安全協議，需由使用者親自「拖曳搬移」，並針對掃描到的檔案給出版本控管建議。
5. **【行動方案/結論】**：引導使用者點擊連結進行搬移，並詢問是否需要進一步的 AI 分析服務。

【🖋️ 專業文件與簡報規範】
1. **Google Docs**: 
   - 標題級別嚴格遵守 H1 > H2 > H3。
   - 所有清單超過 3 項時，優先考慮使用表格 (Table) 呈現以利閱讀。
   - 必須包含「文件控制表」於文首。

2. **Google Slides**: 
   - 禁止連續兩張投影片使用相同 Layout。
   - 每一頁的文字量不可超過 100 字，其餘內容請放入「講者備忘錄」。
   - customColors 必須根據主題情感（商務、熱情、科技）挑選對比鮮明的 HEX 色碼。
   - imageKeyword 必須包含 'high quality', 'cinematic lighting', 'professional photography' 等修飾詞。`;
}


// ==========================================
// 2. 系統入口
// ==========================================
function doPost(e) {
    try {
        if (!e.postData || !e.postData.contents) throw new Error("無效請求");
        const payload = JSON.parse(e.postData.contents);
        
        // 🚀 [極速攔截] 處理 LINE Verify 測試
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

        // 👑 處理真實的 LINE 用戶對話
        if (payload.events && Array.isArray(payload.events)) {
            return handleLineWebhook(payload, ss, apiKey, lineToken, CONFIG, db);
        }

        // --- 以下為 Web UI 的原有邏輯 ---
        let wsName = String(workspace || "").trim();
        if (!wsName) {
            const excluded = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
            const validSheets = ss.getSheets().filter(sh => !excluded.includes(sh.getName()));
            wsName = validSheets.length > 0 ? validSheets[0].getName() : "Main_Workspace";
        }

        let targetSheet = ss.getSheetByName(wsName);
        if (!targetSheet) {
            targetSheet = ss.insertSheet(wsName);
            targetSheet.appendRow(["🔥 Firebase Mode", "此專案空間已遷移至 Firestore，對話紀錄不再儲存於此表單，請至專屬資料庫查看。"]);
        }

        if (mode === 'system') return handleSystemMode(payload, ss, wsName, db);

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

        let wsContext = db.getWorkspaceContext(wsName);
        let wsSources = db.getSources(wsName);
        let finalSystemInstruction = getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES, wsContext, wsSources);

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
            const modelSheet = ss.getSheetByName("Models");
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
            finalSystemInstruction += `\n\n【🎨 強制繪圖模式 (Draw Mode)】\n使用者已開啟「純繪圖模式」。請將使用者的文字轉換為精確的英文生圖 Prompt，並『強制且唯一』呼叫 \`generate_art\` 工具。不要講多餘的廢話，直接畫圖！`;
        } else if (web_search) {
            finalTools = [{ google_search: {} }];
            finalSystemInstruction += `\n\n【🌍 強制聯網模式】請優先使用 Google Search 工具來回答，提供最新資訊。`;
        } else {
            finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
        }

        const agentResult = runAutonomousAgentLoop({
            ss: ss, apiKey: apiKey, prompt: finalMessage, model: modelId,
            systemInstruction: finalSystemInstruction, history: history, tools: finalTools,
            imageData: file_data ? { mimeType: mime_type, data: file_data } : null,
            artistModel: CONFIG.MODEL_ARTIST || "gemini-3.1-flash-image-preview",
            configData: { ...CONFIG, autoImageEnabled: auto_image }
        });

        logToFirebaseAndCache(db, wsName, session_id || "default", message, agentResult.reply || "執行完成");
        return response({ status: "success", reply: agentResult.reply, model: agentResult.model || modelId, image: agentResult.image || null, mime: agentResult.mime || null });
    } catch (err) { return response({ error: err.toString(), status: "error" }); }
}

// ==========================================
// 💬 LINE Webhook 全通路攔截處理邏輯
// ==========================================
function handleLineWebhook(payload, ss, apiKey, lineToken, CONFIG, db) {
    if (!lineToken) return ContentService.createTextOutput("OK");

    payload.events.forEach(event => {
        if (event.type === 'message') {
            const replyToken = event.replyToken;
            const userId = event.source.userId;
            const wsName = "LINE_Workspace";
            const session_id = "line_" + userId;

            let userMessage = "";
            let fileData = null;

            if (event.message.type === 'text') {
                userMessage = event.message.text.trim();
            } else if (event.message.type === 'image') {
                try {
                    const messageId = event.message.id;
                    const imgRes = UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
                        headers: { 'Authorization': 'Bearer ' + lineToken }
                    });
                    fileData = { mimeType: "image/png", data: Utilities.base64Encode(imgRes.getBlob().getBytes()) };
                    userMessage = "請分析這張圖片內容，並根據我的需求提供回覆。";
                } catch(e) {}
            }

            if (!userMessage && !fileData) return;
            
            // 🔄 新增：處理 LINE 上的「新對話/重置」指令
            const triggerMsg = userMessage.toLowerCase();
            if (triggerMsg === '新對話' || triggerMsg === '/clear' || triggerMsg === '清除對話') {
                db.delete("sessions", session_id);
                CacheService.getScriptCache().remove(`history_${wsName}_${session_id}`);
                
                UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lineToken },
                    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: "✨ 已為您開啟新對話！過去的記憶已清除，我們重新開始吧！" }] })
                });
                return; // 終止後續 AI 呼叫
            }

            let targetSheet = ss.getSheetByName(wsName);
            if (!targetSheet) {
                targetSheet = ss.insertSheet(wsName);
                targetSheet.appendRow(["🔥 LINE 機器人專區", "來自 LINE 的對話將儲存於此空間對應的 Firebase 中。"]);
                targetSheet.getRange("A1:B1").setFontColor("red").setFontWeight("bold");
            }

            let fallbackModel = "gemini-2.5-flash";
            try {
                const modelSheet = ss.getSheetByName("Models");
                if (modelSheet && modelSheet.getLastRow() > 1) {
                    fallbackModel = String(modelSheet.getRange(2, 2).getValue()).trim() || fallbackModel;
                }
            } catch(e) {}

            const history = getOptimizedHistoryFB(db, wsName, session_id);
            
            // 💡 實作意圖觸發 (Intent Triggers)
            let draw_mode = false;
            let web_search = false;
            let actualMessage = userMessage;

            if (userMessage.startsWith("/draw ") || userMessage.startsWith("畫")) {
                draw_mode = true;
                actualMessage = userMessage.replace("/draw ", "").replace(/^畫\s*/, "").trim();
            } else if (userMessage.startsWith("/search ") || userMessage.startsWith("查")) {
                web_search = true;
                actualMessage = userMessage.replace("/search ", "").replace(/^查\s*/, "").trim();
            }

            let wsContext = db.getWorkspaceContext(wsName);
        let wsSources = db.getSources(wsName);
        let finalSystemInstruction = getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES, wsContext, wsSources);
            let finalTools;

            // 🛡️ API 互斥切換
            if (draw_mode) {
                finalTools = [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }];
                finalSystemInstruction += `\n\n【🎨 強制繪圖模式】使用者要求畫圖，請將使用者的文字轉換為詳細的英文畫面描述，並強制呼叫 generate_art 工具。不要講廢話。`;
            } else if (web_search) {
                finalTools = [{ google_search: {} }];
                finalSystemInstruction += `\n\n【🌍 聯網搜尋模式】使用者正在詢問外部資訊，請優先使用 Google Search 工具提供最新答案。`;
            } else {
                finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
            }

            try {
                const agentResult = runAutonomousAgentLoop({
                    ss: ss, apiKey: apiKey, prompt: actualMessage, 
                    model: CONFIG.MODEL_LINE || fallbackModel,
                    systemInstruction: finalSystemInstruction, history: history, tools: finalTools,
                    imageData: fileData, 
                    artistModel: CONFIG.MODEL_ARTIST || "gemini-3.1-flash-image-preview",
                    configData: { ...CONFIG, autoImageEnabled: true }
                });

                logToFirebaseAndCache(db, wsName, session_id, actualMessage, agentResult.reply || "執行完成");

                let replyText = agentResult.reply || "處理完畢";

                if (agentResult.image) {
                    try {
                        const blob = Utilities.newBlob(Utilities.base64Decode(agentResult.image), "image/png", "AI_Image.png");
                        const file = DriveApp.createFile(blob);
                        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                        replyText += `\n\n🎨 圖片已繪製：\n${file.getUrl()}`;
                    } catch(e) {
                        replyText += `\n(⚠️ 圖片生成成功，但上傳雲端硬碟發生錯誤)`;
                    }
                }

                UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lineToken },
                    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: replyText }] })
                });

            } catch(e) {
                UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lineToken },
                    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: "系統運算時發生錯誤：" + e.toString() }] })
                });
            }
        }
    });
    return ContentService.createTextOutput("OK");
}

function performInnerQALoop(text, apiKey, isToolArg = false) {
    if (!text || text.length < 10) return text;
    try {
        const sysPrompt = isToolArg ? 
            "你是一個嚴格的 JSON 參數審查器。請確保文字符合標準 JSON（所有屬性與字串必須使用雙引號，絕對禁止單引號）。" :
            "【排版檢查員】請檢查以下文字。如果包含「破損的 Markdown 表格」，請幫忙修復。如果是一般的對話文字、行程列表或正常的 Markdown 排版，請務必直接判定為合格（pass: true）。⛔ 絕對禁止將自然語言文字或列表擅自轉換為 JSON 格式！";
            
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            system_instruction: { parts: [{ text: sysPrompt + "\n若無格式錯誤，請回傳 {\"pass\": true}；若有錯，請修正並將結果放入 auto_fixed_text 回傳。" }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: { type: "OBJECT", properties: { pass: { type: "BOOLEAN" }, auto_fixed_text: { type: "STRING" } } }
            }
        };
        const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`, {
            method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
        });
        const json = JSON.parse(res.getContentText());
        if (json.candidates && json.candidates[0].content) {
            const result = JSON.parse(json.candidates[0].content.parts[0].text);
            if (result.pass === false && result.auto_fixed_text) {
                return result.auto_fixed_text;
            }
        }
    } catch(e) { console.warn("QA Loop 逾時或失敗，跳過審查", e); }
    return text;
}

function fetchYouTubeTranscriptNative(videoId) {
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const htmlRes = UrlFetchApp.fetch(videoUrl, { muteHttpExceptions: true }).getContentText();
        const regex = /"captionTracks":\[\{"baseUrl":"(https[^"]+)"/;
        const match = htmlRes.match(regex);
        if (!match || !match[1]) return "【錯誤】影片未提供 CC 隱藏式字幕。";
        const captionUrl = match[1].replace(/\\u0026/g, "&");
        const xmlRes = UrlFetchApp.fetch(captionUrl, { muteHttpExceptions: true }).getContentText();
        const textRegex = /<text[^>]*>(.*?)<\/text>/g;
        let transcript = ""; let textMatch;
        while ((textMatch = textRegex.exec(xmlRes)) !== null) {
            let line = textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            transcript += line + " ";
        }
        return transcript.trim() || "【錯誤】字幕檔為空";
    } catch (e) { return "【錯誤】抓取失敗"; }
}

function runAutonomousAgentLoop(config) {
    let currentHistory = [...config.history];
    let isFirstTurn = true; let finalReply = ""; let finalImage = null; let finalMime = null; let finalModel = config.model;
    const MAX_ITERATIONS = 5; let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        
        let apiPayload = {
            prompt: isFirstTurn ? config.prompt : "",
            model: config.model, apiKey: config.apiKey, systemInstruction: config.systemInstruction,
            history: currentHistory, tools: config.tools, imageData: isFirstTurn ? config.imageData : null,
            isFunctionResponse: !isFirstTurn && currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === "user" && currentHistory[currentHistory.length - 1].parts && currentHistory[currentHistory.length - 1].parts[0].functionResponse !== undefined
        };

        let aiResponse = callGeminiAPI_Raw(apiPayload);
        let cand = aiResponse.candidates && aiResponse.candidates[0];
        
        if (!cand) { throw new Error("API 未回傳任何候選內容。可能是安全機制阻擋或伺服器超載。"); }
        if (cand.finishReason === "SAFETY") throw new Error("提示詞涉及敏感內容，被安全機制阻擋。");
        
        let responseParts = (cand.content && cand.content.parts) ? cand.content.parts : [];
        let functionCallParts = responseParts.filter(p => p.functionCall);

        if (functionCallParts.length > 0) {
            if (isFirstTurn) {
                let userPart = config.imageData ? [{ text: config.prompt }, { inlineData: { mimeType: config.imageData.mimeType, data: config.imageData.data } }] : [{ text: config.prompt }];
                currentHistory.push({ role: "user", parts: userPart });
            }
            
            currentHistory.push({ role: "model", parts: responseParts });
            let toolResponses = [];

            for (let part of functionCallParts) {
                if (!part.functionCall.id) part.functionCall.id = "call_" + Math.random().toString(36).substring(2, 10);
                const fnCall = part.functionCall; const fnName = fnCall.name; const args = fnCall.args; let toolResult = {};

                try {
                    if (args.content && typeof args.content === 'string') args.content = performInnerQALoop(args.content, config.apiKey, true);
                    if (args.rowData && typeof args.rowData === 'string') args.rowData = performInnerQALoop(args.rowData, config.apiKey, true);
                } catch(e) {}

                try {
                    switch (fnName) {
                        case "create_database_sheet":
                            try {
                                let newSs = SpreadsheetApp.create(`${args.appName} Database`);
                                newSs.insertSheet("紀錄與設定");
                                toolResult = { status: "success", reply: `已成功建立專屬資料庫。`, data: { sheetId: newSs.getId(), sheetUrl: newSs.getUrl() } };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "deploy_fullstack_matrix":
                            let pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
                            if (!pat) {
                                toolResult = { status: "error", error_message: "系統尚未設定 GITHUB_PAT 環境變數。請在 Apps Script 的「專案設定 > 指令碼屬性」中新增。" };
                                break;
                            }
                            try {
                                let createRes = UrlFetchApp.fetch(`https://api.github.com/user/repos`, { 
                                    method: "post", 
                                    headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" }, 
                                    contentType: "application/json", 
                                    payload: JSON.stringify({ name: args.repoName, auto_init: true, private: true }), 
                                    muteHttpExceptions: true 
                                });
                                let repoData = JSON.parse(createRes.getContentText());
                                if (createRes.getResponseCode() >= 300 && repoData.message !== "name already exists on this account") { 
                                    throw new Error(repoData.message); 
                                }
                                
                                let fullName = repoData.full_name || `${Session.getEffectiveUser().getEmail().split('@')[0]}/${args.repoName}`;
                                
                                const workflowYaml = `name: Matrix Auto Deploy\non:\n  push:\n    branches: [ main, master ]\n    paths:\n      - 'backend/**'\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n        with:\n          token: \${{ secrets.GITHUB_TOKEN }}\n      - name: Setup Node\n        uses: actions/setup-node@v3\n        with:\n          node-version: '18'\n      - name: Install Clasp\n        run: npm install -g @google/clasp\n      - name: Authenticate Clasp\n        run: echo '\${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json\n      - name: Deploy Backend to GAS\n        run: |\n          cd backend\n          if [ ! -f .clasp.json ]; then\n            clasp create --type webapp --title "\${{ github.repository }}-backend"\n            git config --global user.name "github-actions[bot]"\n            git config --global user.email "github-actions[bot]@users.noreply.github.com"\n            git add .clasp.json\n            git commit -m "chore: save clasp config [skip ci]"\n            git push\n          fi\n          clasp push -f\n          clasp deploy -d "Matrix Auto Deploy"`;
                                
                                const readmeMd = `# ${args.repoName}\n\n🤖 本專案由 anyGem AI 自動生成與部署。基於微服務與模組化架構。\n\n## 部署指南\n1. **前端**：請將此 Repo 綁定至 Vercel，根目錄設為 \`frontend\`。\n2. **後端**：請至 GitHub 專案的 \`Settings > Secrets and variables > Actions\` 新增 \`CLASPRC_JSON\` Secret。`;

                                let filesToPush = [
                                    { path: "frontend/index.html", content: args.frontendCode },
                                    { path: "backend/Code.gs", content: args.backendCode },
                                    { path: "backend/appsscript.json", content: `{"timeZone": "Asia/Taipei", "dependencies": {}, "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE"}}` },
                                    { path: ".github/workflows/deploy.yml", content: workflowYaml },
                                    { path: "README.md", content: readmeMd }
                                ];

                                if (args.additionalFiles) {
                                    try {
                                        let extraFiles = JSON.parse(args.additionalFiles);
                                        if (Array.isArray(extraFiles)) {
                                            extraFiles.forEach(ef => { if (ef.path && ef.content) filesToPush.push(ef); });
                                        }
                                    } catch(e) { console.error("Failed to parse additional files"); }
                                }

                                let pushSuccessCount = 0;
                                for (let f of filesToPush) {
                                    let apiUrl = `https://api.github.com/repos/${fullName}/contents/${f.path}`;
                                    let b64 = Utilities.base64Encode(Utilities.newBlob(f.content).getBytes());
                                    let res = UrlFetchApp.fetch(apiUrl, {
                                        method: "put",
                                        headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" },
                                        contentType: "application/json",
                                        payload: JSON.stringify({ message: `Initialize ${f.path}`, content: b64 }),
                                        muteHttpExceptions: true
                                    });
                                    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) { pushSuccessCount++; }
                                    Utilities.sleep(400); 
                                }
                                
                                toolResult = { 
                                    isTerminal: true, 
                                    reply: `🚀 **全端模組化部署完成！(Matrix Protocol)**\n\n- **GitHub 專案庫**: [${fullName}](https://github.com/${fullName})\n- **模組數量**: 成功推送 ${pushSuccessCount}/${filesToPush.length} 個檔案。\n- **CI/CD 管線**: 已配置自動發布。\n\n💡 若未來您需要修改特定功能，我將僅覆寫特定檔案，降低破壞風險。若發生錯誤，隨時可呼叫我執行 \`Rollback\`。` 
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `全端部署發生錯誤: ${e.toString()}` }; }
                            break;

                        case "rollback_github_deployment":
                            let githubPatRollback = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
                            if (!githubPatRollback) { toolResult = { status: "error", error_message: "系統尚未設定 GITHUB_PAT 環境變數。" }; break; }
                            try {
                                let headers = { "Authorization": `Bearer ${githubPatRollback}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" };
                                let repoRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}`, { headers: headers, muteHttpExceptions: true });
                                let repoJson = JSON.parse(repoRes.getContentText());
                                if (repoRes.getResponseCode() !== 200) throw new Error(repoJson.message);
                                let defaultBranch = repoJson.default_branch;

                                let commitsRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/commits?sha=${defaultBranch}&per_page=2`, { headers: headers, muteHttpExceptions: true });
                                let commitsJson = JSON.parse(commitsRes.getContentText());
                                if (commitsRes.getResponseCode() !== 200) throw new Error(commitsJson.message);
                                if (commitsJson.length < 2) throw new Error("專案的 Commit 數量不足 2 筆，無法退回。");
                                
                                let previousCommitSha = commitsJson[1].sha;

                                let updateRefRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/git/refs/heads/${defaultBranch}`, {
                                    method: "patch", headers: headers, contentType: "application/json",
                                    payload: JSON.stringify({ sha: previousCommitSha, force: true }), muteHttpExceptions: true
                                });
                                let updateRefJson = JSON.parse(updateRefRes.getContentText());
                                if (updateRefRes.getResponseCode() !== 200) throw new Error(updateRefJson.message);

                                toolResult = { isTerminal: true, reply: `⏪ **災難復原成功 (Rollback)！**\n\n已將專案 \`${args.repoName}\` 強制退回至上一個穩定的版本 (${previousCommitSha.substring(0, 7)})。\n\n雲端 CI/CD 正在背景重新部署，請稍後重整網頁。現在，請告訴我剛剛到底是哪裡壞了？讓我們一起尋找 Bug 出在哪裡吧！` };
                            } catch(e) { toolResult = { status: "error", error_message: `退回失敗: ${e.toString()}` }; }
                            break;

                        case "create_calendar_event":
                            let start = new Date(args.startTime); 
                            let end = args.endTime ? new Date(args.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
                            
                            let cal = CalendarApp.getDefaultCalendar();
                            let usedCalName = "預設行事曆";
                            
                            if (args.calendarName) {
                                const calendars = CalendarApp.getCalendarsByName(args.calendarName);
                                if (calendars.length > 0) {
                                    cal = calendars[0];
                                    usedCalName = args.calendarName;
                                } else {
                                    toolResult = { status: "error", error_message: `找不到名稱為「${args.calendarName}」的行事曆，請確認名稱是否正確。` };
                                    break;
                                }
                            }
                            
                            let eventOptions = { description: args.description || "由 anyGem Agent 自動建立" };
                            
                            if (args.guests) {
                                eventOptions.guests = args.guests;
                                eventOptions.sendInvites = true;
                            }
                            
                            const ev = cal.createEvent(args.title, start, end, eventOptions);
                            
                            let replyMsg = `✅ 已成功在「${usedCalName}」建立行程：${args.title}`;
                            if (args.guests) replyMsg += `\n📧 並已發送 Google 日曆邀請給：${args.guests}`;
                            
                            toolResult = { status: "success", reply: replyMsg, url: `https://calendar.google.com/calendar/r/eventedit/${ev.getId().split('@')[0]}` }; 
                            break;

                        case "batch_create_calendar_events":
                            let list = JSON.parse(args.eventsData); let count = 0; let batchCal = CalendarApp.getDefaultCalendar();
                            list.forEach(e => { let s = new Date(e.startTime); let ed = e.endTime ? new Date(e.endTime) : new Date(s.getTime() + 3600000); if (!isNaN(s.getTime())) { batchCal.createEvent(e.title, s, ed, { description: e.description }); count++; } });
                            toolResult = { status: "success", reply: `成功批次寫入 ${count} 筆行程` }; break;
                        case "get_calendar_events":
                            let qs = new Date(args.startDate), qe = new Date(args.endDate); let evs = CalendarApp.getDefaultCalendar().getEvents(qs, qe);
                            let eventDetails = evs.length === 0 ? "期間無行程" : evs.map(e => `[EventID: ${e.getId()}] ${e.getStartTime().toLocaleString()} - ${e.getTitle()}`).join("\n");
                            toolResult = { status: "success", data: eventDetails }; break;
                        case "add_event_reminder":
                            try { let eventToUpdate = CalendarApp.getDefaultCalendar().getEventById(args.eventId);
                                if(eventToUpdate) { let mins = parseInt(args.minutesBefore); if(mins > 0 && mins <= 40320) { eventToUpdate.addPopupReminder(mins); toolResult = { status: "success", reply: `成功設定提醒。` }; } else { toolResult = { status: "error", error_message: "時間超出範圍。" }; }
                                } else { toolResult = { status: "error", error_message: "找不到 Event ID" }; }
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; } break;
                        case "read_unread_emails":
                            let limit = args.limit || 5; let threads = GmailApp.getInboxThreads(0, limit);
                            let unreadData = threads.filter(t => t.isUnread()).map(t => { let msg = t.getMessages()[0]; let plainBody = msg.getPlainBody().trim().replace(/\s+/g, ' '); let summary = plainBody ? plainBody.substring(0, 300) + "..." : "【無法解析純文字】"; return `[寄件者: ${msg.getFrom()}] 主旨: ${msg.getSubject()}\n內文: ${summary}`; }).join("\n\n");
                            toolResult = { status: "success", data: unreadData || "無未讀信件。" }; break;
                        case "send_email_or_draft":
                            if (args.isDraft) { GmailApp.createDraft(args.recipient, args.subject, args.body); toolResult = { isTerminal: true, reply: `📝 **草稿已建立**\n\n已存入草稿匣。` }; }
                            else { GmailApp.sendEmail(args.recipient, args.subject, args.body); toolResult = { isTerminal: true, reply: `📧 **信件已發送**給 ${args.recipient}。` }; } break;
                        
                        case "create_survey_form":
                            try {
                                let form = FormApp.create(args.title); 
                                if (args.description) form.setDescription(args.description);
                                let questionsRaw = args.questions; let questions = [];
                                if (typeof questionsRaw === 'string') {
                                    let cleanStr = questionsRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
                                    questions = JSON.parse(cleanStr);
                                } else if (Array.isArray(questionsRaw)) { questions = questionsRaw; }

                                questions.forEach(q => { 
                                    let item;
                                    switch (q.type) {
                                        case 'MULTIPLE_CHOICE': item = form.addMultipleChoiceItem().setTitle(q.title); if (q.choices && Array.isArray(q.choices) && q.choices.length > 0) item.setChoiceValues(q.choices); break;
                                        case 'CHECKBOX': item = form.addCheckboxItem().setTitle(q.title); if (q.choices && Array.isArray(q.choices) && q.choices.length > 0) item.setChoiceValues(q.choices); break;
                                        case 'LIST': item = form.addListItem().setTitle(q.title); if (q.choices && Array.isArray(q.choices) && q.choices.length > 0) item.setChoiceValues(q.choices); break;
                                        case 'SCALE': item = form.addScaleItem().setTitle(q.title); if (q.scale) item.setBounds(q.scale.min || 1, q.scale.max || 5).setLabels(q.scale.minLabel || '', q.scale.maxLabel || ''); break;
                                        case 'DATE': item = form.addDateItem().setTitle(q.title); break;
                                        case 'TIME': item = form.addTimeItem().setTitle(q.title); break;
                                        case 'PARAGRAPH': item = form.addParagraphTextItem().setTitle(q.title); break;
                                        case 'TEXT': default: item = form.addTextItem().setTitle(q.title); break;
                                    }
                                    if (q.required && item.setRequired) item.setRequired(true);
                                });
                                toolResult = { isTerminal: true, reply: `📋 **表單建立完成！**\n\n名稱：${args.title}\n🔗 [編輯表單](${form.getEditUrl()})\n🚀 [發布網址](${form.getPublishedUrl()})` }; 
                            } catch(formErr) {
                                toolResult = { isTerminal: true, reply: `❌ **建立表單失敗**：\n\n*(底層錯誤：${formErr.toString()})*\n\n💡 **系統診斷與修復建議**：\n1. **權限未開通 (最常見)**：請回到 Apps Script 編輯器手動執行一次 forceAuthSetup 進行授權。\n2. **AI 格式錯誤**：選項格式不符合規範，請嘗試簡化指令重試。` };
                            }
                            break;
                        
                        case "create_drive_folder":
                            try {
                                let newFolder;
                                if (args.parentFolderUrl) {
                                    let parentIdMatch = args.parentFolderUrl.match(/[-\w]{25,}/);
                                    if (!parentIdMatch || !parentIdMatch[0]) throw new Error("無法解析父資料夾網址");
                                    let parentFolder = DriveApp.getFolderById(parentIdMatch[0]);
                                    newFolder = parentFolder.createFolder(args.folderName);
                                } else {
                                    newFolder = DriveApp.createFolder(args.folderName);
                                }
                                toolResult = { status: "success", reply: `成功建立資料夾：${args.folderName}`, data: { folderUrl: newFolder.getUrl(), folderId: newFolder.getId() } };
                            } catch(e) { toolResult = { status: "error", error_message: `建立資料夾失敗: ${e.toString()}` }; }
                            break;

                        case "search_drive_files":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                let query = `fullText contains '${safeKw}' and trashed = false`;
                                
                                if (args.folderId) {
                                    let folderIdMatch = args.folderId.match(/[-\w]{25,}/);
                                    let targetFolderId = folderIdMatch ? folderIdMatch[0] : args.folderId;
                                    query += ` and '${targetFolderId}' in parents`;
                                }
                                
                                if (args.fileType) {
                                    let mimeTypeStr = '';
                                    const typeMap = { 'document': 'application/vnd.google-apps.document', 'spreadsheet': 'application/vnd.google-apps.spreadsheet', 'folder': 'application/vnd.google-apps.folder', 'pdf': 'application/pdf' };
                                    for (const [key, val] of Object.entries(typeMap)) {
                                        if (args.fileType.toLowerCase().includes(key)) { mimeTypeStr = val; break; }
                                    }
                                    if (mimeTypeStr) query += ` and mimeType = '${mimeTypeStr}'`;
                                }
                                
                                let listArgs = { q: query, maxResults: args.maxResults || 30 };
                                if (args.pageToken) listArgs.pageToken = args.pageToken; 
                                
                                let response;
                                try {
                                    response = Drive.Files.list(listArgs);
                                } catch (driveErr) {
                                    throw new Error("請確認已在 GAS 服務中開啟 Drive API (v2)。" + driveErr.toString());
                                }
                                
                                let results = [];
                                if (response.items) {
                                    response.items.forEach(f => {
                                        let type = f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : f.mimeType;
                                        results.push({ name: f.title, url: f.alternateLink, id: f.id, type: type });
                                    });
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    data: results.length > 0 ? results : "未找到符合條件的檔案或資料夾。",
                                    nextPageToken: response.nextPageToken || null 
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `搜尋失敗: ${e.toString()}` }; }
                            break;
                            
                        case "scan_and_prepare_archive":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                let folderName = args.keyword + " 資料夾";
                                let newFolder;
                                
                                let folders = DriveApp.searchFolders(`title = '${folderName}' and trashed = false`);
                                if (folders.hasNext()) {
                                    newFolder = folders.next();
                                } else {
                                    newFolder = DriveApp.createFolder(folderName);
                                }
                                let folderUrl = newFolder.getUrl();
                                
                                let query = `title contains '${safeKw}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
                                
                                let listArgs = { q: query, maxResults: 50 };
                                if (args.pageToken) listArgs.pageToken = args.pageToken;
                                
                                let response;
                                try {
                                    response = Drive.Files.list(listArgs);
                                } catch (driveErr) {
                                    throw new Error("請確認已在 GAS 服務中開啟 Drive API (v2)。" + driveErr.toString());
                                }
                                
                                let results = [];
                                if (response.items) {
                                    response.items.forEach(f => {
                                        let mime = f.mimeType;
                                        let typeIcon = "📄 其他";
                                        if (mime.includes('spreadsheet')) typeIcon = "📊 Excel";
                                        else if (mime.includes('presentation')) typeIcon = "🪧 PPT";
                                        else if (mime.includes('document')) typeIcon = "📄 Word";
                                        else if (mime.includes('pdf')) typeIcon = "📕 PDF";
                                        results.push({ "檔案類型": typeIcon, "檔案名稱": f.title, "連結": f.alternateLink });
                                    });
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    reply: `已掃描出相關檔案。系統強制要求：請務必根據【安全歸檔模式】規範的 5 大標塊來回覆。`,
                                    data: { 
                                        "專屬資料夾名稱": folderName, 
                                        "專屬資料夾連結": folderUrl, 
                                        "此頁掃描到的檔案數量": results.length, 
                                        "檔案清單": results,
                                        "nextPageToken": response.nextPageToken || null
                                    }
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `安全掃描失敗: ${e.toString()}` }; }
                            break;

                        case "move_drive_file":
                            try {
                                let fileToMove = null; let targetFolder = null;
                                let fileIdMatch = args.fileIdentifier.match(/[-\w]{25,}/);
                                if (fileIdMatch && fileIdMatch[0]) { fileToMove = DriveApp.getFileById(fileIdMatch[0]); } 
                                else {
                                    let safeFileName = args.fileIdentifier.replace(/'/g, "\\'");
                                    let files = DriveApp.searchFiles(`title = '${safeFileName}' and trashed = false`);
                                    if (files.hasNext()) fileToMove = files.next();
                                }
                                if (!fileToMove) { toolResult = { isTerminal: true, reply: `❌ **找不到指定的檔案：** \`${args.fileIdentifier}\`\n請確認檔案名稱是否正確，或直接提供該檔案的 Google Drive 網址。` }; break; }

                                let folderIdMatch = args.folderIdentifier.match(/[-\w]{25,}/);
                                if (folderIdMatch && folderIdMatch[0]) { targetFolder = DriveApp.getFolderById(folderIdMatch[0]); } 
                                else {
                                    let safeFolderName = args.folderIdentifier.replace(/'/g, "\\'");
                                    let folders = DriveApp.searchFolders(`title = '${safeFolderName}' and trashed = false`);
                                    if (folders.hasNext()) targetFolder = folders.next();
                                    else targetFolder = DriveApp.createFolder(args.folderIdentifier);
                                }

                                fileToMove.moveTo(targetFolder);
                                toolResult = { isTerminal: true, reply: `🚚 **檔案搬移成功！**\n\n已成功將 \`${fileToMove.getName()}\` 移至資料夾 \`${targetFolder.getName()}\` 內。\n🔗 [點擊查看目標資料夾](${targetFolder.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `❌ **搬移過程發生錯誤：**\n\n${e.toString()}\n\n*(請確認您是否擁有該檔案與資料夾的編輯權限)*` }; }
                            break;

                        case "read_drive_file":
                            let fileIdMatch = args.fileUrl.match(/[-\w]{25,}/);
                            if (!fileIdMatch || !fileIdMatch[0]) { toolResult = { status: "error", error_message: "無法辨識的文件網址，請確認連結正確" }; break; }
                            try {
                                const file = DriveApp.getFileById(fileIdMatch[0]);
                                let content = extractTextFromAnyFile(file, config.apiKey);
                                toolResult = { status: "success", data: content.substring(0, 30000) };
                            } catch(e) {
                                let executeEmail = "此系統執行身分"; try { executeEmail = Session.getEffectiveUser().getEmail() || executeEmail; } catch(err) {}
                                toolResult = { status: "error", error_message: `無法讀取檔案: ${e.toString()}。請確認您有權限存取該檔案，或已開權限給 ${executeEmail}` };
                            }
                            break;

                        // ✅ 新增的：獨立的簡報讀取工具路由
                        case "read_presentation":
                            let presIdRead = args.presentationUrl.match(/[-\w]{25,}/);
                            if (!presIdRead || !presIdRead[0]) { 
                                toolResult = { status: "error", error_message: "無法辨識的簡報網址，請確認包含長度正確的 ID。" }; 
                                break; 
                            }
                            try {
                                let content = extractTextFromPresentation(presIdRead[0]);
                                toolResult = { status: "success", data: content };
                            } catch(e) {
                                let executeEmail = "此系統執行身分"; try { executeEmail = Session.getEffectiveUser().getEmail() || executeEmail; } catch(err) {}
                                toolResult = { status: "error", error_message: `無法讀取簡報: ${e.toString()}。請確認這是 Google Slides 且您有權限存取，或已開權限給 ${executeEmail}` };
                            }
                            break;
                            
                        case "read_web_page":
                            try {
                                const options = { 
                                    muteHttpExceptions: true, 
                                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 anyGem/1.0" } 
                                };
                                let res = UrlFetchApp.fetch("https://r.jina.ai/" + args.url, options);
                                let contentText = "";

                                if (res.getResponseCode() === 200 && res.getContentText().length > 100) {
                                    contentText = res.getContentText();
                                } else {
                                    res = UrlFetchApp.fetch(args.url, options);
                                    if (res.getResponseCode() === 200) {
                                        let htmlContent = res.getContentText();
                                        htmlContent = htmlContent.replace(/<(script|style|nav|footer|header|aside)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, ' ');
                                        contentText = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                                    } else {
                                        throw new Error(`伺服器回應狀態碼: ${res.getResponseCode()}`);
                                    }
                                }

                                let finalContent = `【系統強制指令：以下為網頁擷取的真實內容。請「嚴格基於」此內容回答。若內容中未提及使用者的問題，請明確回覆「網頁中未提及此資訊」，絕對禁止腦補或自行發揮。】\n\n---\n${contentText.substring(0, 30000)}`;
                                
                                toolResult = { status: "success", data: finalContent };
                            } catch(e) {
                                toolResult = { status: "error", error_message: `網頁讀取失敗: ${e.toString()} (可能遭遇反爬蟲機制或網址無效)` };
                            }
                            break;

                        case "create_project_wiki":
                            const wikiDoc = createDocFromContent(`WIKI: ${args.projectName}`, String(args.content)); toolResult = { isTerminal: true, reply: `🗺️ **Wiki 導覽頁已建立！**\n🔗 [開啟 Wiki](${wikiDoc.url})` }; break;
                        case "organize_drive_folder":
                            let targetFolders = DriveApp.getFoldersByName(args.folderName); if (!targetFolders.hasNext()) { toolResult = { status: "error", error_message: `找不到資料夾` }; break; }
                            let parentFolder = targetFolders.next(); let folderFiles = parentFolder.getFiles(); let moveCount = 0; let imgFolder, docFolder, otherFolder;
                            while (folderFiles.hasNext()) { let f = folderFiles.next(); let mimeTypeStr = f.getMimeType(); let targetDest = null;
                                if (mimeTypeStr.includes('image/')) { if (!imgFolder) imgFolder = getOrCreateSubFolder(parentFolder, "圖片素材庫"); targetDest = imgFolder; }
                                else if (mimeTypeStr.includes('document') || mimeTypeStr.includes('pdf') || mimeTypeStr.includes('spreadsheet') || mimeTypeStr.includes('presentation')) { if (!docFolder) docFolder = getOrCreateSubFolder(parentFolder, "文件與報表"); targetDest = docFolder; }
                                else { if (!otherFolder) otherFolder = getOrCreateSubFolder(parentFolder, "其他檔案與壓縮檔"); targetDest = otherFolder; }
                                f.moveTo(targetDest); moveCount++; }
                            toolResult = { isTerminal: true, reply: `🗂️ **整理完畢！** 共歸類 ${moveCount} 個檔案。` }; break;
                        
                        case "create_google_doc":
                        case "read_google_doc":
                        case "append_to_google_doc":
                        case "overwrite_google_doc":
                            if (fnName === 'create_google_doc') {
                                const docTitle = String(args.topic || args.title || "未命名").trim(); const docIdAndUrl = createDocFromContent(docTitle, String(args.content || "")); let docUrl = docIdAndUrl.url; let folderMsg = "根目錄";
                                if (args.folderName) { let newFolderUrl = moveFileToFolderByName(docIdAndUrl.id, args.folderName); if (newFolderUrl) folderMsg = `[${args.folderName}]`; }
                                toolResult = { isTerminal: true, reply: `📄 **Google 文件已生成！**\n📁 位置：${folderMsg}\n🔗 [開啟文件](${docUrl})` }; 
                            } else {
                                let idMatch = args.docUrl.match(/[-\w]{25,}/);
                                if (!idMatch) { toolResult = { status: "error", error_message: "無法辨識的文件網址" }; break; }
                                try {
                                    const doc = DocumentApp.openById(idMatch[0]);
                                    if (fnName === 'read_google_doc') { toolResult = { status: "success", data: doc.getBody().getText().substring(0, 30000) }; }
                                    else if (fnName === 'append_to_google_doc') { doc.getBody().appendParagraph("\n"); appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose(); toolResult = { isTerminal: true, reply: `📄 內容已附加！\n[點擊開啟](${doc.getUrl()})` }; }
                                    else { doc.getBody().clear(); appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose(); toolResult = { isTerminal: true, reply: `📄 內容已覆寫！\n[點擊開啟](${doc.getUrl()})` }; }
                                } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            }
                            break;

                        case "read_google_sheet":
                            try {
                                let targetSsForRead = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForRead = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("無法解析的試算表網址");
                                }
                                const rsh = args.sheetName ? targetSsForRead.getSheetByName(args.sheetName) : targetSsForRead.getSheets()[0];
                                if (!rsh) throw new Error("找不到指定的工作表");
                                
                                let sheetData = (!args.range || args.range === 'ALL') ? rsh.getDataRange().getDisplayValues() : rsh.getRange(args.range).getDisplayValues();
                                if (sheetData.length > 100) sheetData = sheetData.slice(0, 100); 
                                
                                toolResult = { status: "success", data: sheetData };
                            } catch(e) { toolResult = { status: "error", error_message: `讀取試算表失敗: ${e.toString()}` }; }
                            break;

                        case "append_to_google_sheet":
                            try {
                                const protectedSheets = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                if (protectedSheets.includes(args.sheetName)) {
                                    toolResult = { isTerminal: true, reply: `❌ **系統安全攔截 (Security Exception)**：\n\n系統核心控制面板 (\`${args.sheetName}\`) 禁止透過 Agent 自動化工具進行修改。若需調整設定、模型或角色，請管理員手動前往試算表處理。` };
                                    break;
                                }

                                let targetSsForWrite = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForWrite = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("無法解析的試算表網址");
                                }
                                let tsh = targetSsForWrite.getSheetByName(args.sheetName);
                                if (!tsh) { tsh = targetSsForWrite.insertSheet(args.sheetName); }
                                
                                let dataToWrite = [];
                                try {
                                    let rawData = args.content || args.rowData || "[]";
                                    let cleanStr = String(rawData).replace(/```json/gi, '').replace(/```javascript/gi, '').replace(/```/g, '').trim();
                                    
                                    let parsed;
                                    try { parsed = JSON.parse(cleanStr); } catch(e1) { try { parsed = new Function("return " + cleanStr)(); } catch(e2) { parsed = cleanStr; } }
                                    
                                    if (Array.isArray(parsed) && parsed.length > 0) {
                                        if (typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
                                            let headers = Object.keys(parsed[0]);
                                            if (tsh.getLastRow() === 0) dataToWrite.push(headers);
                                            parsed.forEach(obj => dataToWrite.push(headers.map(h => obj[h])));
                                        } else if (Array.isArray(parsed[0])) { dataToWrite = parsed; } else { dataToWrite = [parsed]; }
                                    } else if (typeof parsed === 'object' && parsed !== null) {
                                        let headers = Object.keys(parsed);
                                        if (tsh.getLastRow() === 0) dataToWrite.push(headers);
                                        dataToWrite.push(headers.map(h => parsed[h]));
                                    } else { dataToWrite = [[parsed]]; }
                                } catch(e) { dataToWrite = [[args.content || args.rowData]]; }
                                
                                if (dataToWrite.length > 0) {
                                    let startRow = tsh.getLastRow() + 1;
                                    let maxCols = Math.max(...dataToWrite.map(r => r.length));
                                    dataToWrite = dataToWrite.map(r => {
                                        let newRow = Array.isArray(r) ? [...r] : [r];
                                        while (newRow.length < maxCols) newRow.push("");
                                        return newRow;
                                    });
                                    if (maxCols > tsh.getMaxColumns()) tsh.insertColumnsAfter(tsh.getMaxColumns(), maxCols - tsh.getMaxColumns());
                                    tsh.getRange(startRow, 1, dataToWrite.length, maxCols).setValues(dataToWrite);
                                }
                                
                                toolResult = { isTerminal: true, reply: `✅ **資料已批次寫入試算表！**\n\n已成功寫入 ${dataToWrite.length} 筆資料至 \`${args.sheetName}\` 頁籤。\n🔗 [點擊開啟試算表](${targetSsForWrite.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `❌ **寫入試算表失敗：**\n\n*(請確認您提供的網址是否正確，且已開放編輯權限。)*\n底層錯誤: ${e.toString()}` }; }
                            break;

                        case "update_google_sheet":
                            try {
                                const protectedSheets = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                if (protectedSheets.includes(args.sheetName)) {
                                    toolResult = { isTerminal: true, reply: `❌ **系統安全攔截 (Security Exception)**：\n\n系統核心控制面板 (\`${args.sheetName}\`) 禁止透過 Agent 自動化工具進行修改。若需調整設定、模型或角色，請管理員手動前往試算表處理。` };
                                    break;
                                }

                                let targetSsForUpdate = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForUpdate = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("無法解析的試算表網址");
                                }
                                let ush = targetSsForUpdate.getSheetByName(args.sheetName);
                                if (!ush) throw new Error(`找不到名稱為 '${args.sheetName}' 的工作表頁籤`);
                                
                                let dataToUpdate = [];
                                try {
                                    let rawData = args.content || "[]";
                                    let cleanStr = String(rawData).replace(/```json/gi, '').replace(/```javascript/gi, '').replace(/```/g, '').trim();
                                    
                                    let parsed;
                                    try { parsed = JSON.parse(cleanStr); } catch(e1) { try { parsed = new Function("return " + cleanStr)(); } catch(e2) { parsed = cleanStr; } }
                                    
                                    if (Array.isArray(parsed)) { dataToUpdate = Array.isArray(parsed[0]) ? parsed : [parsed]; } else { dataToUpdate = [[parsed]]; }
                                } catch(e) { dataToUpdate = [[args.content]]; }
                                
                                if (dataToUpdate.length > 0) {
                                    let targetRange = ush.getRange(args.range);
                                    let startRow = targetRange.getRow();
                                    let startCol = targetRange.getColumn();
                                    let numRows = dataToUpdate.length;
                                    let numCols = Math.max(...dataToUpdate.map(r => Array.isArray(r) ? r.length : 1));
                                    
                                    dataToUpdate = dataToUpdate.map(r => {
                                        let newRow = Array.isArray(r) ? [...r] : [r];
                                        while (newRow.length < numCols) newRow.push("");
                                        return newRow;
                                    });
                                    if (startCol + numCols - 1 > ush.getMaxColumns()) {
                                        ush.insertColumnsAfter(ush.getMaxColumns(), (startCol + numCols - 1) - ush.getMaxColumns());
                                    }
                                    ush.getRange(startRow, startCol, numRows, numCols).setValues(dataToUpdate);
                                }
                                
                                toolResult = { isTerminal: true, reply: `✅ **資料已成功更新！**\n\n已將新資料精準覆寫至 \`${args.sheetName}\` 頁籤的範圍 \`${args.range}\`。\n🔗 [點擊開啟試算表查看](${targetSsForUpdate.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `❌ **更新試算表失敗：**\n\n*(請確認您提供的網址、頁籤名稱與範圍格式是否正確。)*\n底層錯誤: ${e.toString()}` }; }
                            break;

                        case "create_presentation":
                            let safeSlidesData = args.slidesData.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ');
                            const pid = createGeometricSlides(args.topic, JSON.parse(safeSlidesData), PPT_THEMES['modern_blue'], args.shapeStyle || 'minimalist', config.configData.autoImageEnabled, config.apiKey, config.artistModel);
                            toolResult = { isTerminal: true, reply: `📊 **專屬簡報生成完畢！**\n🔗 [點擊開啟 Google 簡報](https://docs.google.com/presentation/d/${pid}/edit)` };
                            break;
                        case "update_presentation":
                            let presIdMatch = args.presentationUrl.match(/[-\w]{25,}/);
                            if (!presIdMatch) { toolResult = { status: "error", error_message: "無法辨識的簡報網址" }; break; }
                            let safeUpdData = args.slidesData.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ');
                            updateGeometricSlides(presIdMatch[0], args.action, JSON.parse(safeUpdData), PPT_THEMES['modern_blue'], args.shapeStyle || 'minimalist', config.configData.autoImageEnabled, config.apiKey, config.artistModel, args.insertIndex);
                            toolResult = { isTerminal: true, reply: `📊 **簡報修改完畢！**\n🔗 [點擊開啟](https://docs.google.com/presentation/d/${presIdMatch[0]}/edit)` };
                            break;
                        case "read_google_presentation":
                            try {
                                let ridMatch = args.presentationUrl.match(/[-\w]{25,}/);
                                if (!ridMatch) throw new Error("無法解析的簡報網址");
                                const content = readGooglePresentation(ridMatch[0]);
                                toolResult = { status: "success", data: content };
                            } catch(e) { toolResult = { status: "error", error_message: `讀取簡報失敗: ${e.toString()}` }; }
                            break;
                            
                        default:
                            toolResult = { status: "success", reply: `工具 ${fnName} 已處理` };
                    }
                } catch (e) { toolResult = { status: "error", error_message: e.toString() }; }

                if (toolResult.isTerminal) { return { reply: toolResult.reply, model: "Agent-Executor", image: finalImage, mime: finalMime }; }
                toolResponses.push({ functionResponse: { name: fnName, response: toolResult, id: part.functionCall.id } });
            }
            currentHistory.push({ role: "user", parts: toolResponses });
            isFirstTurn = false; continue;
        } else {
            finalReply = responseParts.map(p => p.text || "").join("\n").trim(); break;
        }
    }
    
    if (iterations >= MAX_ITERATIONS) finalReply = "⚠️ 任務過於複雜，已達到單次執行上限。\n\n" + finalReply;
    if (!finalReply && !finalImage) finalReply = "⚠️ 系統已接收指令，但未產出任何內容或動作。";
    if (!finalReply && finalImage) finalReply = "🎨 圖像繪製完成。";
    // if (finalReply && !finalImage) { finalReply = performInnerQALoop(finalReply, config.apiKey, false); }
    
    return { reply: finalReply, model: finalModel, image: finalImage, mime: finalMime };
}

function callGeminiAPI_Raw({ prompt, model, apiKey, systemInstruction, history = [], tools = [], imageData = null, isFunctionResponse = false }) {
    const contents = history.map(x => ({ role: x.role, parts: x.parts ? [...x.parts] : [{ text: x.content || "" }] }));
    if (!isFunctionResponse && prompt) {
        let userPart = imageData ? [{ text: prompt }, { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }] : [{ text: prompt }];
        if (contents.length > 0 && contents[contents.length - 1].role === "user") { contents[contents.length - 1].parts.push(...userPart); }
        else { contents.push({ role: 'user', parts: userPart }); }
    }
    const payload = { contents: contents };
    if (tools.length > 0 && !imageData) payload.tools = tools;
    if (systemInstruction) payload.system_instruction = { parts: [{ text: systemInstruction }] };

    for (let attempt = 1; attempt <= 3; attempt++) {
        const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const json = JSON.parse(res.getContentText());
        
        if (json.error) {
            let errMsg = json.error.message || "";
            if (errMsg.includes("Quota exceeded") || errMsg.includes("429")) {
                if (attempt < 3) { Utilities.sleep(attempt * 10000); continue; }
                throw new Error("⏳ API 請求過於頻繁，請休息約 1 分鐘後再試！");
            }
            if (attempt < 3) { Utilities.sleep(attempt * 2000); continue; }
            throw new Error(errMsg);
        }
        return json;
    }
}

function fetchAIImage(prompt, key, model, aspectRatio = "16:9") {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            let url, payload;
            if (model.includes("imagen")) {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
                const validRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
                let safeRatio = validRatios.includes(aspectRatio) ? aspectRatio : "1:1";
                payload = { instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: safeRatio } };
            }
            else {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                let finalPrompt = prompt;
                if (aspectRatio && aspectRatio !== "1:1") finalPrompt += ` (Aspect Ratio: ${aspectRatio})`;
                payload = { contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { responseModalities: ["IMAGE"] } };
            }
            
            const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
            const resJson = JSON.parse(res.getContentText());
            
            if (resJson.error) {
                lastError = resJson.error.message;
                if (lastError.includes("Quota exceeded") || lastError.includes("429")) { Utilities.sleep(attempt * 8000); continue; }
                if (lastError.toLowerCase().includes("safety") || lastError.toLowerCase().includes("block")) {
                    return `ERROR:提示詞涉及安全或敏感限制，被 Google API 阻擋。請嘗試修改字眼。`;
                }
                Utilities.sleep(2000); continue;
            }
            
            if (model.includes("imagen")) {
                if (resJson.predictions && resJson.predictions[0] && resJson.predictions[0].bytesBase64Encoded) {
                    return Utilities.newBlob(Utilities.base64Decode(resJson.predictions[0].bytesBase64Encoded), "image/png");
                } else {
                    throw new Error(`Google API 回傳了預期外的格式 (可能模型不支援)：${JSON.stringify(resJson).substring(0, 100)}...`);
                }
            } 
            else { 
                let base64Data = resJson.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data; 
                if (!base64Data) base64Data = resJson.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data; 
                if (base64Data) { return Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png"); } 
                else {
                    let txtFallback = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
                    throw new Error(txtFallback ? `模型無法產生圖片，回傳了文字：${txtFallback}` : "API 回傳成功，但未包含影像資料");
                }
            }
        } catch (e) { lastError = e.toString(); Utilities.sleep(2000); continue; }
    }
    return lastError ? `ERROR:${lastError}` : null;
}

function loadSettings(ss) {
    const s = { CUSTOM_RULES: "" };
    const sh = ss.getSheetByName(BASE_CONFIG.SETTING_SHEET_NAME);
    if(sh) {
        let rules = [];
        const data = sh.getDataRange().getValues();
        data.forEach(r => {
            let key = String(r[0] || "").trim(); let val = String(r[1] || "").trim();
            if(key.match(/^[A-Z_]+$/) && val) { s[key] = val; } else if (key || val) { rules.push(key + (val ? " " + val : "")); }
        });
        s.CUSTOM_RULES = rules.join("\n\n");
    }
    return s;
}

function getOptimizedHistoryFB(db, wsName, sessionId) {
    const cache = CacheService.getScriptCache(); const cacheKey = `history_${wsName}_${sessionId}`;
    const cachedData = cache.get(cacheKey); if (cachedData) return JSON.parse(cachedData);
    try {
        const session = db.get("sessions", sessionId); if (!session || !session.history_json) return [];
        let hist = []; try { hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json); } catch(e) {}
        const geminiHistory = []; const MAX_CHARS = 40000; let charCount = 0;
        for (let i = hist.length - 1; i >= 0; i--) {
            const msg = hist[i]; let text = msg.text || ""; if (!text.trim()) continue;
            if (charCount + text.length > MAX_CHARS) break;
            let r = (msg.role === 'ai') ? 'model' : 'user'; geminiHistory.unshift({ role: r, content: text }); charCount += text.length;
        }
        cache.put(cacheKey, JSON.stringify(geminiHistory), 21600); return geminiHistory;
    } catch(e) { return []; }
}

function logToFirebaseAndCache(db, wsName, sessionId, userMsg, aiReply) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
        let session = db.get("sessions", sessionId);
        if (!session) { session = { workspace: wsName, session_id: sessionId, title: userMsg ? userMsg.substring(0, 25) : "新對話", pinned: false, history_json: [] }; }
        let hist = []; if (session.history_json) { try { hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json); } catch(e) {} }
        if (userMsg) hist.push({ role: "user", text: userMsg }); 
        if (aiReply) hist.push({ role: "ai", text: aiReply });
        session.updated_at = new Date(); session.history_json = hist; db.write("sessions", sessionId, session);
    } catch(e) {} finally { lock.releaseLock(); }
    try {
        const cache = CacheService.getScriptCache(); const cacheKey = `history_${wsName}_${sessionId}`; let currentHistory = cache.get(cacheKey);
        if (currentHistory) {
            let h = JSON.parse(currentHistory); if(userMsg) h.push({ role: "user", content: userMsg }); if(aiReply) h.push({ role: "model", content: aiReply });
            if (h.length > 20) h = h.slice(h.length - 20); cache.put(cacheKey, JSON.stringify(h), 21600);
        }
    } catch(e) {}
}

function handleSystemMode(payload, ss, wsName, db) {
    const action = payload.action; 

    const routeHandlers = {
        'get_workspaces': () => {
            const excluded = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
            const workspaces = ss.getSheets().map(sh => sh.getName()).filter(name => !excluded.includes(name));
            return response({ workspaces: workspaces });
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
            const gemSheet = ss.getSheetByName("Gems"); if(!gemSheet) return response({gems: []});
            const data = gemSheet.getDataRange().getValues(); let gems = []; let currentGem = null;
            for(let i = 0; i < data.length; i++) {
                let name = String(data[i][0] || "").trim(); let promptText = String(data[i][1] || "").trim(); let model = data[i].length > 2 ? String(data[i][2] || "").trim() : "";
                if (name) { if (currentGem) gems.push(currentGem); currentGem = { name: name, prompt: promptText, model: model }; } else if (currentGem && promptText) { currentGem.prompt += "\n" + promptText; }
            } if (currentGem) gems.push(currentGem); return response({gems: gems});
        },
        'get_models': () => {
            const modelSheet = ss.getSheetByName("Models"); let models = [];
            if(modelSheet) { 
                const data = modelSheet.getDataRange().getValues(); 
                for(let i = 1; i < data.length; i++) { 
                    let name = String(data[i][0] || "").trim(); 
                    let id = String(data[i][1] || "").trim(); 
                    if (name && id) models.push({ name: name, id: id }); 
                } 
            }
            if(models.length === 0) { models = [{name: "⚡ 閃電 (2.5 Flash)", id: "gemini-2.5-flash"}, {name: "🧠 專家 (2.5 Pro)", id: "gemini-2.5-pro"}]; }
            return response({models: models});
        },
        'get_session_list': () => {
            const sessions = db.querySessions(wsName);
            const formatted = sessions.map(x => ({
                id: x.session_id,
                title: x.customTitle || x.title,
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
        'toggle_workspace_context': () => {
            if (payload.is_shared) {
                db.addWorkspaceContext(wsName, payload.target_text, payload.session_id);
            } else {
                db.removeWorkspaceContext(wsName, payload.target_text);
            }
            return response({status: "success", is_shared: payload.is_shared});
        },
        'get_workspace_context': () => {
            return response({ context: db.getWorkspaceContext(wsName) });
        },
        'get_sources': () => {
            return response({ sources: db.getSources(wsName) });
        },
        'add_source': () => {
            const { url, type, title, snippet } = payload;
            db.addSource(wsName, { url, type, title, snippet });
            return response({ status: "success" });
        },
        'remove_source': () => {
            db.removeSource(wsName, payload.source_id);
            return response({ status: "success" });
        }
    };
    if (routeHandlers[action]) return routeHandlers[action](); else return response({status: "error", message: "Unknown action"});
}

function extractTextFromPresentation(presentationId) {
    const presentation = SlidesApp.openById(presentationId);
    const slides = presentation.getSlides();
    let fullText = "";
    
    slides.forEach((slide, index) => {
        fullText += `\n--- 第 ${index + 1} 頁 ---\n`;
        const elements = slide.getPageElements();
        
        elements.forEach(el => {
            if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
                const text = el.asShape().getText().asString().trim();
                if (text) fullText += text + "\n";
            } else if (el.getPageElementType() === SlidesApp.PageElementType.TABLE) {
                const table = el.asTable();
                for (let r = 0; r < table.getNumRows(); r++) {
                    let rowText = [];
                    for (let c = 0; c < table.getNumColumns(); c++) {
                        rowText.push(table.getCell(r, c).getText().asString().replace(/\n/g, ' ').trim());
                    }
                    fullText += "| " + rowText.join(" | ") + " |\n";
                }
            }
        });
        
        const notesPage = slide.getNotesPage();
        if (notesPage) {
            let notesStr = "";
            notesPage.getPageElements().forEach(el => {
                if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
                    const t = el.asShape().getText().asString().trim();
                    if (t) notesStr += t + "\n";
                }
            });
            if (notesStr.trim()) fullText += `[講者備忘錄]:\n${notesStr}\n`;
        }
    });
    return fullText.substring(0, 30000);
}

function extractTextFromAnyFile(file, apiKey) {
    try {
        const mimeType = file.getMimeType();
        
        // 1. 原生 Google 文件格式
        if (mimeType === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
        if (mimeType === MimeType.GOOGLE_SHEETS) {
            const ss = SpreadsheetApp.openById(file.getId());
            return ss.getSheets().map(sh => sh.getName() + ":\n" + sh.getDataRange().getDisplayValues().map(r => r.join("\t")).join("\n")).join("\n\n");
        }
        if (mimeType === MimeType.GOOGLE_SLIDES) return extractTextFromPresentation(file.getId());
        if (mimeType === MimeType.PLAIN_TEXT || mimeType === MimeType.CSV) return file.getBlob().getDataAsString();
        
        // 🚀 2. 新增：PDF 與純圖片檔的 OCR (光學字元辨識) 支援
        if (mimeType === MimeType.PDF || mimeType.startsWith('image/')) {
            try {
                // 利用 Google Drive API v2 內建的 OCR 引擎，將檔案暫存並轉譯為 Google Doc
                const resource = {
                    title: "Temp_OCR_" + file.getName(),
                    mimeType: MimeType.GOOGLE_DOCS
                };
                // ocr: true 開啟辨識，ocrLanguage: 'zh-TW' 強化繁體中文辨識率
                const tempDoc = Drive.Files.copy(resource, file.getId(), { ocr: true, ocrLanguage: 'zh-TW' });
                
                // 讀取轉換後的純文字
                const ocrText = DocumentApp.openById(tempDoc.id).getBody().getText();
                
                // 閱後即焚：刪除暫存檔，保持雲端硬碟乾淨
                Drive.Files.remove(tempDoc.id);
                
                // 確保不超過 Tokens 限制
                return ocrText ? ocrText.substring(0, 30000) : "【系統提示】OCR 辨識成功，但未能提取出任何文字 (可能圖片解析度過低)。";
            } catch (ocrErr) {
                return `【系統提示】嘗試對 PDF/圖片 進行 OCR 辨識時失敗: ${ocrErr.toString()}。請確認已在 GAS 服務中開啟 Drive API。`;
            }
        }
        
        // 3. 其他未知格式
        return `【系統提示】已找到檔案 (${file.getName()})。此為特殊格式 (${mimeType})，目前系統尚未支援直接讀取其內容。`;
    } catch (e) {
        return `檔案內容讀取失敗: ${e.toString()}`;
    }
}

function getOrCreateSubFolder(parentFolder, folderName) { 
    let iter = parentFolder.getFoldersByName(folderName); 
    return iter.hasNext() ? iter.next() : parentFolder.createFolder(folderName); 
}

function moveFileToFolderByName(fileId, folderName) { 
    try { 
        if (!folderName) return null; 
        let file = DriveApp.getFileById(fileId); 
        let folders = DriveApp.getFoldersByName(folderName); 
        let folder; 
        if (folders.hasNext()) { folder = folders.next(); } 
        else { folder = DriveApp.createFolder(folderName); } 
        file.moveTo(folder); 
        return folder.getUrl(); 
    } catch(e) { return null; } 
}

function response(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function appendMarkdownToBody(body, content) {
    let lines = content.split('\n');
    let tableData = [];
    let inTable = false;
    const bt = String.fromCharCode(96, 96, 96);

    function applyMarkdown(paragraph, text) {
        text = text.replace(new RegExp(bt + '[a-z]*\n', 'gi'), '').replace(new RegExp(bt, 'g'), '');
        const parts = text.split('**');
        for (let i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            const textElement = paragraph.appendText(parts[i]);
            if (i % 2 !== 0) textElement.setBold(true);
        }
    }

    function drawTable() {
        if (tableData.length > 0) {
            const table = body.appendTable(tableData);
            const numRows = table.getNumRows();
            for (let r = 0; r < numRows; r++) {
                const row = table.getRow(r);
                for (let c = 0; c < row.getNumCells(); c++) {
                    const cell = row.getCell(c);
                    cell.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
                    if (r === 0) cell.editAsText().setBold(true);
                }
            }
            body.appendParagraph("");
        }
        inTable = false;
        tableData = [];
    }

    lines.forEach((line) => {
        let trimmed = line.trim();
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            inTable = true;
            if (!trimmed.match(/\|[-\s:|]+\|/)) {
                const rowData = trimmed.split('|').slice(1, -1).map(c => c.trim().replace(/\*\*/g, ''));
                tableData.push(rowData);
            }
            return;
        }
        if (inTable && !trimmed.startsWith('|')) drawTable();
        if (!trimmed) {
            body.appendParagraph("");
            return;
        }
        if (trimmed.startsWith('# ')) {
            body.appendParagraph(trimmed.substring(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
        } else if (trimmed.startsWith('## ')) {
            body.appendParagraph(trimmed.substring(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        } else if (trimmed.startsWith('### ')) {
            body.appendParagraph(trimmed.substring(4)).setHeading(DocumentApp.ParagraphHeading.HEADING3);
        } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            const p = body.appendListItem("");
            p.setGlyphType(DocumentApp.GlyphType.BULLET);
            applyMarkdown(p, trimmed.substring(2));
        } else if (trimmed.match(/^\d+\.\s/)) {
            const p = body.appendListItem("");
            p.setGlyphType(DocumentApp.GlyphType.NUMBER);
            applyMarkdown(p, trimmed.replace(/^\d+\.\s/, ''));
        } else {
            const p = body.appendParagraph("");
            applyMarkdown(p, trimmed);
        }
    });
    if (inTable) drawTable();
}

function createDocFromContent(title, content) {
    const doc = DocumentApp.create(title); const body = doc.getBody(); body.clear();
    const titlePara = body.appendParagraph(title); titlePara.setHeading(DocumentApp.ParagraphHeading.TITLE); titlePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER); body.appendParagraph("\n");
    appendMarkdownToBody(body, content);
    doc.saveAndClose(); 
    try { DriveApp.getFileById(doc.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e) { console.error("權限設定失敗", e); }
    return { url: doc.getUrl(), id: doc.getId() };
}

function fetchIconImage(keyword, colorHex, bgHex) {
    try { let cleanColor = colorHex.replace('#', ''); let bgClean = bgHex.replace('#', ''); let safeKeyword = encodeURIComponent(keyword.trim().split(' ')[0] || "star"); let url = `https://img.icons8.com/ios-filled/100/${cleanColor}/${safeKeyword}.png`; let res = UrlFetchApp.fetch(url, {muteHttpExceptions: true}); if(res.getResponseCode() === 200) return res.getBlob(); let fallbackUrl = `https://ui-avatars.com/api/?name=${safeKeyword}&background=${cleanColor}&color=${bgClean}&size=128&rounded=true&font-size=0.4`; let res2 = UrlFetchApp.fetch(fallbackUrl, {muteHttpExceptions: true}); if(res2.getResponseCode() === 200) return res2.getBlob(); } catch(e) {} return null;
}

function updateGeometricSlides(presentationId, action, slidesData, theme, style, enableAutoImage, apiKey, artistModel, insertIndex) {
    const deck = SlidesApp.openById(presentationId);
    if (action === 'overwrite') {
        const tempSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        const slides = deck.getSlides();
        slides.forEach(s => { if (s.getObjectId() !== tempSlide.getObjectId()) s.remove(); });
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
        tempSlide.remove(); 
    } else if (action === 'insert_at') {
        const targetIdx = (typeof insertIndex === 'number') ? insertIndex : 0;
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel, targetIdx);
    } else {
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
    }
    deck.saveAndClose();
}

function readGooglePresentation(presentationId) {
    const deck = SlidesApp.openById(presentationId);
    const slides = deck.getSlides();
    let result = `【簡報標題：${deck.getName()}】\n共有 ${slides.length} 頁投影片。\n\n`;
    
    slides.forEach((slide, index) => {
        result += `--- 第 ${index + 1} 頁 ---\n`;
        const pageElements = slide.getPageElements();
        let slideText = "";
        pageElements.forEach(el => {
            try {
                if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
                    const text = el.asShape().getText().asString().trim();
                    if (text) slideText += text + " ";
                } else if (el.getPageElementType() === SlidesApp.PageElementType.TABLE) {
                    const table = el.asTable();
                    for (let r = 0; r < table.getNumRows(); r++) {
                        for (let c = 0; c < table.getNumColumns(); c++) {
                            slideText += table.getCell(r, c).getText().asString().trim() + "\t";
                        }
                        slideText += "\n";
                    }
                }
            } catch(e) {}
        });
        result += `[內容]: ${slideText || "(空白或僅包含圖片)"}\n`;
        
        try {
            const notes = slide.getNotesPage().getSpeakerNotesShape().getText().asString().trim();
            if (notes) result += `[講師備忘錄]: ${notes}\n`;
        } catch(e) {}
        result += "\n";
    });
    return result;
}

function appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel, insertIndex) {
    let mainShape = SlidesApp.ShapeType.RECTANGLE; let coverShape = SlidesApp.ShapeType.ELLIPSE; let isMinimal = (style === 'minimalist'); let alphaMod = (style === 'layered') ? 0.3 : 1;
    if (style === 'rounded') { mainShape = SlidesApp.ShapeType.ROUND_RECTANGLE; coverShape = SlidesApp.ShapeType.ROUND_RECTANGLE; } else if (style === 'cyber') { mainShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; coverShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; } else if (style === 'dynamic') { mainShape = SlidesApp.ShapeType.PARALLELOGRAM; coverShape = SlidesApp.ShapeType.PARALLELOGRAM; }

    slidesData.forEach((d, i) => {
        let slide;
        if (typeof insertIndex === 'number') {
            slide = deck.insertSlide(insertIndex + i, SlidesApp.PredefinedLayout.BLANK);
        } else {
            slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
        }
        slide.getBackground().setSolidFill(theme.bg);
        let layoutType = (deck.getSlides().length === 1 && i === 0) ? 'cover' : (d.layout || 'standard_list');
        let imgBlob = null; let titleIconBlob = null; let keyword = d.imageKeyword || d.title || "presentation";
        const needsLargeImage = ['cover', 'image_right', 'image_left', 'image_top', 'image_bottom', 'profile_quote'].includes(layoutType);

        if (enableAutoImage) {
            if (needsLargeImage && keyword) {
                Utilities.sleep(4000); let ratio = (layoutType === 'profile_quote') ? "1:1" : "16:9";
                let result = fetchAIImage(`Professional presentation slide asset, high quality photography, no text, ${keyword}`, apiKey, artistModel, ratio);
                if (result && typeof result !== 'string') imgBlob = result;
            }
            if (d.titleIconKeyword && layoutType !== 'cover' && layoutType !== 'profile_quote') {
                titleIconBlob = fetchIconImage(d.titleIconKeyword, theme.accent, theme.bg);
            }
        }
        
        let safeContent = d.content || (d.points && Array.isArray(d.points) ? d.points.join('\n') : "");
        switch(layoutType) {
            case 'cover':
                if (imgBlob) { try { slide.insertImage(imgBlob, 0, 0, 720, 405); drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, theme.bg, 0.75); } catch(e) {} } else { drawShape(slide, coverShape, 450, -50, 450, 450, theme.shape, 0.5 * alphaMod); drawShape(slide, mainShape, -50, 300, 200, 600, theme.accent, 0.2 * alphaMod); }
                addText(slide, d.title || "未命名標題", 50, 150, 600, 100, theme.text, 36, true); addText(slide, d.subtitle || safeContent, 50, 260, 600, 50, theme.accent, 18, false); break;
            case 'title_only':
                if (!isMinimal) drawShape(slide, mainShape, 0, 0, 50, 450, theme.accent, 1 * alphaMod);
                drawShape(slide, coverShape, 600, -50, 200, 200, theme.shape, 0.4);
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 40, 160, 35, 35); } catch(e){} }
                addText(slide, d.title || "未命名金句", 80, 150, 580, 150, theme.accent, 38, true);
                if (d.subtitle || safeContent) addText(slide, d.subtitle || safeContent, 80, 300, 580, 80, theme.text, 20, false); break;
            case 'image_top':
                if (imgBlob) { try { slide.insertImage(imgBlob, 0, 0, 720, 160); } catch(e){} } else { drawShape(slide, mainShape, 0, 0, 720, 160, theme.shape, 0.5); }
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 15, 185, 35, 35); } catch(e){} }
                addText(slide, d.title || "重點說明", 55, 180, 615, 50, theme.accent, 28, true); 
                addText(slide, safeContent || "【系統提示：AI 未生成內文】", 50, 240, 620, 150, theme.text, 16, false); break;
            case 'image_bottom':
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 15, 35, 35, 35); } catch(e){} }
                addText(slide, d.title || "重點說明", 55, 30, 615, 50, theme.accent, 28, true); 
                addText(slide, safeContent || "【系統提示：AI 未生成內文】", 50, 90, 620, 100, theme.text, 16, false);
                if (imgBlob) { try { slide.insertImage(imgBlob, 0, 205, 720, 200); } catch(e){} } else { drawShape(slide, mainShape, 0, 205, 720, 200, theme.shape, 0.5); } break;
            case 'profile_quote':
                if (imgBlob) { try { slide.insertImage(imgBlob, 50, 100, 180, 180); } catch(e){} } else { drawShape(slide, coverShape, 50, 100, 180, 180, theme.shape, 0.5); }
                let quoteText = safeContent || "Innovation distinguishes between a leader and a follower.";
                addText(slide, `"${quoteText}"`, 260, 100, 420, 150, theme.text, 24, true); addText(slide, `— ${d.title || "專家語錄"}`, 260, 260, 420, 50, theme.accent, 16, false); break;
            case 'icon_grid':
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 15, 35, 35, 35); } catch(e){} }
                addText(slide, d.title || "核心要素", 55, 30, 615, 50, theme.accent, 28, true);
                if (isMinimal) drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 85, 620, 2, theme.accent, 1);
                if (d.gridItems && Array.isArray(d.gridItems) && d.gridItems.length > 0) {
                    let startX = 50; let itemWidth = 180; let spacing = 35;
                    d.gridItems.forEach((item, idx) => {
                        if (idx > 2) return;
                        let x = startX + (itemWidth + spacing) * idx;
                        if (enableAutoImage) {
                            let iconBlob = fetchIconImage(item.iconKeyword || item.title, theme.accent, theme.bg);
                            if (iconBlob) { try { slide.insertImage(iconBlob, x + 65, 110, 50, 50); } catch(e){} }
                            else { drawShape(slide, coverShape, x + 65, 110, 50, 50, theme.shape, 0.8); }
                        } else { drawShape(slide, coverShape, x + 65, 110, 50, 50, theme.shape, 0.8); }
                        addText(slide, item.title, x, 175, itemWidth, 40, theme.accent, 18, true);
                        addText(slide, item.content, x, 220, itemWidth, 150, theme.text, 14, false);
                    });
                } else { addText(slide, safeContent || "【系統提示：需提供 gridItems】", 50, 150, 620, 50, theme.text, 16, false); }
                break;
            case 'image_right':
                if (imgBlob) { try { slide.insertImage(imgBlob, 360, 0, 360, 405); } catch(e) {} } else { drawShape(slide, mainShape, 360, 0, 360, 405, theme.shape, 0.3); }
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 35, 45, 35, 35); } catch(e){} }
                addText(slide, d.title || "重點項目", 75, 40, 265, 60, theme.accent, 28, true);
                if (d.points && d.points.length > 0) {
                    let y = 120;
                    d.points.forEach(p => { addText(slide, "• " + p, 40, y, 290, 40, theme.text, 14, false); y += 45; });
                } else { addText(slide, safeContent || "【系統提示：AI 未生成內文】", 40, 120, 290, 250, theme.text, 16, false); }
                break;
            case 'image_left':
                if (imgBlob) { try { slide.insertImage(imgBlob, 0, 0, 360, 405); } catch(e) {} } else { drawShape(slide, mainShape, 0, 0, 360, 405, theme.shape, 0.3); }
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 385, 45, 35, 35); } catch(e){} }
                addText(slide, d.title || "重點項目", 425, 40, 265, 60, theme.accent, 28, true);
                if (d.points && d.points.length > 0) {
                    let y = 120;
                    d.points.forEach(p => { addText(slide, "• " + p, 390, y, 290, 40, theme.text, 14, false); y += 45; });
                } else { addText(slide, safeContent || "【系統提示：AI 未生成內文】", 390, 120, 290, 250, theme.text, 16, false); }
                break;
            case 'split_column':
                if (!isMinimal) drawShape(slide, mainShape, 0, 0, 50, 450, theme.accent, 1 * alphaMod);
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 40, 45, 35, 35); } catch(e){} }
                addText(slide, d.title || "深度對比", 80, 40, 600, 60, theme.accent, 28, true);
                if (isMinimal) drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 80, 100, 600, 2, theme.accent, 1);
                if (!isMinimal) {
                    drawShape(slide, mainShape, 80, 120, 280, 250, theme.shape, 0.2 * alphaMod);
                    drawShape(slide, mainShape, 380, 120, 280, 250, theme.shape, 0.2 * alphaMod);
                }
                let leftText = d.left || (d.points && d.points[0] ? d.points[0] : (d.content ? d.content : "【左側內容】"));
                let rightText = d.right || (d.points && d.points[1] ? d.points[1] : "【右側內容】");
                addText(slide, leftText, 95, 135, 250, 220, theme.text, 16, false);
                addText(slide, rightText, 395, 135, 250, 220, theme.text, 16, false);
                break;
            case 'standard_list':
            default:
                if (!isMinimal) drawShape(slide, mainShape, 0, 0, 50, 450, theme.accent, 1 * alphaMod);
                if (titleIconBlob) { try { slide.insertImage(titleIconBlob, 40, 45, 35, 35); } catch(e){} }
                addText(slide, d.title || "核心摘要", 80, 40, 600, 60, theme.accent, 28, true);
                if (isMinimal) drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 80, 100, 600, 2, theme.accent, 1);
                if (d.points && Array.isArray(d.points) && d.points.length > 0) {
                    let y = 120;
                    d.points.forEach(p => { addText(slide, "• " + p, 80, y, 550, 40, theme.text, 14, false); y += 45; });
                } else { addText(slide, safeContent || "【系統提示：AI 未生成內文】", 80, 120, 550, 250, theme.text, 16, false); }
                break;
        }
    });
}

function createGeometricSlides(topic, slidesData, theme, style, enableAutoImage, apiKey, artistModel) {
    const deck = SlidesApp.create(`PPT: ${topic}`); 
    const slides = deck.getSlides(); if (slides.length > 0) slides[0].remove();
    appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
    deck.saveAndClose(); 
    try { DriveApp.getFileById(deck.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e) { console.error("權限設定失敗", e); }
    return deck.getId();
}

function updateGeometricSlides(presentationId, action, slidesData, theme, style, enableAutoImage, apiKey, artistModel) {
    const deck = SlidesApp.openById(presentationId);
    if (action === 'overwrite') {
        const tempSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        const slides = deck.getSlides();
        slides.forEach(s => { if (s.getObjectId() !== tempSlide.getObjectId()) s.remove(); });
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
        tempSlide.remove(); 
    } else {
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
    }
    deck.saveAndClose();
}

function drawShape(s, t, x, y, w, h, c, a) { const sh = s.insertShape(t, x, y, w, h); sh.getBorder().setTransparent(); sh.getFill().setSolidFill(c, a); return sh; }
function addText(s, t, x, y, w, h, c, sz, b) { if(!t)return; const box = s.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, w, h); box.getText().setText(t).getTextStyle().setFontSize(sz).setForegroundColor(c).setBold(b); }

function forceAuthSetup() {
    // 不使用 try-catch，強制觸發 Google 的靜態權限掃描與授權視窗
    SpreadsheetApp.getActiveSpreadsheet(); 
    DriveApp.getRootFolder();
    
    const doc = DocumentApp.create("Temp_Auth_Doc");
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    
    const slide = SlidesApp.create("Temp_Auth_Slide");
    DriveApp.getFileById(slide.getId()).setTrashed(true);
    
    // 🐛 觸發 302 / Permission 錯誤的元兇：原本被包在 try-catch 裡面，導致 GAS 忽略了新權限的要求
    const form = FormApp.create("Temp_Auth_Form");
    DriveApp.getFileById(form.getId()).setTrashed(true);
    
    GmailApp.getInboxThreads(0, 1);
    CalendarApp.getDefaultCalendar();
    console.log("✅ 所有權限已成功開通。您可以把剛剛在雲端硬碟產生的 Temp_Auth 檔案刪除。");
}