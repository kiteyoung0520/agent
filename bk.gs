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
    modern_blue:  { colors: { background: "#0f172a", text: "#f8fafc", accent: "#38bdf8", shape: "#1e293b" } }
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
        const encodedId = encodeURIComponent(docId);
        const url = `${this.baseUrl}/${collection}/${encodedId}?key=${this.apiKey}`;
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
        const encodedId = encodeURIComponent(docId);
        const url = `${this.baseUrl}/${collection}/${encodedId}?key=${this.apiKey}`;
        const res = this.fetchWithRetry(url, { muteHttpExceptions: true });
        if (res && res.getResponseCode() === 200) {
            return this._parseData(JSON.parse(res.getContentText()).fields);
        }
        return null;
    }

    delete(collection, docId) {
        if (!this.apiKey) return;
        const encodedId = encodeURIComponent(docId);
        const url = `${this.baseUrl}/${collection}/${encodedId}?key=${this.apiKey}`;
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
                if (item.document && item.document.fields) {
                    const d = this._parseData(item.document.fields);
                    const docId = item.document.name.split('/').pop();
                    if (!d.session_id) d.session_id = docId;
                    results.push(d);
                }
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

    querySources(workspace) {
        if (!this.apiKey) return [];
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;
        const payload = {
            structuredQuery: {
                from: [{ collectionId: "sources" }],
                where: {
                    fieldFilter: { field: { fieldPath: "workspace" }, op: "EQUAL", value: { stringValue: workspace } }
                }
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
                if (item.document && item.document.fields) {
                    const d = this._parseData(item.document.fields);
                    d.id = item.document.name.split('/').pop();
                    results.push(d);
                }
            });
        }
        return results;
    }

    queryContext(workspace) {
        if (!this.apiKey) return [];
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;
        const payload = {
            structuredQuery: {
                from: [{ collectionId: "context" }],
                where: {
                    fieldFilter: { field: { fieldPath: "workspace" }, op: "EQUAL", value: { stringValue: workspace } }
                }
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
                if (item.document && item.document.fields) {
                    const d = this._parseData(item.document.fields);
                    d.id = item.document.name.split('/').pop();
                    results.push(d);
                }
            });
        }
        return results;
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

        { name: "read_web_page", description: "【代理人瀏覽模式 (Agent Browser Mode)】使用整合型無頭瀏覽器讀取網頁。此工具能穿透 JavaScript 與反爬蟲機制（如博客來、Amazon）。當搜尋摘要缺失 ISBN 或原價等深度細節時，強制呼叫此工具進入內頁抓取。取得內容後，請嚴格基於內容回答，禁止腦補。", parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "要讀取的網頁完整網址 (需包含 http/https)" } }, required: ["url"] } },
        { name: "google_search", description: "【萬用搜尋引擎】搜尋全球公開資訊與最新新聞。當使用者要求找尋資料、比較產品、或是現有知識不足時，請優先呼叫此工具。", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "精確的搜尋關鍵字" } }, required: ["query"] } },
        { name: "search_web", description: "【備用搜尋引擎】功能同 google_search，作為冗餘備援。", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "搜尋關鍵字" } }, required: ["query"] } },

        { name: "organize_drive_folder", description: "智慧整理 Google Drive 資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING" } }, required: ["folderName"] } },
        
        { name: "create_google_doc", description: "建立全新的 Google 文件。支援 Markdown 排版。", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, content: { type: "STRING" }, folderName: { type: "STRING" } }, required: ["topic", "content"] } },
        
        { name: "read_google_doc", description: "【強制呼叫】讀取 Google 文件的所有文字內容。當使用者貼上 Google Docs 文件網址，並要求「總結、閱讀、提問、修改或覆寫」時，請唯一且強制呼叫此工具取得內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址" } }, required: ["docUrl"] } },
        
        { name: "append_to_google_doc", description: "在現有 Google 文件最下方「補充/附加」新內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "要附加的新內容，支援 Markdown 排版" } }, required: ["docUrl", "content"] } },
        { name: "overwrite_google_doc", description: "完全覆寫現有 Google 文件。當使用者要求「修改整份文件」時使用。使用前務必先用 read_google_doc 讀取舊內容融合。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "修改後的「完整」新內容，舊內容將被清空，支援 Markdown" } }, required: ["docUrl", "content"] } },

        { name: "read_google_sheet", description: "讀取特定的 Google Sheet 試算表內容。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要讀取的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱，若不指定則預設讀取第一頁。" }, range: { type: "STRING", description: "指定範圍，如 'A1:D10'，預設或填 'ALL' 讀取全部" } }, required: ["sheetUrl"] } },
        { name: "append_to_google_sheet", description: "【新增資料】將資料批次寫入或新增到指定的 Google Sheet 試算表最下方。如果頁籤不存在會自動建立。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要寫入的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, content: { type: "STRING", description: "要寫入的資料，請強制輸出符合標準的 JSON 陣列字串 (Array of Arrays) ，請務必使用「雙引號」而非單引號。例如: [[\"日期\", \"項目\", \"金額\"], [\"03/16\", \"午餐\", 150]]" } }, required: ["sheetUrl", "sheetName", "content"] } },
        { name: "update_google_sheet", description: "【修改資料】修改或更新指定的 Google Sheet 試算表特定範圍內的資料。當使用者要求「更新」、「修改」某特定欄位或整行資料時呼叫此工具。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要修改的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, range: { type: "STRING", description: "要更新的起始儲存格範圍，例如 'A2' 或 'B5:D5'" }, content: { type: "STRING", description: "要更新的新資料，請強制輸出符合標準的 JSON 陣列字串，務必使用「雙引號」。例如: [[\"已修改的A\", \"已修改的B\"]]" } }, required: ["sheetUrl", "sheetName", "range", "content"] } },

        { name: "generate_art", description: "【強制呼叫】當使用者要求「畫圖」、「生成圖片」時，請務必呼叫此工具。", parameters: { type: "OBJECT", properties: { prompt: { type: "STRING", description: "詳細的英文畫面描述" }, aspectRatio: { type: "STRING", description: "比例: 1:1, 16:9, 4:3, 3:4 之一" } }, required: ["prompt"] } },
        { name: "query_knowledge_base", description: "搜尋專屬知識庫 (NotebookLM)。", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
        
        { 
            name: "read_presentation", 
            description: "【強制呼叫】讀取 Google Slides (簡報) 的所有文字與備忘錄。當使用者貼上 Google 簡報網址並要求閱讀、摘要或總結時，請唯一且強制呼叫此工具取得內容。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "該 Google 簡報的完整網址" } 
                }, 
                required: ["presentationUrl"] 
            } 
        },

        { 
            name: "create_presentation", 
            description: "【首席簡報總監】製作全新的 Google Slides。具備內容感知能力，會根據資訊類型自動選擇最佳排版。支援自定義配色與風格。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    topic: { type: "STRING", description: "簡報核心主題" }, 
                    customColors: { type: "OBJECT", description: "主題配色 JSON (包含 bg, text, accent, shape 的 HEX 碼)。請依主題氛圍自主調配。" }, 
                    shapeStyle: { type: "STRING", description: "幾何風格: 'minimalist' (極簡), 'rounded' (圓角), 'cyber' (銳角/科技), 'dynamic' (斜切/活力), 'layered' (疊層/深邃)。" }, 
                    slidesData: { type: "ARRAY", items: { type: "OBJECT" }, description: "簡報 JSON 陣列。格式：[{layout: 'cover|hero_quote|standard_list|split_column|card_deck|stepper|icon_grid|timeline|big_data', title: '標題', content: '內文', points: ['重點'], left: '左欄', right: '右欄', value: '大數據值', imageKeyword: '英文關鍵字', imageSource: 'ai' 或 'web', gridItems: [{title:'標題', content:'內容', iconKeyword:'圖標關鍵字'}]}]。⚠️請根據內容特徵挑選 layout。⚠️ imageSource：若需真實歷史人物/場景請填 'web'，若需抽象/藝術配圖請填 'ai'。" } 
                }, 
                required: ["topic", "customColors", "shapeStyle", "slidesData"] 
            } 
        },
        { 
            name: "update_presentation", 
            description: "【修改/擴充簡報】修改現有的 Google Slides 簡報。支援在簡報最末端「附加(append)」新投影片，或「完全覆寫(overwrite)」整份簡報。修改前強烈建議先讀取現有內容。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "現有簡報的完整網址" }, 
                    action: { type: "STRING", description: "'append' (附加投影片到最後) 或 'overwrite' (清空並重新繪製整份簡報)" }, 
                    customColors: { type: "OBJECT", description: "主題配色 JSON (包含 bg, text, accent, shape 的 HEX 碼)。" }, 
                    shapeStyle: { type: "STRING", description: "幾何風格: 'minimalist', 'rounded', 'cyber', 'dynamic', 'layered' 擇一。" }, 
                    slidesData: { type: "ARRAY", items: { type: "OBJECT" }, description: "要新增或覆寫的簡報 JSON 陣列。格式同 create_presentation。" } 
                }, 
                required: ["presentationUrl", "action", "slidesData"] 
            } 
        },
        { 
            name: "execute_dynamic_tool", 
            description: "【Manus 級代碼執行器】當現有工具無法滿足複雜需求（如數據分析、自定義計算、互動式圖表、動態模擬）時使用。AI 會撰寫一段封裝好的 HTML/JS/CSS 工具並在沙盒中執行。請確保代碼自帶必要的 CDN（如 Chart.js, Tailwind, D3.js）。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    tool_name: { type: "STRING", description: "工具名稱，如 '複利計算器' 或 '銷售趨勢圖'" },
                    description: { type: "STRING", description: "工具功能簡述" },
                    html_code: { type: "STRING", description: "完整且自洽的 HTML 代碼 (包含 CSS 與 JS)。必須是一個完整的 <html> 結構或包含所需依賴的片段。" }
                }, 
                required: ["tool_name", "description", "html_code"] 
            } 
        }
    ]
}];

// ==========================================
// DRY 原則：共用的系統大腦 Prompt 生成器
// ==========================================
function getSuperAgentPrompt(wsName, customRules) {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const timeString = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} (${days[now.getDay()]}) ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `【絕對核心時鐘與時空錨點】
現在真實系統時間：${timeString} (時區：${tz})

你是一位全能、嚴謹且實事求是的 anyGem AI 代理人，遵循 Manus 級別的頂尖代理人作業標準 (Agent SOP)。你不僅能聊天，更是一位能自主規劃、執行、並交付高品質成果的【全能指揮官】。

【🛡️ Manus 核心作業標準 (Agent SOP)】：
你必須在處理複雜任務時，嚴格遵守以下四個階段的思維框架：

階段一：任務規劃 (Strategy Planning)
- **語境解析**：深入識別使用者的隱含需求、風格偏好與限制。
- **階段拆解**：將複雜任務拆分為 4-10 個可執行的子目標。
- **主動澄清**：若目標模糊，先以文字詢問 (ask) 溝通，避免盲目執行。

階段二：執行與迭代 (Agent Loop)
- **分析與推理**：在每次呼叫工具前，先分析當前進度 (Observation) 與下一步邏輯。
- **結果評估**：工具執行後，評估結果是否達成階段目標。若失敗，立即診斷錯誤並嘗試「替代路徑」。

階段三：特定模式 (Specialized Modes)
- **WebDev 模式**：處理程式碼時，先規劃架構圖，再精準寫入 GitHub 或 Sheet 資料庫。
- **Slides 模式**：製作簡報時，先完成內容深度研究與資產規劃，再進入生成流程。
- **Generate 模式**：處理圖片生成時，先優化 Prompt 敘述，再調用繪圖工具。
- **DeepResearch 模式**：處理電商（如博客來）、學術論文或深度資料搜尋時，嚴禁只依賴搜尋引擎的摘要。必須執行「點進內頁」的遞迴讀取流程，確保 ISBN、價格、細節規格等資料 100% 準確。

階段四：品質控管與交付 (QC & Delivery)
- **資料合成**：將碎片化的工具回報資訊，整合為結構化、美觀的 Markdown 報告。
- **終極驗證**：在交付前，最後確認格式是否專業、連結是否可用。
- **成果摘要**：回覆最後必須附上簡短的執行摘要與所有成果附件。

【視覺執行與設計鐵律 (Execution Discipline)】：
1. **方案優先 (Discussed Plan First)**：如果在對話中與使用者討論過版面規劃（例如：第三頁用雙欄、主題色用紫色），在呼叫 'create_presentation' 時【必須】嚴格遵守。禁止使用預設主題名，請務必手動根據討論結果計算配色 JSON 填入 'customColors'。
2. **混合圖片引擎 (Hybrid Image Engine)**：每頁簡報的 'imageKeyword' 必須填寫英文。並且根據內容性質決定 'imageSource'：
   - 若為「真實歷史人物 (如孔子)、真實風景、歷史事件」，必須設定 \`"imageSource": "web"\`。
   - 若為「抽象概念、科技感、幾何圖形、未來感」，必須設定 \`"imageSource": "ai"\`。
3. **內容保護 (Strict Content)**：對於使用者提供的教案、文案、名單、數據，必須 100% 完整保留並填入簡報中。絕對禁止自行做摘要、禁止刪減名單、禁止修改專業術語。
4. **動態版面 (Dynamic Layout)**：捨棄呆板排版，根據內容靈活切換 'layout'。
   - 金句/名言/哲理：必用 'hero_quote' (全螢幕大字)。
   - 多重點/特色：必用 'card_deck' (卡片堆疊) 或 'icon_grid'。
   - 流程/步驟/歷史：必用 'stepper' 或 'timeline'。
   - 對比/優缺點：必用 'split_column'。
   - 震撼數據：必用 'big_data'。
5. **配色紀律**：'customColors' 的 JSON 格式必須包含：{"bg": "#...", "text": "#...", "accent": "#...", "shape": "#..."}。請依據主題氛圍（如：優雅、科技、教育）自主設計高品質配色。
6. **資料探勘紀律 (Data Mining)**：當要求抓取具備「唯一性」或「精確性」的資料（如 ISBN、原價、出版社、規格參數）時，禁止僅依賴 \`search_web\` 的結果片段。你必須：(1) 先搜尋取得清單；(2) 針對清單中的關鍵網址，逐一呼叫 \`read_web_page\` 進入內頁；(3) 彙整內頁真實數據。若因次數限制無法抓取全部，請誠實告知已抓取的部分，絕對禁止腦補。

【🗂️ 專案記憶隔離 (Workspace)】
您目前正處於『${wsName}』的專案空間中。請針對此空間的脈絡進行連貫性對話。

【🌟 全格式讀取與代理人瀏覽能力 (Agent Browser Capability)】
你已獲得系統底層的「最高讀取授權」！你目前已整合了【Jina AI Reader 代理人瀏覽模式】，這使你具備了穿透 JavaScript 渲染、自動繞過反爬蟲機制、以及將複雜網頁簡化為 Markdown 的能力。
- **你的權限**：你可以讀取 Google Drive、Docs、Slides、以及任何公開的電商網站（如博客來、Amazon）。
- **你的動作**：你的 \`read_web_page\` 工具就是你的「點擊」與「深入瀏覽」動作。
⚠️ 嚴禁行為：絕對禁止回覆「由於技術限制我無法點擊」、「我只能看到摘要」或「我無法獲取 ISBN/價格」。
✅ 正確行為：直接呼叫 \`read_web_page\` 穿透網頁。如果你在搜尋結果沒看到細節，那代表你「還沒點進去」，請立刻執行深度瀏覽。

【執行紀律與 Manus 作業標準 (Execution Discipline)】：
1. **一般指令 (行事曆、搬檔案、搜尋)**：執行【沉默執行 (Silent Execution)】，絕對禁止講「好的，我現在為您...」這類廢話，請立刻呼叫對應工具。
2. **專業產出專屬 SOP (Chain of Thought)**：當準備生成或大幅修改「簡報」或「長篇專業報告/文件」時，為了確保極致品質，你【必須】在呼叫對應工具 (\`create_presentation\`, \`create_google_doc\`, \`overwrite_google_doc\` 等) 的「同一回合回覆」中，先以文字寫下你的「Manus 級規劃過程」：包含【需求分析】、【內容結構拆解與大綱】、【視覺素材或寫作策略規劃】。寫完大綱規劃後，務必緊接著在此次回覆中立即呼叫工具執行。
3. **工具定義明確化**：'create_presentation' 工具生成的【就是】互動式網頁簡報（包含匯出 Google 簡報的功能）。禁止告訴使用者「我只能做 Google 簡報」，這會造成混淆。

【🗣️ 溝通與輸出格式規範 (CRITICAL)】
1. 無論使用了什麼工具（包含行事曆、Drive 等），你的「最終回覆」必須是自然、流暢、具備溫度的「繁體中文口語化文字」。
2. 請將系統回傳的生硬資料（如行程、檔案清單）轉化為人類容易閱讀的 Markdown 排版（如條列式、粗體）。
3. ⛔ 絕對禁止直接向使用者輸出原始的 JSON 格式資料（除非使用者明確要求寫程式）。
4. ⛔ **工具使用禁令**：絕對禁止嘗試使用任何非本系統定義的工具，特別是「Python」或「Code Interpreter」。請唯一且僅呼叫系統提供的 \`functionCall\` 工具。若工具報錯，請誠實回報並嘗試更換參數或來源，不要嘗試「寫程式」來解決工具失效問題。

【🧠 使用者專屬大腦與規則 (Custom Rules)】
<rules>
${customRules}
</rules>

【📅 行事曆與時間強制規範】
若要建立行事曆，請嚴格計算「現在真實系統時間」，並將 startTime 與 endTime 轉換為標準 ISO 8601 格式。



[場景 A：建立新專案]
當使用者要求「自動部署全端」、「做一個 App」時：
1. 呼叫 \`create_database_sheet\` 建立資料庫，取得 \`sheetId\`。
2. 呼叫 \`deploy_fullstack_matrix\`，利用 additionalFiles 參數傳遞您拆分好的模組檔案。系統會自動幫您建立 GitHub 專案與 CI/CD 腳本。

[場景 B：修改與熱更新已部署專案]
當使用者要求「修改」時：絕對不要重新建立專案！請判斷只需修改哪個模組 (例如只改 \`frontend/components.js\`)，然後只呼叫 \`push_to_github\` 去精準覆寫該特定檔案，將破壞半徑降到最低。

[場景 C：災難復原 (Rollback)]
當使用者反應「剛剛的更新壞了」、「畫面卡死」、「退回上一版」時：
立刻呼叫 \`rollback_github_deployment\` 工具退回 Git 版本。退回成功後，請深呼吸，重新思考剛剛的邏輯哪裡有問題，並向使用者提出可能的錯誤原因與修正方案。

[場景 D：動態工具合成 (Manus 級代碼執行器)]
當使用者提出需要自定義計算、數據視覺化、互動式儀表板，或現有工具無法直接解決的複雜數據任務時：
1. 分析任務所需之邏輯與介面。
2. 呼叫 \`execute_dynamic_tool\`，合成一段包含 HTML/JS/CSS 的代碼。
3. 代碼中應包含必要的 CDN（如 Chart.js, Tailwind, D3.js），並確保具備高品質的 UI/UX 設計。
4. 最終呈現一個能在側邊欄操作的「即時工具」，這將極大提升任務完成的專業感與效率。

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

4. **Google Slides**: 
   - 嚴格遵守【視覺執行與設計鐵律】。
   - 禁止連續兩張投影片使用相同 Layout。
   - 每一頁的文字量若極多，請開啟「網頁簡報模式」之滾動功能，不要擅自刪減。
   - 'customColors' 必須根據主題情感（商務、熱情、科技、皮紙/Vellum）挑選對比鮮明的 HEX 色碼。
   - 'imageKeyword' 必須包含 'high quality', 'cinematic lighting', 'professional photography' 等修飾詞。

[場景 E：深度資料探勘 (Deep Research)]
當使用者要求「搜尋特定產品清單」、「整理書籍資訊 (含 ISBN/價格)」等任務時，你必須切換至【研究員人格】：
1. 立即規劃「多步探勘計畫」，並在回覆中顯性列出。
2. 第一步：使用 \`google_search\` 找出標的網站 (如博客來、Amazon) 的搜尋結果。
3. 第二步：分析搜尋結果，提取每一個產品的「詳細頁面 URL」。
4. 第三步：【核心強制】針對這些 URL，逐一呼叫 \`read_web_page\` 進入內頁。**絕對禁止**只依賴搜尋結果的 Snippet。
5. 第四步：彙整為 Markdown 表格交付。
⚠️ 絕對禁止：禁止在沒呼叫過 \`read_web_page\` 的情況下說「找不到資訊」或「我無法進入網站」。若網頁內容過長，請嘗試多次讀取。
⚠️ **禁止使用 Python**：絕對禁止嘗試透過撰寫程式碼或呼叫內建代碼執行器來解決數據查詢問題。請唯一使用上述工具。`;
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
            // 原則上使用自定義 search_web 工具以利與 read_web_page 並存
            // 只有當使用者明確開啟「強制聯網」且不考慮其他工具時才使用內建工具
            finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
            finalSystemInstruction += `\n\n【🌍 強制聯網模式】請優先使用 search_web 與 read_web_page 工具來完成深度探勘，提供最新資訊。`;
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

        logToFirebaseAndCache(db, wsName, session_id || "default", message, agentResult.reply || "執行完成", agentResult.html_presentation || null, agentResult.html_artifact || null);
        return response({ status: "success", reply: agentResult.reply, model: agentResult.model || modelId, image: agentResult.image || null, mime: agentResult.mime || null, html_presentation: agentResult.html_presentation || null, html_artifact: agentResult.html_artifact || null });
    } catch (err) { return response({ error: err.toString(), status: "error" }); }
}

function response(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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

            let finalSystemInstruction = getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES);
            let finalTools;

            // 🛡️ API 互斥切換
            if (draw_mode) {
                finalTools = [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }];
                finalSystemInstruction += `\n\n【🎨 強制繪圖模式】使用者要求畫圖，請將使用者的文字轉換為詳細的英文畫面描述，並強制呼叫 generate_art 工具。不要講廢話。`;
            } else if (web_search) {
                finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
                finalSystemInstruction += `\n\n【🌍 聯網搜尋模式】使用者正在詢問外部資訊，請優先使用 search_web 與 read_web_page 工具提供最新答案。`;
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
        let aiTextGenerated = responseParts.filter(p => p.text).map(p => p.text).join('\n').trim();

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
                                // 修正查詢語法：fullText 其實已經包含 title 了，使用更簡單的語法
                                let query = `fullText contains '${safeKw}' and trashed = false`;
                                
                                if (args.fileType) {
                                    const typeMap = { 'document': 'application/vnd.google-apps.document', 'spreadsheet': 'application/vnd.google-apps.spreadsheet', 'folder': 'application/vnd.google-apps.folder', 'pdf': 'application/pdf' };
                                    for (const [key, val] of Object.entries(typeMap)) {
                                        if (args.fileType.toLowerCase().includes(key)) { query += ` and mimeType = '${val}'`; break; }
                                    }
                                }
                                
                                // 嘗試搜尋檔案
                                let files = DriveApp.searchFiles(query);
                                let results = [];
                                let count = 0;
                                while (files.hasNext() && count < 40) {
                                    let f = files.next();
                                    results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                                    count++;
                                }
                                
                                // 如果完全沒結果，嘗試只搜檔名 (有時候 fullText 在某些權限下會失效)
                                if (results.length === 0) {
                                    let titleQuery = `title contains '${safeKw}' and trashed = false`;
                                    let titleFiles = DriveApp.searchFiles(titleQuery);
                                    while (titleFiles.hasNext() && count < 40) {
                                        let f = titleFiles.next();
                                        results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                                        count++;
                                    }
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    data: results.length > 0 ? results : "未找到符合條件的檔案或資料夾。"
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
                            
                        case "google_search":
                        case "search_web":
                            try {
                                let jinaApiKey = PropertiesService.getScriptProperties().getProperty('JINA_API_KEY');
                                if (jinaApiKey === "undefined" || jinaApiKey === "null" || !jinaApiKey) jinaApiKey = null;
                                
                                const options = { 
                                    muteHttpExceptions: true, 
                                    headers: { 
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                        "X-With-Links-Summary": "true"
                                    } 
                                };
                                if (jinaApiKey) options.headers["Authorization"] = "Bearer " + jinaApiKey;
                                
                                let query = args.query.trim();
                                let searchResult = "";
                                
                                // 策略 A: Jina Search (s.jina.ai)
                                try {
                                    let res = UrlFetchApp.fetch("https://s.jina.ai/" + encodeURIComponent(query), options);
                                    let status = res.getResponseCode();
                                    if (status === 200) {
                                        searchResult = res.getContentText();
                                    } else if (status === 401 || status === 403 || status === 429) {
                                        // 401/403/429 備援：去掉 Key 再試一次
                                        let opt2 = { ...options, headers: { ...options.headers } };
                                        delete opt2.headers["Authorization"];
                                        res = UrlFetchApp.fetch("https://s.jina.ai/" + encodeURIComponent(query), opt2);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    }
                                } catch(e) {}
                                
                                // 策略 B: 針對博客來特化的搜尋連結
                                if (!searchResult && (query.includes("博客來") || query.includes("書"))) {
                                    try {
                                        const booksUrl = "https://search.books.com.tw/search/query/key/" + encodeURIComponent(query.replace(/博客來/g, ""));
                                        let res = UrlFetchApp.fetch("https://r.jina.ai/" + booksUrl, options);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    } catch(e) {}
                                }
                                
                                // 策略 C: 最終備援 - 直接用 Reader 讀取 Google 搜尋頁面
                                if (!searchResult) {
                                    try {
                                        const googleUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
                                        let res = UrlFetchApp.fetch("https://r.jina.ai/" + googleUrl, options);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    } catch(e) {}
                                }
                                
                                if (searchResult) {
                                    toolResult = { status: "success", data: searchResult.substring(0, 35000) };
                                } else {
                                    toolResult = { status: "error", error_message: "搜尋服務暫時無法使用。建議直接輸入網址進行讀取。" };
                                }
                            } catch(e) { toolResult = { status: "error", error_message: `搜尋底層發生錯誤: ${e.toString()}` }; }
                            break;

                        case "read_web_page":
                            try {
                                const jinaApiKey = PropertiesService.getScriptProperties().getProperty('JINA_API_KEY');
                                const targetUrl = args.url.trim();
                                
                                // 嘗試使用 Jina Reader (優先)
                                const jinaOptions = { 
                                    muteHttpExceptions: true, 
                                    headers: { 
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                        "X-Return-Format": "markdown",
                                        "X-With-Images-Summary": "true"
                                    } 
                                };
                                if (jinaApiKey) {
                                    jinaOptions.headers["Authorization"] = "Bearer " + jinaApiKey;
                                }
                                
                                let response = UrlFetchApp.fetch("https://r.jina.ai/" + targetUrl, jinaOptions);
                                let status = response.getResponseCode();
                                let contentText = "";
                                
                                // 若 Jina 成功且內容長度足夠
                                if (status === 200 && response.getContentText().length > 200) {
                                    contentText = response.getContentText();
                                } else {
                                    // 備用方案：直接抓取
                                    const directOptions = {
                                        muteHttpExceptions: true,
                                        headers: {
                                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
                                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
                                        }
                                    };
                                    response = UrlFetchApp.fetch(targetUrl, directOptions);
                                    status = response.getResponseCode();
                                    
                                    if (status === 200) {
                                        let html = response.getContentText();
                                        html = html.replace(/<(script|style|nav|footer|header|aside|iframe|canvas)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, ' ');
                                        const mainMatch = html.match(/<(main|article|div id="content"|div class="main")[^>]*>([\s\S]*?)<\/\1>/i);
                                        const source = mainMatch ? mainMatch[2] : html;
                                        contentText = source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                                    } else {
                                        throw new Error(`Jina Error (${status}) & Direct Fetch Error (${status})。`);
                                    }
                                }

                                let finalContent = `【系統強制指令：以下為網頁擷取的真實內容。】\n\n網址：${targetUrl}\n---\n${contentText.substring(0, 35000)}`;
                                toolResult = { status: "success", data: finalContent };
                            } catch(e) {
                                toolResult = { 
                                    status: "error", 
                                    error_message: `網頁穿透失敗: ${e.toString()}。建議：請 AI 嘗試搜尋其他來源網址。` 
                                };
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

                        case "generate_art":
                            try {
                                let blob = fetchAIImage(args.prompt, config.apiKey, config.artistModel, args.aspectRatio || "1:1");
                                if (typeof blob === 'string' && blob.startsWith("ERROR:")) {
                                    toolResult = { status: "error", error_message: blob.replace("ERROR:", "") };
                                } else if (blob) {
                                    finalImage = Utilities.base64Encode(blob.getBytes());
                                    finalMime = "image/png";
                                    toolResult = { isTerminal: true, reply: `🎨 **圖像已根據您的要求繪製完成！**\n\n*(提示詞：${args.prompt})*` };
                                } else {
                                    throw new Error("生成失敗，未獲取到影像資料。");
                                }
                            } catch(e) { toolResult = { status: "error", error_message: `繪圖失敗: ${e.toString()}` }; }
                            break;

                        case "create_presentation":
                            let themeToUse = PPT_THEMES['modern_blue'];
                            try {
                                if (args.customColors) {
                                    let rawC = args.customColors;
                                    if (typeof rawC === 'string') {
                                        try { rawC = JSON.parse(rawC.replace(/```json/gi, '').replace(/```/g, '').trim()); } catch(e) {}
                                    }
                                    if (typeof rawC === 'object') {
                                        themeToUse = { 
                                            colors: { 
                                                background: rawC.background || rawC.bg || "#0f172a", 
                                                text: rawC.text || "#f8fafc", 
                                                accent: rawC.accent || "#38bdf8", 
                                                shape: rawC.shape || "#1e293b" 
                                            } 
                                        };
                                    }
                                }
                            } catch(e) { console.error("顏色解析失敗", e); }
                            
                            let parsedData = [];
                            try {
                                let rawS = args.slidesData;
                                if (typeof rawS === 'string') {
                                    try { rawS = JSON.parse(rawS.replace(/```json/gi, '').replace(/```/g, '').trim().replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ')); } catch(e) {}
                                }
                                if (Array.isArray(rawS)) {
                                    parsedData = rawS;
                                } else {
                                    toolResult = { isTerminal: true, reply: "⚠️ **簡報建立失敗**\n\nAI 生成的簡報資料格式無效 (不是陣列)。請嘗試重新生成或簡化指令。" }; break;
                                }
                            } catch(e) { 
                                toolResult = { isTerminal: true, reply: `⚠️ **簡報建立失敗**\n\n簡報資料格式錯誤，無法解析內容：\n${e.toString()}` }; break; 
                            }
                            
                            toolResult = { 
                                isTerminal: true, 
                                reply: `✨ **互動式網頁簡報已生成！**\n\n您可以直接在畫面中點擊文字進行修改。若需匯出為真正的 Google 簡報，請點擊畫面右上角的「匯出 Google 簡報」按鈕。`,
                                html_presentation_data: {
                                    topic: args.topic,
                                    theme: themeToUse,
                                    style: args.shapeStyle || 'minimalist',
                                    slides: parsedData
                                }
                            };
                            break;
                        case "update_presentation":
                            let presIdMatch = args.presentationUrl.match(/[-\w]{25,}/);
                            if (!presIdMatch) { toolResult = { status: "error", error_message: "無法辨識的簡報網址" }; break; }
                            
                            let updTheme = PPT_THEMES['modern_blue'];
                            try {
                                if (args.customColors) {
                                    const rawC = typeof args.customColors === 'string' ? JSON.parse(args.customColors.replace(/```json/gi, '').replace(/```/g, '').trim()) : args.customColors;
                                    updTheme = { colors: { background: rawC.background || rawC.bg || "#0f172a", text: rawC.text || "#f8fafc", accent: rawC.accent || "#38bdf8", shape: rawC.shape || "#1e293b" } };
                                }
                            } catch(e) { console.warn("更新配色解析失敗", e); }
                            
                            let processedUpdData = [];
                            try {
                                if (typeof args.slidesData === 'string') {
                                    let cleanS = args.slidesData.replace(/```json/gi, '').replace(/```/g, '').trim();
                                    processedUpdData = JSON.parse(cleanS.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' '));
                                } else if (Array.isArray(args.slidesData)) {
                                    processedUpdData = args.slidesData;
                                } else {
                                    toolResult = { isTerminal: true, reply: "⚠️ **簡報更新失敗**\n\nAI 生成的簡報資料格式無效 (不是陣列)。" }; break;
                                }
                            } catch(e) { 
                                toolResult = { isTerminal: true, reply: `⚠️ **簡報更新失敗**\n\n簡報資料格式錯誤，無法解析 JSON：\n${e.toString()}` }; break;
                            }

                            updateGeometricSlides(presIdMatch[0], args.action, processedUpdData, updTheme, args.shapeStyle || 'minimalist', config.configData.autoImageEnabled, config.apiKey, config.artistModel);
                            
                            let actionVerb = (String(args.action).toLowerCase().trim() === 'overwrite') ? "覆寫" : "擴充";
                            toolResult = { 
                                isTerminal: true, 
                                reply: `📊 **簡報${actionVerb}完畢！**\n\n已成功將 ${processedUpdData.length} 頁內容同步至簡報中。\n🔗 [點擊開啟驗證](https://docs.google.com/presentation/d/${presIdMatch[0]}/edit)`,
                                html_presentation_data: {
                                    topic: "更新後的簡報",
                                    theme: updTheme,
                                    style: args.shapeStyle || 'minimalist',
                                    slides: processedUpdData
                                }
                            };
                            break;
                            
                        case "execute_dynamic_tool":
                            toolResult = { 
                                isTerminal: true, 
                                reply: `✨ **動態工具「${args.tool_name}」已合成並啟動！**\n\n功能：${args.description}\n\n您可以直接在畫面中操作此工具。`,
                                html_artifact_data: {
                                    name: args.tool_name,
                                    description: args.description,
                                    code: args.html_code
                                }
                            };
                            break;
                            
                        default:
                            toolResult = { status: "success", reply: `工具 ${fnName} 已處理` };
                    }
                } catch (e) { toolResult = { status: "error", error_message: e.toString() }; }

                if (toolResult.isTerminal) { 
                    let combinedReply = aiTextGenerated ? (aiTextGenerated + "\n\n---\n\n" + toolResult.reply) : toolResult.reply;
                    return { reply: combinedReply, model: "Agent-Executor", image: finalImage, mime: finalMime, html_presentation: toolResult.html_presentation_data || null, html_artifact: toolResult.html_artifact_data || null }; 
                }
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
    if (finalReply && !finalImage) { finalReply = performInnerQALoop(finalReply, config.apiKey, false); }
    
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
            const msg = hist[i]; let text = msg.text || ""; 
            if (msg.html_presentation) text += `\n\n【系統紀錄：已生成的簡報 JSON 內容 (供修改參考)】\n${JSON.stringify(msg.html_presentation).substring(0, 15000)}`;
            if (!text.trim()) continue;
            if (charCount + text.length > MAX_CHARS) break;
            let r = (msg.role === 'ai') ? 'model' : 'user'; geminiHistory.unshift({ role: r, content: text }); charCount += text.length;
        }
        cache.put(cacheKey, JSON.stringify(geminiHistory), 21600); return geminiHistory;
    } catch(e) { return []; }
}

function logToFirebaseAndCache(db, wsName, sessionId, userMsg, aiReply, htmlPresentation = null, htmlArtifact = null) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
        let session = db.get("sessions", sessionId);
        if (!session) { session = { workspace: wsName, session_id: sessionId, title: userMsg ? userMsg.substring(0, 25) : "新對話", pinned: false, history_json: [] }; }
        let hist = []; if (session.history_json) { try { hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json); } catch(e) {} }
        if (userMsg) hist.push({ role: "user", text: userMsg }); 
        if (aiReply) {
            const aiMsg = { role: "ai", text: aiReply };
            if (htmlPresentation) aiMsg.html_presentation = htmlPresentation;
            if (htmlArtifact) aiMsg.html_artifact = htmlArtifact;
            hist.push(aiMsg);
        }
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

function handleSystemMode(payload, ss, wsName, db, apiKey) {
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
                const pid = createGeometricSlides(payload.topic, sData, payload.theme || PPT_THEMES['modern_blue'], payload.style || 'minimalist', isAutoImage, apiKey, "gemini-3.1-flash-image-preview");
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

function addMaterialIcon(slide, iconName, x, y, size, colorHex) {
    if (!iconName) return;
    try {
        let safeName = iconName.trim().toLowerCase().replace(/-/g, '_').split(' ')[0];
        const map = {
            "idea": "lightbulb", "target": "ads_click", "goal": "flag", "time": "schedule", "people": "groups", "user": "person",
            "check": "check_circle", "success": "task_alt", "warning": "warning", "error": "error", "data": "bar_chart", "chart": "show_chart",
            "money": "attach_money", "document": "description", "file": "insert_drive_file", "image": "image", "video": "movie",
            "book": "menu_book", "brain": "psychology", "heart": "favorite", "location": "location_on", "world": "public",
            "key": "vpn_key", "lock": "lock", "unlock": "lock_open", "shield": "security", "cloud": "cloud", "mail": "mail",
            "phone": "phone", "chat": "chat", "message": "message", "link": "link", "share": "share", "download": "download",
            "presentation": "co_present", "team": "group_work", "handshake": "handshake", "award": "emoji_events", "star": "star"
        };
        safeName = map[safeName] || safeName;
        
        let shape = slide.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, size + 10, size + 10);
        shape.getBorder().setTransparent();
        shape.getFill().setTransparent();
        shape.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
        let textRange = shape.getText();
        textRange.setText(safeName);
        textRange.getTextStyle().setFontFamily("Material Icons");
        textRange.getTextStyle().setFontSize(size);
        textRange.getTextStyle().setForegroundColor(colorHex);
        textRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    } catch(e) {}
}

function fetchWebImage(keyword) {
    // 優先使用 Pixabay 獲取高質感現代照片
    const pixabayKey = "4845800-e5965ba23d7d985fa9f2b3f01";
    try {
        const safeKeyword = encodeURIComponent(keyword.trim());
        const pbUrl = `https://pixabay.com/api/?key=${pixabayKey}&q=${safeKeyword}&image_type=photo&per_page=3&safesearch=true`;
        const pbRes = UrlFetchApp.fetch(pbUrl, { muteHttpExceptions: true });
        if (pbRes.getResponseCode() === 200) {
            const pbData = JSON.parse(pbRes.getContentText());
            if (pbData.hits && pbData.hits.length > 0) {
                const imgRes = UrlFetchApp.fetch(pbData.hits[0].largeImageURL, { muteHttpExceptions: true });
                if (imgRes.getResponseCode() === 200) return imgRes.getBlob();
            }
        }
    } catch (e) { console.warn("Pixabay fetch failed", e); }

    // 若 Pixabay 無結果 (例如冷僻歷史人物)，退而求其次使用維基共享資源
    try {
        const safeKeyword = encodeURIComponent(keyword.trim());
        const wmUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${safeKeyword}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&format=json`;
        const wmRes = UrlFetchApp.fetch(wmUrl, { muteHttpExceptions: true });
        if (wmRes.getResponseCode() === 200) {
            const data = JSON.parse(wmRes.getContentText());
            if (data.query && data.query.pages) {
                const firstPageId = Object.keys(data.query.pages)[0];
                const imageInfo = data.query.pages[firstPageId].imageinfo;
                if (imageInfo && imageInfo.length > 0 && imageInfo[0].url) {
                    const imgRes = UrlFetchApp.fetch(imageInfo[0].url, { muteHttpExceptions: true });
                    if (imgRes.getResponseCode() === 200) return imgRes.getBlob();
                }
            }
        }
    } catch (e) { console.warn("Wikimedia fetch failed", e); }
    return null;
}

function appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel) {
    let mainShape = SlidesApp.ShapeType.RECTANGLE; let coverShape = SlidesApp.ShapeType.ELLIPSE; let isMinimal = (style === 'minimalist'); let alphaMod = (style === 'layered') ? 0.3 : 1;
    if (style === 'rounded') { mainShape = SlidesApp.ShapeType.ROUND_RECTANGLE; coverShape = SlidesApp.ShapeType.ROUND_RECTANGLE; } else if (style === 'cyber') { mainShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; coverShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; } else if (style === 'dynamic') { mainShape = SlidesApp.ShapeType.PARALLELOGRAM; coverShape = SlidesApp.ShapeType.PARALLELOGRAM; }

    slidesData.forEach((d, i) => {
        const slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        const slideColors = theme.colors || theme; // 相容性處理
        slide.getBackground().setSolidFill(slideColors.background || slideColors.bg || "#ffffff");
        let layoutType = (i === 0) ? 'cover' : (d.layout || 'standard_list');
        let imgBlob = null; let keyword = d.imageKeyword || d.title || "presentation";
        const needsLargeImage = ['cover', 'image_right', 'image_left', 'image_top', 'image_bottom', 'profile_quote', 'split_column', 'standard_list'].includes(layoutType);

        if (enableAutoImage) {
            if (needsLargeImage && keyword) {
                if (d.imageSource !== 'ai') {
                    let result = fetchWebImage(keyword);
                    if (result) imgBlob = result;
                }
                if (!imgBlob) {
                    Utilities.sleep(4000); let ratio = (layoutType === 'profile_quote') ? "1:1" : "16:9";
                    let result = fetchAIImage(`Professional presentation slide asset, high quality photography, no text, ${keyword}`, apiKey, artistModel, ratio);
                    if (result && typeof result !== 'string') imgBlob = result;
                }
            }
        }
        
        let safeContent = d.content || (d.points && Array.isArray(d.points) ? d.points.join('\n') : "");
        const c = theme.colors || theme; // 捷徑
        const c_bg = c.background || c.bg || "#ffffff";
        const c_text = c.text || "#000000";
        const c_accent = c.accent || "#38bdf8";
        const c_shape = c.shape || "#f1f5f9";

        let titleText = d.title || ""; let eyebrow = d.label || "";
        if (!eyebrow && titleText.match(/【(.*?)】/)) { eyebrow = titleText.match(/【(.*?)】/)[0]; titleText = titleText.replace(eyebrow, '').trim(); }

        switch(layoutType) {
            case 'cover':
            case 'title':
                if (imgBlob) { 
                    try { slide.insertImage(imgBlob, 0, 0, 720, 405); drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, c_bg, 0.75); } catch(e) {} 
                } else {
                    addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "co_present", 360-60, 160, 120, c_accent);
                }
                drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 360-15, 60, 30, 4, c_accent, 1);
                addText(slide, eyebrow.replace(/[【】]/g, ''), 210, 80, 300, 30, c_accent, 16, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, titleText || "未命名標題", 110, 140, 500, 100, c_text, 42, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, d.subtitle || safeContent, 160, 260, 400, 50, c_accent, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, "Agent Generated Editorial", 260, 370, 200, 20, c_text, 10, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'hero_quote':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, safeContent || slide.subtitle || '金句內容', 80, 120, 560, 160, c_text, 36, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, "— " + (titleText || '講者'), 160, 300, 400, 40, c_accent, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'stepper':
            case 'timeline':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "發展歷程", 50, 70, 620, 40, c_text, 28, true);
                if (d.gridItems && Array.isArray(d.gridItems)) {
                    let tCount = Math.min(d.gridItems.length, 4);
                    let tWidth = 620 / tCount;
                    drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 160, 620, 2, c_accent, 0.3);
                    d.gridItems.forEach((item, idx) => {
                        if (idx >= 4) return;
                        let tx = 50 + (idx * tWidth);
                        drawShape(slide, SlidesApp.ShapeType.ELLIPSE, tx + 10, 155, 12, 12, c_accent, 1);
                        addText(slide, item.title, tx, 180, tWidth-10, 40, c_accent, 18, true);
                        addText(slide, item.content, tx, 220, tWidth-10, 100, c_text, 12, false);
                    });
                }
                break;
            case 'split_column':
            case 'image_left':
            case 'image_right':
                addMaterialIcon(slide, d.titleIconKeyword, 45, 40, 24, c_accent);
                if (imgBlob) {
                    try {
                        if (layoutType === 'image_left') {
                            slide.insertImage(imgBlob, 0, 0, 320, 405);
                            addText(slide, eyebrow, 350, 40, 320, 30, c_accent, 14, true);
                            addText(slide, titleText, 350, 80, 320, 100, c_text, 32, true);
                            addText(slide, safeContent, 350, 180, 320, 180, c_text, 14, false);
                        } else if (layoutType === 'image_right') {
                            slide.insertImage(imgBlob, 400, 0, 320, 405);
                            addText(slide, eyebrow, 50, 40, 320, 30, c_accent, 14, true);
                            addText(slide, titleText, 50, 80, 320, 100, c_text, 32, true);
                            addText(slide, safeContent, 50, 180, 320, 180, c_text, 14, false);
                        } else { // split_column with background image
                            slide.insertImage(imgBlob, 0, 0, 720, 405);
                            drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, c_bg, 0.85);
                            addText(slide, eyebrow, 50, 40, 300, 30, c_accent, 14, true);
                            addText(slide, titleText || "深度分析", 50, 80, 250, 120, c_text, 36, true);
                            addText(slide, d.left || d.content || "左側說明", 50, 220, 260, 150, c_text, 14, false);
                            drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 340, 60, 2, 300, c_accent, 0.3);
                            let rContent = d.right || (d.points && d.points.length > 0 ? d.points.map(p => "■  " + p).join('\n\n') : "右側內容");
                            addText(slide, rContent, 370, 70, 300, 300, c_accent, 16, false);
                        }
                    } catch(e) {}
                } else {
                    // 圖標增強模式：無圖時，使用大尺寸向量圖標填補視覺空缺
                    if (layoutType === 'image_left') {
                        addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "image", 100, 150, 120, c_accent);
                        addText(slide, eyebrow, 350, 40, 320, 30, c_accent, 14, true);
                        addText(slide, titleText, 350, 80, 320, 100, c_text, 32, true);
                        addText(slide, safeContent, 350, 180, 320, 180, c_text, 14, false);
                    } else if (layoutType === 'image_right') {
                        addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "image", 500, 150, 120, c_accent);
                        addText(slide, eyebrow, 50, 40, 320, 30, c_accent, 14, true);
                        addText(slide, titleText, 50, 80, 320, 100, c_text, 32, true);
                        addText(slide, safeContent, 50, 180, 320, 180, c_text, 14, false);
                    } else {
                        addText(slide, eyebrow, 50, 40, 300, 30, c_accent, 14, true);
                        addText(slide, titleText || "深度分析", 50, 80, 250, 120, c_text, 36, true);
                        addText(slide, d.left || d.content || "左側說明", 50, 220, 260, 150, c_text, 14, false);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 340, 60, 2, 300, c_accent, 0.3);
                        let rc = d.right || (d.points && d.points.length > 0 ? d.points.map(p => "■  " + p).join('\n\n') : "右側內容");
                        addText(slide, rc, 370, 70, 300, 300, c_accent, 16, false);
                    }
                }
                break;
            case 'card_deck':
            case 'icon_grid':
            case 'grid':
                addMaterialIcon(slide, d.titleIconKeyword, 45, 30, 24, c_accent);
                addText(slide, eyebrow, 50, 30, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "核心要素", 50, 60, 620, 40, c_text, 28, true);
                if (d.gridItems && Array.isArray(d.gridItems) && d.gridItems.length > 0) {
                    let tCount = Math.min(d.gridItems.length, 4);
                    let spacing = 20; let tWidth = (620 - (spacing * (tCount - 1))) / tCount;
                    d.gridItems.forEach((item, idx) => {
                        if (idx >= 4) return;
                        let x = 50 + idx * (tWidth + spacing);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, x, 130, tWidth, 4, c_accent, 1);
                        addMaterialIcon(slide, item.iconKeyword || 'check_circle', x, 140, 20, c_accent);
                        addText(slide, item.title, x + 30, 140, tWidth - 30, 30, c_accent, 16, true);
                        addText(slide, item.content, x, 180, tWidth, 150, c_text, 12, false);
                    });
                }
                break;
            case 'big_data':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "關鍵數據", 50, 70, 620, 40, c_text, 28, true);
                addText(slide, d.value || (d.points && d.points[0] ? d.points[0] : "99%"), 50, 130, 620, 150, c_accent, 86, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, safeContent || "數據背景說明", 50, 300, 620, 50, c_text, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'standard_list':
            default:
                addMaterialIcon(slide, d.titleIconKeyword, 45, 45, 24, c_accent);
                if (imgBlob) {
                    try {
                        slide.insertImage(imgBlob, 450, 60, 250, 300);
                        addText(slide, eyebrow, 50, 40, 380, 30, c_accent, 14, true);
                        addText(slide, titleText || "核心摘要", 50, 70, 380, 40, c_text, 32, true);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 120, 60, 4, c_accent, 1);
                        let lc = (d.points && Array.isArray(d.points) && d.points.length > 0) ? d.points.map(p => "■  " + p).join('\n\n') : (safeContent || "【系統提示：AI 未生成內文】");
                        addText(slide, lc, 50, 150, 380, 220, c_text, 14, false);
                    } catch(e) {}
                } else {
                    // 圖標增強模式：右側改為大圖標
                    addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "list", 520, 150, 100, c_accent);
                    addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                    addText(slide, titleText || "核心摘要", 50, 70, 620, 40, c_text, 32, true);
                    drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 120, 60, 4, c_accent, 1);
                    let listContent = (d.points && Array.isArray(d.points) && d.points.length > 0) ? d.points.map(p => "■  " + p).join('\n\n') : (safeContent || "【系統提示：AI 未生成內文】");
                    addText(slide, listContent, 50, 150, 600, 220, c_text, 16, false);
                }
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
    const safeAction = String(action || "").toLowerCase().trim();
    console.log(`[SlidesService] Action: ${safeAction}, ID: ${presentationId}, Slides: ${slidesData.length}`);
    
    if (safeAction === 'overwrite') {
        const tempSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        const slides = deck.getSlides();
        console.log(`[SlidesService] Overwriting... Removing ${slides.length - 1} old slides.`);
        slides.forEach(s => { if (s.getObjectId() !== tempSlide.getObjectId()) s.remove(); });
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
        tempSlide.remove(); 
    } else {
        console.log(`[SlidesService] Appending ${slidesData.length} new slides.`);
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
    }
    deck.saveAndClose();
}

function drawShape(s, t, x, y, w, h, c, a) { const sh = s.insertShape(t, x, y, w, h); sh.getBorder().setTransparent(); sh.getFill().setSolidFill(c, a); return sh; }
function addText(s, t, x, y, w, h, c, sz, b, align) { if(!t)return; const box = s.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, w, h); const txt = box.getText(); let safeT = String(t).replace(/\\n/g, '\n'); txt.setText(safeT).getTextStyle().setFontSize(sz).setForegroundColor(c).setBold(b); if(align) txt.getParagraphStyle().setParagraphAlignment(align); return box; }

/**
 * 插入 Google 原生 Material Icons (向量字體版)
 */
function addMaterialIcon(slide, keyword, x, y, size, color) {
    const iconCode = mapKeywordToIcon(keyword);
    // 放大容器避免圖標被切斷，並啟用垂直居中
    const box = slide.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, size * 2, size * 2);
    const txt = box.getText();
    txt.setText(iconCode);
    const style = txt.getTextStyle();
    style.setFontSize(size);
    style.setForegroundColor(color);
    style.setFontFamily("Material Icons"); 
    box.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
    return box;
    return box;
}

const ICON_MAP = {
    "image": "image", "photo": "photo_camera", "nature": "landscape", "scenery": "filter_hdr",
    "people": "group", "success": "emoji_events", "idea": "lightbulb", "check": "check_circle",
    "warning": "warning", "info": "info", "question": "help", "star": "star",
    "target": "track_changes", "growth": "trending_up", "money": "payments", "tech": "memory",
    "travel": "flight", "food": "restaurant", "health": "medical_services", "education": "school",
    "business": "business_center", "settings": "settings", "home": "home", "search": "search",
    "time": "schedule", "data": "bar_chart", "list": "format_list_bulleted", "map": "map",
    "history": "history", "future": "auto_awesome", "link": "link", "cloud": "cloud",
    "shield": "shield", "lock": "lock", "key": "key", "person": "person", "mail": "mail"
};

function mapKeywordToIcon(kw) {
    if (!kw) return "circle";
    const low = kw.toLowerCase().trim();
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (low.includes(key)) return icon;
    }
    return "circle"; // 預設圖標
}

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