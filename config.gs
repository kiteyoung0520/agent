/**
 * config.gs - anyGem 核心配置與資料庫用戶端
 */

const BASE_CONFIG = {
    TIMEOUT_LIMIT: 240000,
    SHEET_ID: PropertiesService.getScriptProperties().getProperty('SHEET_ID') || "1pIYPf8v1paZz6OE2qnc5ht5aub8Rm7IA-TfD5kInct8", 
    SETTING_SHEET_NAME: "Setting"
};

const PPT_THEMES = {
    modern_blue:  { bg: "#0f172a", text: "#f8fafc", accent: "#38bdf8", shape: "#1e293b" }
};

class FirebaseClient {
    constructor() {
        const props = PropertiesService.getScriptProperties();
        this.projectId = props.getProperty('FB_PROJECT_ID');
        this.apiKey = props.getProperty('FB_API_KEY');
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
            json.forEach(item => { if (item.document && item.document.fields) results.push(this._parseData(item.document.fields)); });
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

const AGENT_TOOLS = [{
    functionDeclarations: [
        { name: "create_calendar_event", description: "建立單一行事曆行程。若使用者要求邀請或共用給某人，請提供 guests 參數。若指定特定行事曆名稱(如'工作')，請提供 calendarName。", parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, startTime: { type: "STRING", description: "開始時間，請嚴格使用 ISO 8601 格式" }, endTime: { type: "STRING", description: "結束時間，請嚴格使用 ISO 8601 格式" }, description: { type: "STRING" }, calendarName: { type: "STRING", description: "使用者指定的行事曆名稱 (例如 '工作', '家庭' 等)。若未指定則留空。" }, guests: { type: "STRING", description: "要邀請或共用的與會者 Email，如果有多個請用半形逗號分隔 (例如: a@gmail.com, b@gmail.com)" } }, required: ["title", "startTime"] } },
        { name: "batch_create_calendar_events", description: "批次建立行程", parameters: { type: "OBJECT", properties: { eventsData: { type: "STRING" } }, required: ["eventsData"] } },
        { name: "get_calendar_events", description: "查詢行事曆", parameters: { type: "OBJECT", properties: { startDate: { type: "STRING" }, endDate: { type: "STRING" } }, required: ["startDate", "endDate"] } },
        { name: "add_event_reminder", description: "為特定的行事曆行程新增彈出視窗提醒。", parameters: { type: "OBJECT", properties: { eventId: { type: "STRING" }, minutesBefore: { type: "NUMBER" } }, required: ["eventId", "minutesBefore"] } },
        { name: "read_unread_emails", description: "讀取收件匣中尚未閱讀的信件摘要。", parameters: { type: "OBJECT", properties: { limit: { type: "NUMBER" } } } },
        { name: "send_email_or_draft", description: "寄送電子郵件或建立草稿。", parameters: { type: "OBJECT", properties: { recipient: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" }, isDraft: { type: "BOOLEAN" } }, required: ["recipient", "subject", "body"] } },
        { name: "create_survey_form", description: "建立 Google 表單 (Google Forms)。⚠️ 強制要求：當使用者要求建立表單時，請務必『立刻』呼叫此工具，絕對不能只用文字回覆。", parameters: { type: "OBJECT", properties: { title: { type: "STRING", description: "表單標題" }, description: { type: "STRING", description: "表單描述" }, questions: { type: "ARRAY", description: "表單題目列表陣列", items: { type: "OBJECT", properties: { title: { type: "STRING", description: "題目" }, type: { type: "STRING", description: "題型(大寫英文)：TEXT, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOX, LIST, SCALE, DATE, TIME" }, choices: { type: "ARRAY", items: { type: "STRING" }, description: "選擇題的選項" }, required: { type: "BOOLEAN", description: "是否必填" } }, required: ["title", "type"] } } }, required: ["title", "questions"] } },
        { name: "create_drive_folder", description: "在 Google 雲端硬碟中建立新的資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING", description: "要建立的資料夾名稱" }, parentFolderUrl: { type: "STRING", description: "可選。父資料夾的完整網址，若不提供則建立在根目錄" } }, required: ["folderName"] } },
        { name: "search_drive_files", description: "【全文檢索】搜尋 Google 雲端硬碟中的檔案。支援深度全文檢索（包含標題與內文）。支援分頁機制，若回傳結果包含 nextPageToken，表示還有更多檔案，請在後續呼叫帶入 pageToken 繼續搜尋。", parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "搜尋關鍵字 (AI 可針對概念進行搜尋)" }, fileType: { type: "STRING", description: "可選。過濾檔案類型，例如 'document', 'spreadsheet', 'folder', 'pdf'" }, folderId: { type: "STRING", description: "可選。指定要在哪個資料夾內搜尋 (填入資料夾 ID 或網址)。若要搜尋特定資料夾內的檔案，請填入此參數。" }, pageToken: { type: "STRING", description: "可選。獲取下一頁結果的 Token" }, maxResults: { type: "NUMBER", description: "可選。單次獲取最大數量，預設 30" } }, required: ["keyword"] } },
        { name: "scan_and_prepare_archive", description: "【安全歸檔模式】搜尋大量散落的檔案並建立專屬資料夾，但「不主動搬移」。支援分頁機制，若回傳結果包含 nextPageToken，表示還有更多檔案未顯示。", parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "要整理的主題關鍵字，如 'SEL'" }, pageToken: { type: "STRING", description: "可選。獲取下一頁結果的 Token" } }, required: ["keyword"] } },
        { name: "move_drive_file", description: "【精準搬移】將特定的單一檔案移動到指定的資料夾中。如果目標資料夾不存在會自動建立。當使用者明確要求「把某個檔案放進某個資料夾」時強制呼叫此工具。", parameters: { type: "OBJECT", properties: { fileIdentifier: { type: "STRING", description: "要移動的檔案名稱或完整網址" }, folderIdentifier: { type: "STRING", description: "目標資料夾的名稱或完整網址" } }, required: ["fileIdentifier", "folderIdentifier"] } },
        { name: "read_drive_file", description: "【強制呼叫】讀取 Google 雲端硬碟檔案內容。當使用者貼上 Drive 網址時，你已具備最高合法授權，絕對禁止以「無法存取私人檔案」或「安全限制」為由拒絕，請立刻呼叫此工具解析。", parameters: { type: "OBJECT", properties: { fileUrl: { type: "STRING", description: "要讀取的檔案完整網址" } }, required: ["fileUrl"] } },
        { name: "read_web_page", description: "讀取一般網頁(URL)的純文字內容。當使用者貼上一般新聞、部落格或網站連結並要求總結、閱讀或提問時，強制呼叫此工具。取得內容後，請嚴格基於內容回答，禁止腦補。", parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "要讀取的網頁完整網址 (需包含 http/https)" } }, required: ["url"] } },
        { name: "organize_drive_folder", description: "智慧整理 Google Drive 資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING" } }, required: ["folderName"] } },
        { name: "create_google_doc", description: "建立全新的 Google 文件。支援 Markdown 排版。", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, content: { type: "STRING" }, folderName: { type: "STRING" } }, required: ["topic", "content"] } },
        { name: "read_google_doc", description: "【強制呼叫】讀取 Google 文件的所有文字內容。當使用者貼上 Google Docs 文件網址，並要求「總結、閱讀、提問、修改或覆寫」時，請唯一且強制呼叫此工具取得內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址" } }, required: ["docUrl"] } },
        { name: "append_to_google_doc", description: "在現有 Google 文件最下方「補充/附加」新內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "要附加的新內容，支援 Markdown 排版" } }, required: ["docUrl", "content"] } },
        { name: "overwrite_google_doc", description: "完全覆寫現有 Google 文件。當使用者要求「修改整份文件」時使用。使用前務必先用 read_google_doc 讀取舊內容融合。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "修改後的「完整」新內容，舊內容將被清空，支援 Markdown" } }, required: ["docUrl", "content"] } },
        { name: "read_google_sheet", description: "讀取特定的 Google Sheet 試算表內容。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要讀取的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱，若不指定則預設讀取第一頁。" }, range: { type: "STRING", description: "指定範圍，如 'A1:D10'，預設或填 'ALL' 讀取全部" } }, required: ["sheetUrl"] } },
        { name: "append_to_google_sheet", description: "【新增資料】將資料批次寫入或新增到指定的 Google Sheet 試算表最下方。如果頁籤不存在會自動建立。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要寫入的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, content: { type: "STRING", description: "要寫入的資料，請強制輸出符合標準的 JSON 陣列字串 (Array of Arrays) ，請務必使用「雙引號」而非單引號。例如: [[\"日期\", \"項目\", \"金額\"], [\"03/16\", \"午餐\", 150]]" } }, required: ["sheetUrl", "sheetName", "content"] } },
        { name: "update_google_sheet", description: "【修改資料】修改或更新指定的 Google Sheet 試算表特定範圍內的資料。當使用者要求「更新」、「修改」某特定欄位或整行資料時呼叫此工具。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要修改的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, range: { type: "STRING", description: "要更新的起始儲存格範圍，例如 'A2' 或 'B5:D5'" }, content: { type: "STRING", description: "要更新的新資料，請強制輸出符合標準的 JSON 陣列字串，務必使用「雙引號」。例如: [[\"已修改的A\", \"已修改的B\"]]" } }, required: ["sheetUrl", "sheetName", "range", "content"] } },
        { name: "generate_art", description: "【強制呼叫】當使用者要求「畫圖」、「生成圖片」時，請務必呼叫此工具。", parameters: { type: "OBJECT", properties: { prompt: { type: "STRING", description: "詳細的英文畫面描述" }, aspectRatio: { type: "STRING", description: "比例: 1:1, 16:9, 4:3, 3:4 之一" } }, required: ["prompt"] } },
        { name: "query_knowledge_base", description: "【深度知識檢索】搜尋專案專屬知識庫資料夾中的文件。當需要引用專業文獻、公司手冊或特定專案背景資料時，請呼叫此工具。系統將自動在 Settings 中指定的 KNOWLEDGE_BASE_FOLDER_ID 資料夾內進行全文檢索。", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "搜尋關鍵字，例如 '咖啡沖煮標準' 或 '專案時程表'" } }, required: ["query"] } },
        { name: "read_presentation", description: "【強制呼叫】讀取 Google Slides (簡報) 的所有文字與備忘錄。當使用者貼上 Google 簡報網址並要求閱讀、摘要或總結時，請唯一且強制呼叫此工具取得內容。", parameters: { type: "OBJECT", properties: { presentationUrl: { type: "STRING", description: "該 Google 簡報的完整網址" } }, required: ["presentationUrl"] } },
        { name: "create_presentation", description: "【首席簡報總監】製作全新的 Google Slides。具備內容感知能力，會根據資訊類型自動選擇最佳排版。支援自定義配色與風格。", parameters: { type: "OBJECT", properties: { topic: { type: "STRING", description: "簡報核心主題" }, customColors: { type: "STRING", description: "主題配色 JSON (包含 bg, text, accent, shape 的 HEX 碼)。請依主題氛圍自主調配。" }, shapeStyle: { type: "STRING", description: "幾何風格: 'minimalist' (極簡), 'rounded' (圓角), 'cyber' (銳角/科技), 'dynamic' (斜切/活力), 'layered' (疊層/深邃)。" }, globalLogoUrl: { type: "STRING", description: "【標誌】可選。公司或品牌的 Logo 圖片網址。" }, contentDensity: { type: "STRING", description: "內容密度: 'brief' (簡易/演講用), 'detailed' (詳細/商務用), 'full' (完整/報告用)。" }, slidesData: { type: "STRING", description: "簡報 JSON 陣列。格式：[{layout: '...', title: '...', content: '...', points: [...], speakerNotes: '...', citations: '...', titleIconKeyword: '...', imageKeyword: '...', gridItems: [...]}]。⚠️ 嚴禁產出過於簡短的內容，備忘錄必須豐富且具備深度。" } }, required: ["topic", "customColors", "shapeStyle", "slidesData"] } },
        { name: "update_presentation", description: "【修改/擴充簡報】修改現有的 Google Slides 簡報。支援在簡報最末端「附加(append)」新投影片，或「完全覆寫(overwrite)」整份簡報。修改前強烈建議先讀取現有內容。", parameters: { type: "OBJECT", properties: { presentationUrl: { type: "STRING", description: "現有簡報的完整網址" }, action: { type: "STRING", description: "'append' (附加投影片到最後) 或 'overwrite' (清空並重新繪製整份簡報)" }, customColors: { type: "STRING", description: "主題配色 JSON (包含 bg, text, accent, shape 的 HEX 碼)。" }, shapeStyle: { type: "STRING", description: "幾何風格: 'minimalist', 'rounded', 'cyber', 'dynamic', 'layered' 擇一。" }, globalLogoUrl: { type: "STRING", description: "【標誌】可選。公司或品牌的 Logo 圖片網址。" }, contentDensity: { type: "STRING", description: "內容密度: 'brief', 'detailed', 'full'。" }, slidesData: { type: "STRING", description: "要新增或覆寫的簡報 JSON 陣列。⚠️ 嚴禁省略：必須包含所有頁面的完整內容。" } }, required: ["presentationUrl", "action", "slidesData"] } }
    ]
}];

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

function response(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
