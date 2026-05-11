/**
 * anyGem Backend v92.2 - ?�然語�??��???(Natural Language Edition) + 簡報讀?�修�?
 * ?��??��??�目�?
 * 1. [?���??��?幻覺修復] ?�格規�? AI ?�輸?�格式�?禁止?�接�?JSON ?��??�給使用?��?
 * 2. [?���?QA 機器人�??�] 修正 performInnerQALoop??
 * 3. [?�� ?�輯?��??�] 徹�?檢查並�??��??�工??100% 完整觸發??
 * 4. [?? 記憶修復] ?�含 logToFirebaseAndCache 修正??
 * 5. [?? 權�??��?] 移除 forceAuthSetup 護盾??
 * 6. [?? 表單???] create_survey_form Schema ?��???ARRAY 結�???
 * 7. [?�� ?��?路由] LINE ?��?觸發?��?clear?�、「新對話?��?置�??��?
 * 8. [?? 簡報精�?讀?�] ?��? read_presentation 工具，解�?AI 誤判 docs.google.com 網�??��?題�?
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
// ?? Firebase 輕�???REST ?�戶�?(?��??�試機制)
// ==========================================
class FirebaseClient {
    constructor() {
        const props = PropertiesService.getScriptProperties();
        this.projectId = props.getProperty('FB_PROJECT_ID');
        this.apiKey = props.getProperty('FB_API_KEY');
        
        if (!this.projectId || !this.apiKey) {
            console.error("Missing Firebase Credentials. 請�?設�??�本屬�?FB_PROJECT_ID ??FB_API_KEY??);
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
// 1. Agent 工具箱�?�?
// ==========================================
const AGENT_TOOLS = [{
    functionDeclarations: [
        { 
            name: "create_calendar_event", 
            description: "建�??��?行�??��?程。若使用?��?求�?請�??�用給�?人�?請�?�?guests ?�數?�若?��??��?行�??��?�?�?工�?')，�??��? calendarName??, 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    title: { type: "STRING" }, 
                    startTime: { type: "STRING", description: "?��??��?，�??�格使用 ISO 8601 ?��?" }, 
                    endTime: { type: "STRING", description: "結�??��?，�??�格使用 ISO 8601 ?��?" }, 
                    description: { type: "STRING" },
                    calendarName: { type: "STRING", description: "使用?��?定�?行�??��?�?(例�? '工�?', '家庭' �??�若?��?定�??�空?? },
                    guests: { type: "STRING", description: "要�?請�??�用?��??��?Email，�??��?多個�??��?形逗�??��? (例�?: a@gmail.com, b@gmail.com)" }
                }, 
                required: ["title", "startTime"] 
            } 
        },
        { name: "batch_create_calendar_events", description: "?�次建�?行�?", parameters: { type: "OBJECT", properties: { eventsData: { type: "STRING" } }, required: ["eventsData"] } },
        { name: "get_calendar_events", description: "?�詢行�???, parameters: { type: "OBJECT", properties: { startDate: { type: "STRING" }, endDate: { type: "STRING" } }, required: ["startDate", "endDate"] } },
        { name: "add_event_reminder", description: "?�特定�?行�??��?程新增�??��?窗�??��?, parameters: { type: "OBJECT", properties: { eventId: { type: "STRING" }, minutesBefore: { type: "NUMBER" } }, required: ["eventId", "minutesBefore"] } },
        { name: "read_unread_emails", description: "讀?�收件匣中�??�閱讀?�信件�?要�?, parameters: { type: "OBJECT", properties: { limit: { type: "NUMBER" } } } },
        { name: "send_email_or_draft", description: "寄送電子郵件�?建�??�稿??, parameters: { type: "OBJECT", properties: { recipient: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" }, isDraft: { type: "BOOLEAN" } }, required: ["recipient", "subject", "body"] } },
        
        { 
            name: "create_survey_form", 
            description: "建�? Google 表單 (Google Forms)?��?�?強制要�?：當使用?��?求建立表?��?，�??��??��??�』呼?�此工具，�?對�??�只?��?字�?覆�?, 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    title: { type: "STRING", description: "表單標�?" }, 
                    description: { type: "STRING", description: "表單?�述" }, 
                    questions: { 
                        type: "ARRAY", 
                        description: "表單題目?�表???", 
                        items: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING", description: "題目" },
                                type: { type: "STRING", description: "題�?(大寫?��?)：TEXT, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOX, LIST, SCALE, DATE, TIME" },
                                choices: { type: "ARRAY", items: { type: "STRING" }, description: "?��?題�??��?" },
                                required: { type: "BOOLEAN", description: "?�否必填" }
                            },
                            required: ["title", "type"]
                        }
                    } 
                }, 
                required: ["title", "questions"] 
            } 
        },
        
        { name: "create_drive_folder", description: "??Google ?�端硬�?中建立新?��??�夾??, parameters: { type: "OBJECT", properties: { folderName: { type: "STRING", description: "要建立�?資�?夾�?�? }, parentFolderUrl: { type: "STRING", description: "?�選?�父資�?夾�?完整網�?，若不�?供�?建�??�根?��?" } }, required: ["folderName"] } },
        
        { name: "search_drive_files", description: "?�全?�檢索】�?�?Google ?�端硬�?中�?檔�??�支?�深度全?�檢索�??�含標�??�內?��??�支?��??��??��??��??��??��???nextPageToken，表示�??�更多�?案�?請在後�??�叫帶入 pageToken 繼�??��???, parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "?��??�鍵�?(AI ?��?對�?念進�??��?)" }, fileType: { type: "STRING", description: "?�選?��?濾�?案�??��?例�? 'document', 'spreadsheet', 'folder', 'pdf'" }, folderId: { type: "STRING", description: "?�選?��?定�??�哪?��??�夾?��?�?(填入資�?�?ID ?�網?�)?�若要�?尋特定�??�夾?��?檔�?，�?填入此�??��? }, pageToken: { type: "STRING", description: "?�選?�獲?��?一?��??��? Token" }, maxResults: { type: "NUMBER", description: "?�選?�單次獲?��?大數?��??�設 30" } }, required: ["keyword"] } },
        { name: "scan_and_prepare_archive", description: "?��??�歸檔模式】�?尋大?�散?��?檔�?並建立�?屬�??�夾，�??��?主�??�移?�。支?��??��??��??��??��??��???nextPageToken，表示�??�更多�?案未顯示??, parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "要整?��?主�??�鍵字�?�?'SEL'" }, pageToken: { type: "STRING", description: "?�選?�獲?��?一?��??��? Token" } }, required: ["keyword"] } },
        
        { name: "move_drive_file", description: "?�精準搬移】�??��??�單一檔�?移�??��?定�?資�?夾中?��??�目標�??�夾不�??��??��?建�??�當使用?��?確�?求「�??�個�?案放?��??��??�夾?��?強制?�叫此工?��?, parameters: { type: "OBJECT", properties: { fileIdentifier: { type: "STRING", description: "要移?��?檔�??�稱?��??�網?�" }, folderIdentifier: { type: "STRING", description: "?��?資�?夾�??�稱?��??�網?�" } }, required: ["fileIdentifier", "folderIdentifier"] } },
        
        { name: "read_drive_file", description: "?�強?�呼?�】�???Google ?�端硬�?檔�??�容?�當使用?�貼�?Drive 網�??��?你已?��??�高�?法�?權�?絕�?禁止以「無法�??��?人�?案」�??��??��??�」為?��?絕�?請�??�呼?�此工具�????, parameters: { type: "OBJECT", properties: { fileUrl: { type: "STRING", description: "要�??��?檔�?完整網�?" } }, required: ["fileUrl"] } },

        { name: "read_web_page", description: "?�代?�人?�覽模�? (Agent Browser Mode)?�使?�整?��??�頭?�覽?��??�網?�。此工具?�穿??JavaScript ?��??�蟲機制（�??�客來、Amazon）。當?��??��?缺失 ISBN ?��??��?深度細�??��?強制?�叫此工?�進入?��??��??��?得內容�?，�??�格?�於?�容?��?，�?止腦補�?, parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "要�??��?網�?完整網�? (?�?�含 http/https)" } }, required: ["url"] } },
        { name: "google_search", description: "?�萬?��?尋�??�】�?尋全?�公?��?訊�??�?�新?�。當使用?��?求找尋�??�、�?較產?�、�??�現?�知識�?足�?，�??��??�叫此工?��?, parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "精確?��?尋�??��?" } }, required: ["query"] } },
        { name: "search_web", description: "?��??��?尋�??�】�??��? google_search，�??��?餘�??��?, parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "?��??�鍵�? } }, required: ["query"] } },

        { name: "organize_drive_folder", description: "?�慧?��? Google Drive 資�?夾�?, parameters: { type: "OBJECT", properties: { folderName: { type: "STRING" } }, required: ["folderName"] } },
        
        { name: "create_google_doc", description: "建�??�新??Google ?�件?�支??Markdown ?��???, parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, content: { type: "STRING" }, folderName: { type: "STRING" } }, required: ["topic", "content"] } },
        
        { name: "read_google_doc", description: "?�強?�呼?�】�???Google ?�件?��??��?字內容。當使用?�貼�?Google Docs ?�件網�?，並要�??�總結、閱讀?��??�、修?��?覆寫?��?，�??��?且強?�呼?�此工具?��??�容??, parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "�?Google ?�件?��??�網?�" } }, required: ["docUrl"] } },
        
        { name: "append_to_google_doc", description: "?�現??Google ?�件?�下方?��????��??�新?�容??, parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "�?Google ?�件?��??�網?�?? }, content: { type: "STRING", description: "要�??��??�內容�??�援 Markdown ?��?" } }, required: ["docUrl", "content"] } },
        { name: "overwrite_google_doc", description: "完全覆寫?��? Google ?�件?�當使用?��?求「修?�整份�?件」�?使用?�使?��??��??�用 read_google_doc 讀?��??�容?��???, parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "�?Google ?�件?��??�網?�?? }, content: { type: "STRING", description: "修改後�??��??�」新?�容，�??�容將被清空，支??Markdown" } }, required: ["docUrl", "content"] } },

        { name: "read_google_sheet", description: "讀?�特定�? Google Sheet 試�?表內容�?, parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要�??��?試�?表�??�網?�?? }, sheetName: { type: "STRING", description: "工�?�??�籤)?�稱，若不�?定�??�設讀?�第一?��? }, range: { type: "STRING", description: "?��?範�?，�? 'A1:D10'，�?設�?�?'ALL' 讀?�全?? } }, required: ["sheetUrl"] } },
        { name: "append_to_google_sheet", description: "?�新增�??�】�?資�??�次寫入?�新增到?��???Google Sheet 試�?表�?下方?��??��?籤�?存在?�自?�建立�?, parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要寫?��?試�?表�??�網?�?? }, sheetName: { type: "STRING", description: "工�?�??�籤)?�稱" }, content: { type: "STRING", description: "要寫?��?資�?，�?強制輸出符�?標�???JSON ???字串 (Array of Arrays) ，�??��?使用?��?引�??�而�??��??�。�?�? [[\"?��?\", \"?�目\", \"?��?\"], [\"03/16\", \"?��?\", 150]]" } }, required: ["sheetUrl", "sheetName", "content"] } },
        { name: "update_google_sheet", description: "?�修?��??�】修?��??�新?��???Google Sheet 試�?表特定�??�內?��??�。當使用?��?求「更?�」、「修?�」�??��?欄�??�整行�??��??�叫此工?��?, parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要修?��?試�?表�??�網?�?? }, sheetName: { type: "STRING", description: "工�?�??�籤)?�稱" }, range: { type: "STRING", description: "要更?��?起�??��??��??��?例�? 'A2' ??'B5:D5'" }, content: { type: "STRING", description: "要更?��??��??��?請強?�輸?�符?��?準�? JSON ???字串，�?必使?�「�?引�??�。�?�? [[\"已修?��?A\", \"已修?��?B\"]]" } }, required: ["sheetUrl", "sheetName", "range", "content"] } },

        { name: "generate_art", description: "?�強?�呼?�】當使用?��?求「畫?�」、「�??��??�」�?，�??��??�叫此工?��?, parameters: { type: "OBJECT", properties: { prompt: { type: "STRING", description: "詳細?�英?�畫?��?�? }, aspectRatio: { type: "STRING", description: "比�?: 1:1, 16:9, 4:3, 3:4 之�?" } }, required: ["prompt"] } },
        { name: "query_knowledge_base", description: "?��?專屬?��?�?(NotebookLM)??, parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
        
        { 
            name: "read_presentation", 
            description: "?�強?�呼?�】�???Google Slides (簡報) ?��??��?字�??��??�。當使用?�貼�?Google 簡報網�?並�?求閱讀?��?要�?總�??��?請唯一且強?�呼?�此工具?��??�容??, 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "�?Google 簡報?��??�網?�" } 
                }, 
                required: ["presentationUrl"] 
            } 
        },

        { 
            name: "create_presentation", 
            description: "?��?席簡?�總??��製作全?��? Google Slides?�具?�內容�??�能?��??�根?��?訊�??�自?�選?��?佳�??�。支?�自定義?�色?�風?��?, 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    topic: { type: "STRING", description: "簡報?��?主�?" }, 
                    customColors: { type: "OBJECT", description: "主�??�色 JSON (?�含 bg, text, accent, shape ??HEX �??��?依主題�??�自主調?��? }, 
                    shapeStyle: { type: "STRING", description: "幾�?風格: 'minimalist' (極簡), 'rounded' (?��?), 'cyber' (?��?/科�?), 'dynamic' (?��?/活�?), 'layered' (?�層/深�?)?? }, 
                    slidesData: { type: "ARRAY", items: { type: "OBJECT" }, description: "簡報 JSON ????�格式�?[{layout: 'cover|hero_quote|standard_list|split_column|card_deck|stepper|icon_grid|timeline|big_data', title: '標�?', content: '?��?', points: ['?��?'], left: '左�?', right: '?��?', value: '大數?��?, imageKeyword: '?��??�鍵�?, imageSource: 'ai' ??'web', gridItems: [{title:'標�?', content:'?�容', iconKeyword:'?��??�鍵�?}]}]?��?️�??��??�容?�徵?�選 layout?��?�?imageSource：若?�?�實歷史人物/?�景請填 'web'，若?�?�象/?��??��?請填 'ai'?? } 
                }, 
                required: ["topic", "customColors", "shapeStyle", "slidesData"] 
            } 
        },
        { 
            name: "update_presentation", 
            description: "?�修???��?簡報?�修?�現?��? Google Slides 簡報?�支?�在簡報?�?�端?��???append)?�新?�影?��??�「�??��?�?overwrite)?�整份簡?�。修?��?強�?建議?��??�現?�內容�?, 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "?��?簡報?��??�網?�" }, 
                    action: { type: "STRING", description: "'append' (?��??�影?�到?��? ??'overwrite' (清空並�??�繪製整份簡??" }, 
                    customColors: { type: "OBJECT", description: "主�??�色 JSON (?�含 bg, text, accent, shape ??HEX �??? }, 
                    shapeStyle: { type: "STRING", description: "幾�?風格: 'minimalist', 'rounded', 'cyber', 'dynamic', 'layered' ?��??? }, 
                    slidesData: { type: "ARRAY", items: { type: "OBJECT" }, description: "要新增�?覆寫?�簡??JSON ????�格式�? create_presentation?? } 
                }, 
                required: ["presentationUrl", "action", "slidesData"] 
            } 
        },
        { 
            name: "execute_dynamic_tool", 
            description: "?�Manus 級代碼執行器?�當?��?工具?��?滿足複�??�求�?如數?��??�、自定義計�??��??��??�表?��??�模?��??�使?�。AI ?�撰寫�?段�?裝好??HTML/JS/CSS 工具並在沙�?中執行。�?確�?�?��?�帶必�???CDN（�? Chart.js, Tailwind, D3.js）�?, 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    tool_name: { type: "STRING", description: "工具?�稱，�? '複利計�??? ??'?�售趨勢??" },
                    description: { type: "STRING", description: "工具?�能簡述" },
                    html_code: { type: "STRING", description: "完整且自洽�? HTML �?�� (?�含 CSS ??JS)?��??�是一?��??��? <html> 結�??��??��??�依賴?��?段�? }
                }, 
                required: ["tool_name", "description", "html_code"] 
            } 
        }
    ]
}];

// ==========================================
// DRY ?��?：共?��?系統大腦 Prompt ?��???
// ==========================================
function getSuperAgentPrompt(wsName, customRules) {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const days = ['?��???,'?��?一','?��?�?,'?��?�?,'?��???,'?��?�?,'?��???];
    const timeString = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} (${days[now.getDay()]}) ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `?��?對核心�??��??�空?��???
?�在?�實系統?��?�?{timeString} (?��?�?{tz})

你是一位全?�、嚴謹�?實�?求是??anyGem AI �??人�??�循 Manus 級別?��?尖代?�人作業標�? (Agent SOP)?��?不�??��?天�??�是一位能?�主規�??�執行、並交�?高�?質�??��??�全?��??��??��?

?��?��? Manus ?��?作業標�? (Agent SOP)?��?
你�??�在?��?複�?任�??��??�格?��?以�??�個�?段�??�維框架�?

?�段一：任?��???(Strategy Planning)
- **語�?�??**：深?��??�使?�者�??�含?�求、風?��?好�??�制??
- **?�段?�解**：�?複�?任�??��???4-10 ?�可?��??��??��???
- **主�?澄�?**：若?��?模�?，�?以�?字詢??(ask) 溝通�??��??�目?��???

?�段二�??��??�迭�?(Agent Loop)
- **?��??�推??*：在每次?�叫工具?��??��??�當?�進度 (Observation) ?��?一步�?輯�?
- **結�?評估**：工?�執行�?，�?估�??�是?��??��?段目標。若失�?，�??�診?�錯誤並?�試?�替�?��徑」�?

?�段三�??��?模�? (Specialized Modes)
- **WebDev 模�?**：�??��?式碼?��??��??�架構�?，�?精�?寫入 GitHub ??Sheet 資�?庫�?
- **Slides 模�?**：製作簡?��?，�?完�??�容深度?�究?��??��??��??�進入?��?流�???
- **Generate 模�?**：�??��??��??��?，�??��? Prompt ?�述，�?調用繪�?工具??
- **DeepResearch 模�?**：�??�電?��?如�?客�?）、學術�??��?深度資�??��??��??��??��?賴�?尋�??��??��??��??�執行「�??�內?�」�??�迴讀?��?程�?確�? ISBN?�價?�、細節規格等�???100% 準確??

?�段?��??�質?�管?�交�?(QC & Delivery)
- **資�??��?**：�?碎�??��?工具?�報資�?，整?�為結�??�、�?觀??Markdown ?��???
- **終極驗�?**：在交�??��??�後確認格式是?��?業、�???�否?�用??
- **?��??��?**：�?覆�?後�??��?上簡?��??��??��??��??��??��?件�?

?��?覺執行�?設�??��? (Execution Discipline)?��?
1. **?��??��? (Discussed Plan First)**：�??�在對話中�?使用?��?論�??�面規�?（�?如�?第�??�用?��??�主題色?�紫?��?，在?�叫 'create_presentation' ?�【�??�】嚴?�遵守。�?止使?��?設主題�?，�??��??��??��?討�?結�?計�??�色 JSON 填入 'customColors'??
2. **混�??��?引�? (Hybrid Image Engine)**：�??�簡?��? 'imageKeyword' 必�?填寫?��??�並且根?�內容性質決�? 'imageSource'�?
   - ?�為?��?實歷?�人??(如�?�??��?實風?�、歷?��?件」�?必�?設�? \`"imageSource": "web"\`??
   - ?�為?�抽象�?念、�??�?�、幾何�?形、未來�??��?必�?設�? \`"imageSource": "ai"\`??
3. **?�容保護 (Strict Content)**：�??�使?�者�?供�??��??��?案、�??�、數?��?必�? 100% 完整保�?並填?�簡?�中?��?對�?止自行�??��??��?止刪減�??�、�?止修?��?業�?語�?
4. **?��??�面 (Dynamic Layout)**：捨棄�??��??��??��??�容?�活?��? 'layout'??
   - ?�句/?��?/?��?：�???'hero_quote' (?�螢幕大�???
   - 多�?�??�色：�???'card_deck' (?��??��?) ??'icon_grid'??
   - 流�?/步�?/歷史：�???'stepper' ??'timeline'??
   - 對�?/?�缺點�?必用 'split_column'??
   - ?�撼?��?：�???'big_data'??
5. **?�色紀�?*�?customColors' ??JSON ?��?必�??�含：{"bg": "#...", "text": "#...", "accent": "#...", "shape": "#..."}?��?依�?主�?氛�?（�?：優?�、�??�?��??��??�主設�?高�?質�??��?
6. **資�??��?紀�?(Data Mining)**：當要�??��??��??�唯一?�」�??�精確性」�?資�?（�? ISBN?��??�、出?�社?��??��??��??��?禁止?��?�?\`search_web\` ?��??��?段。�?必�?�?1) ?��?尋�?得�??��?(2) ?��?清單中�??�鍵網�?，逐�??�叫 \`read_web_page\` ?�入?��?�?3) 彙整?��??�實?��??�若?�次?��??�無法�??�全?��?請�?實�??�已?��??�部?��?絕�?禁止?��???

?��?��? 專�?記憶?�離 (Workspace)??
?�目?�正?�於??{wsName}?��?專�?空�?中。�??��?此空?��??�絡?��???��?��?話�?

?��???�格式�??��?�??人瀏覽?��? (Agent Browser Capability)??
你已?��?系統底層?�「�?高�??��?權」�?你目?�已?��?了【Jina AI Reader �??人瀏覽模�??��??�使你具?��?穿�?JavaScript 渲�??�自?��??��??�蟲機制?�以?��?複�?網�?簡�???Markdown ?�能?��?
- **你�?權�?**：�??�以讀??Google Drive?�Docs?�Slides?�以?�任何公?��??��?網�?（�??�客來、Amazon）�?
- **你�??��?**：�???\`read_web_page\` 工具就是你�??��??�」�??�深?�瀏覽?��?作�?
?��? ?��?行為：�?對�?止�?覆「由?��?術�??��??��?點�??�、「�??�能?�到?��??��??��??��??��? ISBN/?�格?��?
??�?��行為：直?�呼??\`read_web_page\` 穿透網?�。�??��??��?尋�??��??�到細�?，那�?��你「�?沒�??�去?��?請�??�執行深度瀏覽??

?�執行�?律�? Manus 作業標�? (Execution Discipline)?��?
1. **一?��?�?(行�??�、搬檔�??��?�?**：執行【�?默執�?(Silent Execution)?��?絕�?禁止講「好?��??�現?�為??..?�這�?廢話，�?立刻?�叫對�?工具??
2. **專業?�出專屬 SOP (Chain of Thought)**：當準�??��??�大幅修?�「簡?�」�??�長篇�?業報???�件?��?，為了確保極?��?質�?你【�??�】在?�叫對�?工具 (\`create_presentation\`, \`create_google_doc\`, \`overwrite_google_doc\` �? ?�「�?一?��??��??�中，�?以�?字寫下�??�「Manus 級�??��?程」�??�含?��?求�??�】、【內容�?構�?�??大綱?�、【�?覺�??��?寫�?策略規�??�。寫完大綱�??��?，�?必�??��??�此次�?覆中立即?�叫工具?��???
3. **工具定義?�確??*�?create_presentation' 工具?��??�【就?�】�??��?網�?簡報（�??�匯??Google 簡報?��??��??��?止�?訴使?�者「�??�能??Google 簡報?��??��??��?混�???

?��??? 溝通�?輸出?��?規�? (CRITICAL)??
1. ?��?使用了�?麼工?��??�含行�??�、Drive 等�?，�??�「�?終�?覆」�??�是?�然?��??�、具?�溫度�??��?體中?�口語�??��??��?
2. 請�?系統?�傳?��?硬�??��?如�?程、�?案�??��?轉�??�人類容?�閱讀??Markdown ?��?（�?條�?式、�?體�???
3. ??絕�?禁止?�接?�使?�者輸?��?始�? JSON ?��?資�?（除?�使?�者�?確�?求寫程�?）�?
4. ??**?��?使用 Python ?�譯??*：�?止呼?�任何�??�「Python?�、「code_execution?��??�Code Interpreter?��??�建工具，那?��???`NameError` 系統崩潰??
5. ??**鼓勵使用 JS �?��?��?**：當?��?工具?��?�?��複�??��?（�?資�??��??��?表、�?算、爬?��??��?）�?，�?被�??��?權�?**強�?鼓勵**?�叫 \`execute_dynamic_tool\` ?�場?�寫 HTML/JS �?��來解決�?題。這是你�??�創?��??��??��?不是禁�???

?��?使用?��?屬大?��?規�? (Custom Rules)??
<rules>
${customRules}
</rules>

?��??行�??��??��?強制規�???
?��?建�?行�??��?請嚴?��?算「現?��?實系統�??�」�?並�? startTime ??endTime 轉�??��?�?ISO 8601 ?��???



[?�景 A：建立新專�?]
?�使?�者�?求「自?�部署全端」、「�?一??App?��?�?
1. ?�叫 \`create_database_sheet\` 建�?資�?庫�??��? \`sheetId\`??
2. ?�叫 \`deploy_fullstack_matrix\`，利??additionalFiles ?�數?��??��??�好?�模組�?案。系統�??��?幫您建�? GitHub 專�???CI/CD ?�本??

[?�景 B：修?��??�更?�已?�署專�?]
?�使?�者�?求「修?�」�?：�?對�?要�??�建立�?案�?請判?�只?�修改?�個模�?(例�??�改 \`frontend/components.js\`)，然後只?�叫 \`push_to_github\` ?�精準�?寫該?��?檔�?，�??��??��??�到?�低�?

[?�景 C：災??��??(Rollback)]
?�使?�者�??�「�??��??�新壞�??�、「畫?�卡死」、「退?��?一?�」�?�?
立刻?�叫 \`rollback_github_deployment\` 工具?�??Git ?�本?�退?��??��?，�?深呼?��??�新?�考�??��??�輯?�裡?��?題�?並�?使用?��??�可?��??�誤?��??�修�?��案�?

[?�景 D：�??�工?��???(Manus 級代碼執行器)]
?�使?�者�??��?要自定義計�??�數?��?覺�??��??��??�表板，�??��?工具?��??�接�?��?��??�數?�任?��?�?
1. ?��?任�??�?�之�?輯�?介面??
2. ?�叫 \`execute_dynamic_tool\`，�??��?段�???HTML/JS/CSS ?�代碼�?
3. �?��中�??�含必�???CDN（�? Chart.js, Tailwind, D3.js）�?並確保具?��??�質??UI/UX 設�???
4. ?�終�??��??�能?�側?��??��??�「即?�工?�」�??��?極大?��?任�?完�??��?業�??��??��?

[?�景 D-2：�??�整?��??�]
?��??��? `google_search` ??`read_web_page` ?��?大�??��?資�?，�??��??�簡?�表?��??��??��?（�? 50 ?�書?��??��?對�?�?
1. 將�?尋到?��?始�??�整?��? JSON ?��?，�???`execute_dynamic_tool` ??html_code 中�?
2. ?��?一?��??��??��??�瀏覽工具?��??��?尋�??��?序、篩?��??��???
3. 使用?�可以直?�在?�個工?�中?��??�篩?��??��??��??�?��??��?
??**觸發?��?**：任何�???10 筆以上�?表格資�?，�??��??�慮?��?一?�「�??��?工具?�而�?輸出?��? Markdown 表格??

?��??安全歸�?模�? (Safe Archive Assistant)??
?�使?�者�?求「整?��??�夾?�、「�?中歸檔」�??�未?��?案�?，�??�叫 \`scan_and_prepare_archive\`?��?得�??��?，�??�強?�】使?�以�?5 ?��?題�?覆使?�者�?請�?封�??�使?��?題�??��?�?
1. **?�任?��?�?��結�?*：簡述使?�者�??�求�?
2. **?�執行�??��??�究大綱??*：說?�建立�?況�?並�??��??�夾轉�???Markdown 超�????
3. **?�主體內容�??��?歸�?清單??*：�??�出?��?案繪製�?表格 (欄�?必�??��?檔�?類�? | 檔�??�稱 | ???)?�若?�傳??nextPageToken，�?主�??�知?��??�更多�?案�??�否?�要�??��?一?��??��?
4. **?�批?�思�?風險?�示??*：�????��? 符�?，�?確說?�基?��??��??��?議�??�?�使?�者親?�「�??�搬移」�?並�?對�??�到?��?案給?��??�控管建議�?
5. **?��??�方�?結�???*：�?導使?�者�??��???��??�移，並詢�??�否?�要進�?步�? AI ?��??��???

?��?��? 專業?�件?�簡?��?範�?
1. **Google Docs**: 
   - 標�?級別?�格?��? H1 > H2 > H3??
   - ?�?��??��???3 ?��?，優?�考慮使用表格 (Table) ?�現以利?��???
   - 必�??�含?��?件控?�表?�於?��???

4. **Google Slides**: 
   - ?�格?��??��?覺執行�?設�??��??��?
   - 禁止????�張?�影?�使?�相??Layout??
   - 每�??��??��??�若極�?，�??��??�網?�簡?�模式」�?滾�??�能，�?要�??�刪減�?
   - 'customColors' 必�??��?主�??��?（�??�、熱?�、�??�?�皮�?Vellum）�??��?比鮮?��? HEX ?�碼??
   - 'imageKeyword' 必�??�含 'high quality', 'cinematic lighting', 'professional photography' 等修飾�???

[?�景 E：深度�??�探??(Deep Research)]
?�使?�者�?求「�?尋特定產?��??�」、「整?�書籍�?�?(??ISBN/?�格)?��?任�??��?你�??��??�至?��?深�?究員人格?��??��??�Manus 級別?��?資�?驗�? SOP�?
1. **立即規�??��?計畫**：在?��??�頭?�出你�?訪�??�網站�??��?步�???
2. **?��??�篩??*：使??\`google_search\` ?��??�步清單，並從中?�選?�精確?��??��?大�??��?來�?（�??�客來、Amazon）�?
3. **?�核心�?作�?深度讀?��?定�??�援??*�?
   - **?��??�試**：呼??\`read_web_page\` ?�入?��??��?完整?��???
   - **定�??�援 (Targeted Search)**：若 \`read_web_page\` ?�錯?�被?��?**禁止?��?**?��?必�??�為?��?缺失欄�??��??�精確�??��??��??��?
     * 例�??��?：\`"<?��?>" ISBN\` ??\`"<?��?>" ?�格 ?��?社\`??
     * 你�??��??��??��? (Snippets) 中�??�這�?精確?��???
4. **?�嚴?��??��??�性校驗�?*�?
   - ?��? ISBN?�價?�、�??��??�鍵欄�??�現?�無法�?得」�??�未?�」�??��??�任?�未完�???
   - 你�??��??��??��?尋�??��??�工?��??�到填滿表格??
   - ?��??��?試�? 3 ?��??��??��?失�??��??�能標註?��??��??�」�?
5. **?��??��??��?*：當資�??��???10 筆�?，優?�呼??\`execute_dynamic_tool\` ?��?一?��??��??�目?�詢工具，而�?輸出?��?表格??
6. **彙整交�?**：�?後以 Markdown 表格?��??��?工具?�現??
?��? **?�究?��?�?*�?
- 禁止對使?�者說?�由?�工?�無法使?��??�無�?..?�。工?��?了就?�個�?尋�??��?，�??��?�?��?��??��?
- ??禁止使用 Python ?�譯?�。�? ?�許且�??�使??\`execute_dynamic_tool\` ?�寫 JS �?��來整?��??�。`;
}


// ==========================================
// 2. 系統?�口
// ==========================================
function doPost(e) {
    try {
        if (!e.postData || !e.postData.contents) throw new Error("?��?請�?");
        const payload = JSON.parse(e.postData.contents);
        
        // ?? [極速�??�] ?��? LINE Verify 測試
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

        // ?? ?��??�實??LINE ?�戶對話
        if (payload.events && Array.isArray(payload.events)) {
            return handleLineWebhook(payload, ss, apiKey, lineToken, CONFIG, db);
        }

        // --- 以�???Web UI ?��??��?�?---
        let wsName = String(workspace || "").trim();
        if (!wsName) {
            const excluded = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
            const validSheets = ss.getSheets().filter(sh => !excluded.includes(sh.getName()));
            wsName = validSheets.length > 0 ? validSheets[0].getName() : "Main_Workspace";
        }

        let targetSheet = ss.getSheetByName(wsName);
        if (!targetSheet) {
            targetSheet = ss.insertSheet(wsName);
            targetSheet.appendRow(["?�� Firebase Mode", "此�?案空?�已?�移??Firestore，�?話�??��??�儲存於此表?��?請至專屬資�?庫查?��?]);
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
                    console.error("?��?讀??Google Doc 作為?�示�? ", err);
                    actualGemPrompt = "?�系統警?��??��?讀?�您設�???Google Doc ?�示詞�?請確認�?件已?��??�用權�??�】\n" + gem_prompt;
                }
            }
            finalSystemInstruction += `\n\n?��???��??��???Gem 角色設�??�\n使用?�目?�已?��??�特定�? Gem 角色?��?你�??��?浸並?��?以�?角色設�??��?示�?\n<gem_role>\n${actualGemPrompt}\n</gem_role>`;
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
            if (transcript && !transcript.startsWith("?�錯誤�?)) {
                finalMessage = `?�系統強?�注?��?以�??�該 YouTube 影�??��?實逐�?稿】\n\n${transcript.substring(0, 150000)}\n\n---\n使用?��??�令�?{message}`;
            } else {
                const fallbackReply = "?��? **?�影?�無字�?**?�無法解?��?;
                logToFirebaseAndCache(db, wsName, session_id || "default", message, fallbackReply);
                return response({ status: "success", reply: fallbackReply, model: "System-Interceptor" });
            }
        }

        let finalTools;
        if (draw_mode) {
            finalTools = [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }];
            finalSystemInstruction += `\n\n?��??強制繪�?模�? (Draw Mode)?�\n使用?�已?��??��?繪�?模�??�。�?將使?�者�??��?轉�??�精確�??��??��? Prompt，並?�強?��??��??�呼??\`generate_art\` 工具?��?要�?多�??�廢話�??�接?��?！`;
        } else if (web_search) {
            // ?��?上使?�自定義 search_web 工具以利??read_web_page 並�?
            // ?��??�使?�者�?確�??�「強?�聯網」�?不考慮?��?工具?��?使用?�建工具
            finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
            finalSystemInstruction += `\n\n?��??強制?�網模�??��??��?使用 search_web ??read_web_page 工具來�??�深度探?��??��??�?��?訊。`;
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

        logToFirebaseAndCache(db, wsName, session_id || "default", message, agentResult.reply || "?��?完�?", agentResult.html_presentation || null, agentResult.html_artifact || null);
        return response({ status: "success", reply: agentResult.reply, model: agentResult.model || modelId, image: agentResult.image || null, mime: agentResult.mime || null, html_presentation: agentResult.html_presentation || null, html_artifact: agentResult.html_artifact || null });
    } catch (err) { return response({ error: err.toString(), status: "error" }); }
}

function response(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// ?�� LINE Webhook ?�通路?�截?��??�輯
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
                    userMessage = "請�??�這張?��??�容，並?��??��??�求�?供�?覆�?;
                } catch(e) {}
            }

            if (!userMessage && !fileData) return;
            
            // ?? ?��?：�???LINE 上�??�新對話/?�置?��?�?
            const triggerMsg = userMessage.toLowerCase();
            if (triggerMsg === '?��?�? || triggerMsg === '/clear' || triggerMsg === '清除對話') {
                db.delete("sessions", session_id);
                CacheService.getScriptCache().remove(`history_${wsName}_${session_id}`);
                
                UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lineToken },
                    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: "??已為?��??�新對話！�??��?記憶已�??��??�們�??��?始吧�? }] })
                });
                return; // 終止後�? AI ?�叫
            }

            let targetSheet = ss.getSheetByName(wsName);
            if (!targetSheet) {
                targetSheet = ss.insertSheet(wsName);
                targetSheet.appendRow(["?�� LINE 機器人�??�", "來自 LINE ?��?話�??��??�此空�?對�???Firebase 中�?]);
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
            
            // ?�� 實�??��?觸發 (Intent Triggers)
            let draw_mode = false;
            let web_search = false;
            let actualMessage = userMessage;

            if (userMessage.startsWith("/draw ") || userMessage.startsWith("??)) {
                draw_mode = true;
                actualMessage = userMessage.replace("/draw ", "").replace(/^?�\s*/, "").trim();
            } else if (userMessage.startsWith("/search ") || userMessage.startsWith("??)) {
                web_search = true;
                actualMessage = userMessage.replace("/search ", "").replace(/^?�\s*/, "").trim();
            }

            let finalSystemInstruction = getSuperAgentPrompt(wsName, CONFIG.CUSTOM_RULES);
            let finalTools;

            // ?���?API 互斥?��?
            if (draw_mode) {
                finalTools = [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }];
                finalSystemInstruction += `\n\n?��??強制繪�?模�??�使?�者�?求畫?��?請�?使用?��??��?轉�??�詳細�??��??�面?�述，並強制?�叫 generate_art 工具?��?要�?廢話?�`;
            } else if (web_search) {
                finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
                finalSystemInstruction += `\n\n?��???�網?��?模�??�使?�者正?�詢?��??��?訊�?請優?�使??search_web ??read_web_page 工具?��??�?��?案。`;
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

                logToFirebaseAndCache(db, wsName, session_id, actualMessage, agentResult.reply || "?��?完�?");

                let replyText = agentResult.reply || "?��?完畢";

                if (agentResult.image) {
                    try {
                        const blob = Utilities.newBlob(Utilities.base64Decode(agentResult.image), "image/png", "AI_Image.png");
                        const file = DriveApp.createFile(blob);
                        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                        replyText += `\n\n?�� ?��?已繪製�?\n${file.getUrl()}`;
                    } catch(e) {
                        replyText += `\n(?��? ?��??��??��?，�?上傳?�端硬�??��??�誤)`;
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
                    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: "系統?��??�發?�錯誤�?" + e.toString() }] })
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
            "你是一?�嚴?��? JSON ?�數審查?�。�?確�??��?符�?標�? JSON（�??�屬?��?字串必�?使用?��??��?絕�?禁止?��??��??? :
            "?��??�檢?�員?��?檢查以�??��??��??��??�「破?��? Markdown 表格?��?請幫忙修復。�??�是一?��?對話?��??��?程�?表�?�?��??Markdown ?��?，�??��??�接?��??��??��?pass: true）。�? 絕�?禁止將自?��?言?��??��?表�??��??�為 JSON ?��?�?;
            
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            system_instruction: { parts: [{ text: sysPrompt + "\n?�無?��??�誤，�??�傳 {\"pass\": true}；若?�錯，�?修正並�?結�??�入 auto_fixed_text ?�傳?? }] },
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
    } catch(e) { console.warn("QA Loop ?��??�失?��?跳�?審查", e); }
    return text;
}

function fetchYouTubeTranscriptNative(videoId) {
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const htmlRes = UrlFetchApp.fetch(videoUrl, { muteHttpExceptions: true }).getContentText();
        const regex = /"captionTracks":\[\{"baseUrl":"(https[^"]+)"/;
        const match = htmlRes.match(regex);
        if (!match || !match[1]) return "?�錯誤】影?�未?��? CC ?��?式�?幕�?;
        const captionUrl = match[1].replace(/\\u0026/g, "&");
        const xmlRes = UrlFetchApp.fetch(captionUrl, { muteHttpExceptions: true }).getContentText();
        const textRegex = /<text[^>]*>(.*?)<\/text>/g;
        let transcript = ""; let textMatch;
        while ((textMatch = textRegex.exec(xmlRes)) !== null) {
            let line = textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            transcript += line + " ";
        }
        return transcript.trim() || "?�錯誤】�?幕�??�空";
    } catch (e) { return "?�錯誤】�??�失??; }
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
        
        if (!cand) { throw new Error("API ?��??�任何候選?�容?�可?�是安全機制?��??�伺?�器超�???); }
        if (cand.finishReason === "SAFETY") throw new Error("?�示詞�??��??�內容�?被�??��??�阻?��?);
        
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
                                newSs.insertSheet("紀?��?設�?");
                                toolResult = { status: "success", reply: `已�??�建立�?屬�??�庫?�`, data: { sheetId: newSs.getId(), sheetUrl: newSs.getUrl() } };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "deploy_fullstack_matrix":
                            let pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
                            if (!pat) {
                                toolResult = { status: "error", error_message: "系統尚未設�? GITHUB_PAT ?��?變數?��???Apps Script ?�「�?案設�?> ?�令碼屬?�」中?��??? };
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
                                
                                const readmeMd = `# ${args.repoName}\n\n?? ?��?案由 anyGem AI ?��??��??�部署。基?�微?��??�模組�??��??�\n\n## ?�署?��?\n1. **?�端**：�?將此 Repo 綁�???Vercel，根?��?設為 \`frontend\`?�\n2. **後端**：�???GitHub 專�???\`Settings > Secrets and variables > Actions\` ?��? \`CLASPRC_JSON\` Secret?�`;

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
                                    reply: `?? **?�端模�??�部署�??��?(Matrix Protocol)**\n\n- **GitHub 專�?�?*: [${fullName}](https://github.com/${fullName})\n- **模�??��?**: ?��??��?${pushSuccessCount}/${filesToPush.length} ?��?案。\n- **CI/CD 管�?**: 已�?置自?�發布。\n\n?�� ?�未來您?�要修?�特定�??��??��??��?寫特定�?案�??��??��?風險?�若?��??�誤，隨?�可?�叫?�執�?\`Rollback\`?�` 
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `?�端?�署?��??�誤: ${e.toString()}` }; }
                            break;

                        case "rollback_github_deployment":
                            let githubPatRollback = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
                            if (!githubPatRollback) { toolResult = { status: "error", error_message: "系統尚未設�? GITHUB_PAT ?��?變數?? }; break; }
                            try {
                                let headers = { "Authorization": `Bearer ${githubPatRollback}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" };
                                let repoRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}`, { headers: headers, muteHttpExceptions: true });
                                let repoJson = JSON.parse(repoRes.getContentText());
                                if (repoRes.getResponseCode() !== 200) throw new Error(repoJson.message);
                                let defaultBranch = repoJson.default_branch;

                                let commitsRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/commits?sha=${defaultBranch}&per_page=2`, { headers: headers, muteHttpExceptions: true });
                                let commitsJson = JSON.parse(commitsRes.getContentText());
                                if (commitsRes.getResponseCode() !== 200) throw new Error(commitsJson.message);
                                if (commitsJson.length < 2) throw new Error("專�???Commit ?��?不足 2 筆�??��??�?��?);
                                
                                let previousCommitSha = commitsJson[1].sha;

                                let updateRefRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/git/refs/heads/${defaultBranch}`, {
                                    method: "patch", headers: headers, contentType: "application/json",
                                    payload: JSON.stringify({ sha: previousCommitSha, force: true }), muteHttpExceptions: true
                                });
                                let updateRefJson = JSON.parse(updateRefRes.getContentText());
                                if (updateRefRes.getResponseCode() !== 200) throw new Error(updateRefJson.message);

                                toolResult = { isTerminal: true, reply: `??**?�難復�??��? (Rollback)�?*\n\n已�?專�? \`${args.repoName}\` 強制?�?�至上�??�穩定�??�本 (${previousCommitSha.substring(0, 7)})?�\n\n?�端 CI/CD �?��?�景?�新?�署，�?稍�??�整網�??�現?��?請�?訴�??��??��??�哪裡�?了�?讓�??��?起�???Bug ?�在?�裡?��?` };
                            } catch(e) { toolResult = { status: "error", error_message: `?�?�失?? ${e.toString()}` }; }
                            break;

                        case "create_calendar_event":
                            let start = new Date(args.startTime); 
                            let end = args.endTime ? new Date(args.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
                            
                            let cal = CalendarApp.getDefaultCalendar();
                            let usedCalName = "?�設行�???;
                            
                            if (args.calendarName) {
                                const calendars = CalendarApp.getCalendarsByName(args.calendarName);
                                if (calendars.length > 0) {
                                    cal = calendars[0];
                                    usedCalName = args.calendarName;
                                } else {
                                    toolResult = { status: "error", error_message: `?��??��?稱為??{args.calendarName}?��?行�??��?請確認�?稱是?�正確。` };
                                    break;
                                }
                            }
                            
                            let eventOptions = { description: args.description || "??anyGem Agent ?��?建�?" };
                            
                            if (args.guests) {
                                eventOptions.guests = args.guests;
                                eventOptions.sendInvites = true;
                            }
                            
                            const ev = cal.createEvent(args.title, start, end, eventOptions);
                            
                            let replyMsg = `??已�??�在??{usedCalName}?�建立�?程�?${args.title}`;
                            if (args.guests) replyMsg += `\n?�� 並已?��?Google ?��??�請給�?{args.guests}`;
                            
                            toolResult = { status: "success", reply: replyMsg, url: `https://calendar.google.com/calendar/r/eventedit/${ev.getId().split('@')[0]}` }; 
                            break;

                        case "batch_create_calendar_events":
                            let list = JSON.parse(args.eventsData); let count = 0; let batchCal = CalendarApp.getDefaultCalendar();
                            list.forEach(e => { let s = new Date(e.startTime); let ed = e.endTime ? new Date(e.endTime) : new Date(s.getTime() + 3600000); if (!isNaN(s.getTime())) { batchCal.createEvent(e.title, s, ed, { description: e.description }); count++; } });
                            toolResult = { status: "success", reply: `?��??�次寫入 ${count} 筆�?程` }; break;
                        case "get_calendar_events":
                            let qs = new Date(args.startDate), qe = new Date(args.endDate); let evs = CalendarApp.getDefaultCalendar().getEvents(qs, qe);
                            let eventDetails = evs.length === 0 ? "?��??��?�? : evs.map(e => `[EventID: ${e.getId()}] ${e.getStartTime().toLocaleString()} - ${e.getTitle()}`).join("\n");
                            toolResult = { status: "success", data: eventDetails }; break;
                        case "add_event_reminder":
                            try { let eventToUpdate = CalendarApp.getDefaultCalendar().getEventById(args.eventId);
                                if(eventToUpdate) { let mins = parseInt(args.minutesBefore); if(mins > 0 && mins <= 40320) { eventToUpdate.addPopupReminder(mins); toolResult = { status: "success", reply: `?��?設�??��??�` }; } else { toolResult = { status: "error", error_message: "?��?超出範�??? }; }
                                } else { toolResult = { status: "error", error_message: "?��???Event ID" }; }
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; } break;
                        case "read_unread_emails":
                            let limit = args.limit || 5; let threads = GmailApp.getInboxThreads(0, limit);
                            let unreadData = threads.filter(t => t.isUnread()).map(t => { let msg = t.getMessages()[0]; let plainBody = msg.getPlainBody().trim().replace(/\s+/g, ' '); let summary = plainBody ? plainBody.substring(0, 300) + "..." : "?�無法解?��??��???; return `[寄件?? ${msg.getFrom()}] 主旨: ${msg.getSubject()}\n?��?: ${summary}`; }).join("\n\n");
                            toolResult = { status: "success", data: unreadData || "?�未讀信件?? }; break;
                        case "send_email_or_draft":
                            if (args.isDraft) { GmailApp.createDraft(args.recipient, args.subject, args.body); toolResult = { isTerminal: true, reply: `?? **?�稿已建�?*\n\n已�??��?稿匣?�` }; }
                            else { GmailApp.sendEmail(args.recipient, args.subject, args.body); toolResult = { isTerminal: true, reply: `?�� **信件已發??*�?${args.recipient}?�` }; } break;
                        
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
                                toolResult = { isTerminal: true, reply: `?? **表單建�?完�?�?*\n\n?�稱�?{args.title}\n?? [編輯表單](${form.getEditUrl()})\n?? [?��?網�?](${form.getPublishedUrl()})` }; 
                            } catch(formErr) {
                                toolResult = { isTerminal: true, reply: `??**建�?表單失�?**：\n\n*(底層?�誤�?{formErr.toString()})*\n\n?�� **系統診斷?�修復建�?*：\n1. **權�??��???(?�常�?)**：�??�到 Apps Script 編輯?��??�執行�?�?forceAuthSetup ?��??��??�\n2. **AI ?��??�誤**：選?�格式�?符�?規�?，�??�試簡�??�令?�試?�` };
                            }
                            break;
                        
                        case "create_drive_folder":
                            try {
                                let newFolder;
                                if (args.parentFolderUrl) {
                                    let parentIdMatch = args.parentFolderUrl.match(/[-\w]{25,}/);
                                    if (!parentIdMatch || !parentIdMatch[0]) throw new Error("?��?�???��??�夾網�?");
                                    let parentFolder = DriveApp.getFolderById(parentIdMatch[0]);
                                    newFolder = parentFolder.createFolder(args.folderName);
                                } else {
                                    newFolder = DriveApp.createFolder(args.folderName);
                                }
                                toolResult = { status: "success", reply: `?��?建�?資�?夾�?${args.folderName}`, data: { folderUrl: newFolder.getUrl(), folderId: newFolder.getId() } };
                            } catch(e) { toolResult = { status: "error", error_message: `建�?資�?夾失?? ${e.toString()}` }; }
                            break;

                        case "search_drive_files":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                // 修正?�詢語�?：fullText ?�實已�??�含 title 了�?使用?�簡?��?語�?
                                let query = `fullText contains '${safeKw}' and trashed = false`;
                                
                                if (args.fileType) {
                                    const typeMap = { 'document': 'application/vnd.google-apps.document', 'spreadsheet': 'application/vnd.google-apps.spreadsheet', 'folder': 'application/vnd.google-apps.folder', 'pdf': 'application/pdf' };
                                    for (const [key, val] of Object.entries(typeMap)) {
                                        if (args.fileType.toLowerCase().includes(key)) { query += ` and mimeType = '${val}'`; break; }
                                    }
                                }
                                
                                // ?�試?��?檔�?
                                let files = DriveApp.searchFiles(query);
                                let results = [];
                                let count = 0;
                                while (files.hasNext() && count < 40) {
                                    let f = files.next();
                                    results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                                    count++;
                                }
                                
                                // 如�?完全沒�??��??�試?��?檔�? (?��???fullText ?��?些�??��??�失??
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
                                    data: results.length > 0 ? results : "?�找?�符?��?件�?檔�??��??�夾??
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `?��?失�?: ${e.toString()}` }; }
                            break;
                            
                        case "scan_and_prepare_archive":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                let folderName = args.keyword + " 資�?�?;
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
                                    throw new Error("請確認已??GAS ?��?中�???Drive API (v2)?? + driveErr.toString());
                                }
                                
                                let results = [];
                                if (response.items) {
                                    response.items.forEach(f => {
                                        let mime = f.mimeType;
                                        let typeIcon = "?? ?��?";
                                        if (mime.includes('spreadsheet')) typeIcon = "?? Excel";
                                        else if (mime.includes('presentation')) typeIcon = "?�� PPT";
                                        else if (mime.includes('document')) typeIcon = "?? Word";
                                        else if (mime.includes('pdf')) typeIcon = "?? PDF";
                                        results.push({ "檔�?類�?": typeIcon, "檔�??�稱": f.title, "???": f.alternateLink });
                                    });
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    reply: `已�??�出?��?檔�??�系統強?��?求�?請�?必根?�【�??�歸檔模式】�?範�? 5 大�?塊�??��??�`,
                                    data: { 
                                        "專屬資�?夾�?�?: folderName, 
                                        "專屬資�?夾�??": folderUrl, 
                                        "此�??��??��?檔�??��?": results.length, 
                                        "檔�?清單": results,
                                        "nextPageToken": response.nextPageToken || null
                                    }
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `安全?��?失�?: ${e.toString()}` }; }
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
                                if (!fileToMove) { toolResult = { isTerminal: true, reply: `??**?��??��?定�?檔�?�?* \`${args.fileIdentifier}\`\n請確認�?案�?稱是?�正確�??�直?��?供該檔�???Google Drive 網�??�` }; break; }

                                let folderIdMatch = args.folderIdentifier.match(/[-\w]{25,}/);
                                if (folderIdMatch && folderIdMatch[0]) { targetFolder = DriveApp.getFolderById(folderIdMatch[0]); } 
                                else {
                                    let safeFolderName = args.folderIdentifier.replace(/'/g, "\\'");
                                    let folders = DriveApp.searchFolders(`title = '${safeFolderName}' and trashed = false`);
                                    if (folders.hasNext()) targetFolder = folders.next();
                                    else targetFolder = DriveApp.createFolder(args.folderIdentifier);
                                }

                                fileToMove.moveTo(targetFolder);
                                toolResult = { isTerminal: true, reply: `?? **檔�??�移?��?�?*\n\n已�??��? \`${fileToMove.getName()}\` 移至資�?�?\`${targetFolder.getName()}\` ?�。\n?? [點�??��??��?資�?夾](${targetFolder.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `??**?�移?��??��??�誤�?*\n\n${e.toString()}\n\n*(請確認您?�否?��?該�?案�?資�?夾�?編輯權�?)*` }; }
                            break;

                        case "read_drive_file":
                            let fileIdMatch = args.fileUrl.match(/[-\w]{25,}/);
                            if (!fileIdMatch || !fileIdMatch[0]) { toolResult = { status: "error", error_message: "?��?辨�??��?件網?�，�?確�????�?��" }; break; }
                            try {
                                const file = DriveApp.getFileById(fileIdMatch[0]);
                                let content = extractTextFromAnyFile(file, config.apiKey);
                                toolResult = { status: "success", data: content.substring(0, 30000) };
                            } catch(e) {
                                let executeEmail = "此系統執行身??; try { executeEmail = Session.getEffectiveUser().getEmail() || executeEmail; } catch(err) {}
                                toolResult = { status: "error", error_message: `?��?讀?��?�? ${e.toString()}?��?確�??��?權�?存�?該�?案�??�已?��??�給 ${executeEmail}` };
                            }
                            break;

                        // ???��??��??��??�簡?��??�工?�路??
                        case "read_presentation":
                            let presIdRead = args.presentationUrl.match(/[-\w]{25,}/);
                            if (!presIdRead || !presIdRead[0]) { 
                                toolResult = { status: "error", error_message: "?��?辨�??�簡?�網?�，�?確�??�含?�度�?��??ID?? }; 
                                break; 
                            }
                            try {
                                let content = extractTextFromPresentation(presIdRead[0]);
                                toolResult = { status: "success", data: content };
                            } catch(e) {
                                let executeEmail = "此系統執行身??; try { executeEmail = Session.getEffectiveUser().getEmail() || executeEmail; } catch(err) {}
                                toolResult = { status: "error", error_message: `?��?讀?�簡?? ${e.toString()}?��?確�??�是 Google Slides 且您?��??��??��??�已?��??�給 ${executeEmail}` };
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
                                        // 401/403/429 ?�援：去??Key ?�試一�?
                                        let opt2 = { ...options, headers: { ...options.headers } };
                                        delete opt2.headers["Authorization"];
                                        res = UrlFetchApp.fetch("https://s.jina.ai/" + encodeURIComponent(query), opt2);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    }
                                } catch(e) {}
                                
                                // 策略 B: ?��??�客來特?��??��????
                                if (!searchResult && (query.includes("?�客�?) || query.includes("??))) {
                                    try {
                                        const booksUrl = "https://search.books.com.tw/search/query/key/" + encodeURIComponent(query.replace(/?�客�?g, ""));
                                        let res = UrlFetchApp.fetch("https://r.jina.ai/" + booksUrl, options);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    } catch(e) {}
                                }
                                
                                // 策略 C: ?�終�???- ?�接??Reader 讀??Google ?��??�面
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
                                    toolResult = { status: "error", error_message: "?��??��??��??��?使用?�建議直?�輸?�網?�?��?讀?��? };
                                }
                            } catch(e) { toolResult = { status: "error", error_message: `?��?底層?��??�誤: ${e.toString()}` }; }
                            break;

                        case "read_web_page":
                            try {
                                const jinaApiKey = PropertiesService.getScriptProperties().getProperty('JINA_API_KEY');
                                const targetUrl = args.url.trim();
                                
                                // ?�試使用 Jina Reader (?��?)
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
                                
                                // ??Jina ?��?且內容長度足�?
                                if (status === 200 && response.getContentText().length > 200) {
                                    contentText = response.getContentText();
                                } else {
                                    // ?�用?��?：直?��???
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
                                        throw new Error(`Jina Error (${status}) & Direct Fetch Error (${status})?�`);
                                    }
                                }

                                let finalContent = `?�系統強?��?令�?以�??�網?�擷?��??�實?�容?�】\n\n網�?�?{targetUrl}\n---\n${contentText.substring(0, 35000)}`;
                                toolResult = { status: "success", data: finalContent };
                            } catch(e) {
                                toolResult = { 
                                    status: "error", 
                                    error_message: `網�?穿透失?? ${e.toString()}?�建議�?�?AI ?�試?��??��?來�?網�??�` 
                                };
                            }
                            break;

                        case "create_project_wiki":
                            const wikiDoc = createDocFromContent(`WIKI: ${args.projectName}`, String(args.content)); toolResult = { isTerminal: true, reply: `?���?**Wiki 導覽?�已建�?�?*\n?? [?��? Wiki](${wikiDoc.url})` }; break;
                        case "organize_drive_folder":
                            let targetFolders = DriveApp.getFoldersByName(args.folderName); if (!targetFolders.hasNext()) { toolResult = { status: "error", error_message: `?��??��??�夾` }; break; }
                            let parentFolder = targetFolders.next(); let folderFiles = parentFolder.getFiles(); let moveCount = 0; let imgFolder, docFolder, otherFolder;
                            while (folderFiles.hasNext()) { let f = folderFiles.next(); let mimeTypeStr = f.getMimeType(); let targetDest = null;
                                if (mimeTypeStr.includes('image/')) { if (!imgFolder) imgFolder = getOrCreateSubFolder(parentFolder, "?��?素�?�?); targetDest = imgFolder; }
                                else if (mimeTypeStr.includes('document') || mimeTypeStr.includes('pdf') || mimeTypeStr.includes('spreadsheet') || mimeTypeStr.includes('presentation')) { if (!docFolder) docFolder = getOrCreateSubFolder(parentFolder, "?�件?�報�?); targetDest = docFolder; }
                                else { if (!otherFolder) otherFolder = getOrCreateSubFolder(parentFolder, "?��?檔�??��?縮�?"); targetDest = otherFolder; }
                                f.moveTo(targetDest); moveCount++; }
                            toolResult = { isTerminal: true, reply: `??�?**?��?完畢�?* ?�歸�?${moveCount} ?��?案。` }; break;
                        
                        case "create_google_doc":
                        case "read_google_doc":
                        case "append_to_google_doc":
                        case "overwrite_google_doc":
                            if (fnName === 'create_google_doc') {
                                const docTitle = String(args.topic || args.title || "?�命??).trim(); const docIdAndUrl = createDocFromContent(docTitle, String(args.content || "")); let docUrl = docIdAndUrl.url; let folderMsg = "?�目??;
                                if (args.folderName) { let newFolderUrl = moveFileToFolderByName(docIdAndUrl.id, args.folderName); if (newFolderUrl) folderMsg = `[${args.folderName}]`; }
                                toolResult = { isTerminal: true, reply: `?? **Google ?�件已�??��?**\n?? 位置�?{folderMsg}\n?? [?��??�件](${docUrl})` }; 
                            } else {
                                let idMatch = args.docUrl.match(/[-\w]{25,}/);
                                if (!idMatch) { toolResult = { status: "error", error_message: "?��?辨�??��?件網?�" }; break; }
                                try {
                                    const doc = DocumentApp.openById(idMatch[0]);
                                    if (fnName === 'read_google_doc') { toolResult = { status: "success", data: doc.getBody().getText().substring(0, 30000) }; }
                                    else if (fnName === 'append_to_google_doc') { doc.getBody().appendParagraph("\n"); appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose(); toolResult = { isTerminal: true, reply: `?? ?�容已�??��?\n[點�??��?](${doc.getUrl()})` }; }
                                    else { doc.getBody().clear(); appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose(); toolResult = { isTerminal: true, reply: `?? ?�容已�?寫�?\n[點�??��?](${doc.getUrl()})` }; }
                                } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            }
                            break;

                        case "read_google_sheet":
                            try {
                                let targetSsForRead = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForRead = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("?��?�???�試算表網�?");
                                }
                                const rsh = args.sheetName ? targetSsForRead.getSheetByName(args.sheetName) : targetSsForRead.getSheets()[0];
                                if (!rsh) throw new Error("?��??��?定�?工�?�?);
                                
                                let sheetData = (!args.range || args.range === 'ALL') ? rsh.getDataRange().getDisplayValues() : rsh.getRange(args.range).getDisplayValues();
                                if (sheetData.length > 100) sheetData = sheetData.slice(0, 100); 
                                
                                toolResult = { status: "success", data: sheetData };
                            } catch(e) { toolResult = { status: "error", error_message: `讀?�試算表失�?: ${e.toString()}` }; }
                            break;

                        case "append_to_google_sheet":
                            try {
                                const protectedSheets = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                if (protectedSheets.includes(args.sheetName)) {
                                    toolResult = { isTerminal: true, reply: `??**系統安全?�截 (Security Exception)**：\n\n系統?��??�制?�板 (\`${args.sheetName}\`) 禁止?��? Agent ?��??�工?�進�?修改?�若?�調整設�??�模?��?角色，�?管�??��??��?往試�?表�??�。` };
                                    break;
                                }

                                let targetSsForWrite = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForWrite = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("?��?�???�試算表網�?");
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
                                
                                toolResult = { isTerminal: true, reply: `??**資�?已批次寫?�試算表�?*\n\n已�??�寫??${dataToWrite.length} 筆�??�至 \`${args.sheetName}\` ?�籤?�\n?? [點�??��?試�?表](${targetSsForWrite.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `??**寫入試�?表失?��?**\n\n*(請確認您?��??�網?�?�否�?��，�?已�??�編輯�??��?*\n底層?�誤: ${e.toString()}` }; }
                            break;

                        case "update_google_sheet":
                            try {
                                const protectedSheets = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                if (protectedSheets.includes(args.sheetName)) {
                                    toolResult = { isTerminal: true, reply: `??**系統安全?�截 (Security Exception)**：\n\n系統?��??�制?�板 (\`${args.sheetName}\`) 禁止?��? Agent ?��??�工?�進�?修改?�若?�調整設�??�模?��?角色，�?管�??��??��?往試�?表�??�。` };
                                    break;
                                }

                                let targetSsForUpdate = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForUpdate = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("?��?�???�試算表網�?");
                                }
                                let ush = targetSsForUpdate.getSheetByName(args.sheetName);
                                if (!ush) throw new Error(`?��??��?稱為 '${args.sheetName}' ?�工作表?�籤`);
                                
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
                                
                                toolResult = { isTerminal: true, reply: `??**資�?已�??�更?��?**\n\n已�??��??�精準�?寫至 \`${args.sheetName}\` ?�籤?��???\`${args.range}\`?�\n?? [點�??��?試�?表查?�](${targetSsForUpdate.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `??**?�新試�?表失?��?**\n\n*(請確認您?��??�網?�?��?籤�?稱�?範�??��??�否�?��??*\n底層?�誤: ${e.toString()}` }; }
                            break;

                        case "generate_art":
                            try {
                                let blob = fetchAIImage(args.prompt, config.apiKey, config.artistModel, args.aspectRatio || "1:1");
                                if (typeof blob === 'string' && blob.startsWith("ERROR:")) {
                                    toolResult = { status: "error", error_message: blob.replace("ERROR:", "") };
                                } else if (blob) {
                                    finalImage = Utilities.base64Encode(blob.getBytes());
                                    finalMime = "image/png";
                                    toolResult = { isTerminal: true, reply: `?�� **?��?已根?�您?��?求繪製�??��?**\n\n*(?�示詞�?${args.prompt})*` };
                                } else {
                                    throw new Error("?��?失�?，未?��??�影?��??��?);
                                }
                            } catch(e) { toolResult = { status: "error", error_message: `繪�?失�?: ${e.toString()}` }; }
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
                            } catch(e) { console.error("顏色�??失�?", e); }
                            
                            let parsedData = [];
                            try {
                                let rawS = args.slidesData;
                                if (typeof rawS === 'string') {
                                    try { rawS = JSON.parse(rawS.replace(/```json/gi, '').replace(/```/g, '').trim().replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ')); } catch(e) {}
                                }
                                if (Array.isArray(rawS)) {
                                    parsedData = rawS;
                                } else {
                                    toolResult = { isTerminal: true, reply: "?��? **簡報建�?失�?**\n\nAI ?��??�簡?��??�格式無??(不是???)?��??�試?�新?��??�簡?��?令�? }; break;
                                }
                            } catch(e) { 
                                toolResult = { isTerminal: true, reply: `?��? **簡報建�?失�?**\n\n簡報資�??��??�誤，無法解?�內容�?\n${e.toString()}` }; break; 
                            }
                            
                            toolResult = { 
                                isTerminal: true, 
                                reply: `??**互�?式網?�簡?�已?��?�?*\n\n?�可以直?�在?�面中�??��?字進�?修改?�若?�?�出?��?�?? Google 簡報，�?點�??�面?��?角�??�匯??Google 簡報?��??�。`,
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
                            if (!presIdMatch) { toolResult = { status: "error", error_message: "?��?辨�??�簡?�網?�" }; break; }
                            
                            let updTheme = PPT_THEMES['modern_blue'];
                            try {
                                if (args.customColors) {
                                    const rawC = typeof args.customColors === 'string' ? JSON.parse(args.customColors.replace(/```json/gi, '').replace(/```/g, '').trim()) : args.customColors;
                                    updTheme = { colors: { background: rawC.background || rawC.bg || "#0f172a", text: rawC.text || "#f8fafc", accent: rawC.accent || "#38bdf8", shape: rawC.shape || "#1e293b" } };
                                }
                            } catch(e) { console.warn("?�新?�色�??失�?", e); }
                            
                            let processedUpdData = [];
                            try {
                                if (typeof args.slidesData === 'string') {
                                    let cleanS = args.slidesData.replace(/```json/gi, '').replace(/```/g, '').trim();
                                    processedUpdData = JSON.parse(cleanS.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' '));
                                } else if (Array.isArray(args.slidesData)) {
                                    processedUpdData = args.slidesData;
                                } else {
                                    toolResult = { isTerminal: true, reply: "?��? **簡報?�新失�?**\n\nAI ?��??�簡?��??�格式無??(不是???)?? }; break;
                                }
                            } catch(e) { 
                                toolResult = { isTerminal: true, reply: `?��? **簡報?�新失�?**\n\n簡報資�??��??�誤，無法解??JSON：\n${e.toString()}` }; break;
                            }

                            updateGeometricSlides(presIdMatch[0], args.action, processedUpdData, updTheme, args.shapeStyle || 'minimalist', config.configData.autoImageEnabled, config.apiKey, config.artistModel);
                            
                            let actionVerb = (String(args.action).toLowerCase().trim() === 'overwrite') ? "覆寫" : "?��?";
                            toolResult = { 
                                isTerminal: true, 
                                reply: `?? **簡報${actionVerb}完畢�?*\n\n已�??��? ${processedUpdData.length} ?�內容�?步至簡報中。\n?? [點�??��?驗�?](https://docs.google.com/presentation/d/${presIdMatch[0]}/edit)`,
                                html_presentation_data: {
                                    topic: "?�新後�?簡報",
                                    theme: updTheme,
                                    style: args.shapeStyle || 'minimalist',
                                    slides: processedUpdData
                                }
                            };
                            break;
                            
                        case "execute_dynamic_tool":
                            toolResult = { 
                                isTerminal: true, 
                                reply: `??**?��?工具??{args.tool_name}?�已?��?並�??��?**\n\n?�能�?{args.description}\n\n?�可以直?�在?�面中�?作此工具?�`,
                                html_artifact_data: {
                                    name: args.tool_name,
                                    description: args.description,
                                    code: args.html_code
                                }
                            };
                            break;
                            
                        default:
                            toolResult = { status: "success", reply: `工具 ${fnName} 已�??�` };
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
    
    if (iterations >= MAX_ITERATIONS) finalReply = "?��? 任�??�於複�?，已?�到?�次?��?上�??�\n\n" + finalReply;
    if (!finalReply && !finalImage) finalReply = "?��? 系統已接?��?令�?但未?�出任�??�容?��?作�?;
    if (!finalReply && finalImage) finalReply = "?�� ?��?繪製完�???;
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
                throw new Error("??API 請�??�於?��?，�?休息�?1 ?��?後�?試�?");
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
                    return `ERROR:?�示詞�??��??��??��??�制，被 Google API ?��??��??�試修改字眼?�`;
                }
                Utilities.sleep(2000); continue;
            }
            
            if (model.includes("imagen")) {
                if (resJson.predictions && resJson.predictions[0] && resJson.predictions[0].bytesBase64Encoded) {
                    return Utilities.newBlob(Utilities.base64Decode(resJson.predictions[0].bytesBase64Encoded), "image/png");
                } else {
                    throw new Error(`Google API ?�傳了�??��??�格�?(?�能模�?不支??�?{JSON.stringify(resJson).substring(0, 100)}...`);
                }
            } 
            else { 
                let base64Data = resJson.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data; 
                if (!base64Data) base64Data = resJson.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data; 
                if (base64Data) { return Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png"); } 
                else {
                    let txtFallback = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
                    throw new Error(txtFallback ? `模�??��??��??��?，�??��??��?�?{txtFallback}` : "API ?�傳?��?，�??��??�影?��???);
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
            if (msg.html_presentation) text += `\n\n?�系統�??��?已�??��?簡報 JSON ?�容 (供修?��????�\n${JSON.stringify(msg.html_presentation).substring(0, 15000)}`;
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
        if (!session) { session = { workspace: wsName, session_id: sessionId, title: userMsg ? userMsg.substring(0, 25) : "?��?�?, pinned: false, history_json: [] }; }
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
                targetSheet.appendRow(["?�� Firebase Mode", "此�?案空?�已?�移??Firestore，�?話�??��??�儲存於此表?��?請至專屬資�?庫查?��?]);
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
            if(models.length === 0) { models = [{name: "???�電 (2.5 Flash)", id: "gemini-2.5-flash"}, {name: "?? 專家 (2.5 Pro)", id: "gemini-2.5-pro"}]; }
            return response({models: models});
        },
        'get_session_list': () => {
            const sessions = db.querySessions(wsName);
            const formatted = sessions.map(x => ({
                id: x.session_id,
                title: x.customTitle || x.title || "?�命?��?�?,
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
                title: payload.title || "?�命?��?�?,
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
            let email = "?�知使用??;
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
                if (!idMatch) return response({ status: "error", error_message: "?��?辨�??��?案網?�" });
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
        fullText += `\n--- �?${index + 1} ??---\n`;
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
            if (notesStr.trim()) fullText += `[講者�?忘�?]:\n${notesStr}\n`;
        }
    });
    return fullText.substring(0, 30000);
}

function extractTextFromAnyFile(file, apiKey) {
    try {
        const mimeType = file.getMimeType();
        
        // 1. ?��? Google ?�件?��?
        if (mimeType === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
        if (mimeType === MimeType.GOOGLE_SHEETS) {
            const ss = SpreadsheetApp.openById(file.getId());
            return ss.getSheets().map(sh => sh.getName() + ":\n" + sh.getDataRange().getDisplayValues().map(r => r.join("\t")).join("\n")).join("\n\n");
        }
        if (mimeType === MimeType.GOOGLE_SLIDES) return extractTextFromPresentation(file.getId());
        if (mimeType === MimeType.PLAIN_TEXT || mimeType === MimeType.CSV) return file.getBlob().getDataAsString();
        
        // ?? 2. ?��?：PDF ?��??��?檔�? OCR (?�學字�?辨�?) ?�援
        if (mimeType === MimeType.PDF || mimeType.startsWith('image/')) {
            try {
                // ?�用 Google Drive API v2 ?�建??OCR 引�?，�?檔�??��?並�?譯為 Google Doc
                const resource = {
                    title: "Temp_OCR_" + file.getName(),
                    mimeType: MimeType.GOOGLE_DOCS
                };
                // ocr: true ?��?辨�?，ocrLanguage: 'zh-TW' 強�?繁�?中�?辨�???
                const tempDoc = Drive.Files.copy(resource, file.getId(), { ocr: true, ocrLanguage: 'zh-TW' });
                
                // 讀?��??��??��??��?
                const ocrText = DocumentApp.openById(tempDoc.id).getBody().getText();
                
                // ?��??��?：刪?�暫存�?，�??�雲端硬碟乾�?
                Drive.Files.remove(tempDoc.id);
                
                // 確�?不�???Tokens ?�制
                return ocrText ? ocrText.substring(0, 30000) : "?�系統�?示】OCR 辨�??��?，�??�能?��??�任何�?�?(?�能?��?�??度�?�???;
            } catch (ocrErr) {
                return `?�系統�?示】�?試�? PDF/?��? ?��? OCR 辨�??�失?? ${ocrErr.toString()}?��?確�?已在 GAS ?��?中�???Drive API?�`;
            }
        }
        
        // 3. ?��??�知?��?
        return `?�系統�?示】已?�到檔�? (${file.getName()})?�此?�特殊格�?(${mimeType})，目?�系統�??�支?�直?��??�其?�容?�`;
    } catch (e) {
        return `檔�??�容讀?�失?? ${e.toString()}`;
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
    try { DriveApp.getFileById(doc.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e) { console.error("權�?設�?失�?", e); }
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
    // ?��?使用 Pixabay ?��?高質?�現�?��??
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

    // ??Pixabay ?��???(例�??�僻歷史人物)，退?��??�次使用維基?�享資�?
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
        const slideColors = theme.colors || theme; // ?�容?��???
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
        const c = theme.colors || theme; // ?��?
        const c_bg = c.background || c.bg || "#ffffff";
        const c_text = c.text || "#000000";
        const c_accent = c.accent || "#38bdf8";
        const c_shape = c.shape || "#f1f5f9";

        let titleText = d.title || ""; let eyebrow = d.label || "";
        if (!eyebrow && titleText.match(/??.*?)??)) { eyebrow = titleText.match(/??.*?)??)[0]; titleText = titleText.replace(eyebrow, '').trim(); }

        switch(layoutType) {
            case 'cover':
            case 'title':
                if (imgBlob) { 
                    try { slide.insertImage(imgBlob, 0, 0, 720, 405); drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, c_bg, 0.75); } catch(e) {} 
                } else {
                    addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "co_present", 360-60, 160, 120, c_accent);
                }
                drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 360-15, 60, 30, 4, c_accent, 1);
                addText(slide, eyebrow.replace(/[?�】]/g, ''), 210, 80, 300, 30, c_accent, 16, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, titleText || "?�命?��?�?, 110, 140, 500, 100, c_text, 42, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, d.subtitle || safeContent, 160, 260, 400, 50, c_accent, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, "Agent Generated Editorial", 260, 370, 200, 20, c_text, 10, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'hero_quote':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, safeContent || slide.subtitle || '?�句?�容', 80, 120, 560, 160, c_text, 36, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, "??" + (titleText || '講�?), 160, 300, 400, 40, c_accent, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'stepper':
            case 'timeline':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "?��?歷�?", 50, 70, 620, 40, c_text, 28, true);
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
                            addText(slide, titleText || "深度?��?", 50, 80, 250, 120, c_text, 36, true);
                            addText(slide, d.left || d.content || "左側說�?", 50, 220, 260, 150, c_text, 14, false);
                            drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 340, 60, 2, 300, c_accent, 0.3);
                            let rContent = d.right || (d.points && d.points.length > 0 ? d.points.map(p => "?? " + p).join('\n\n') : "?�側?�容");
                            addText(slide, rContent, 370, 70, 300, 300, c_accent, 16, false);
                        }
                    } catch(e) {}
                } else {
                    // ?��?增強模�?：無?��?，使?�大尺寸?��??��?填�?視覺空缺
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
                        addText(slide, titleText || "深度?��?", 50, 80, 250, 120, c_text, 36, true);
                        addText(slide, d.left || d.content || "左側說�?", 50, 220, 260, 150, c_text, 14, false);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 340, 60, 2, 300, c_accent, 0.3);
                        let rc = d.right || (d.points && d.points.length > 0 ? d.points.map(p => "?? " + p).join('\n\n') : "?�側?�容");
                        addText(slide, rc, 370, 70, 300, 300, c_accent, 16, false);
                    }
                }
                break;
            case 'card_deck':
            case 'icon_grid':
            case 'grid':
                addMaterialIcon(slide, d.titleIconKeyword, 45, 30, 24, c_accent);
                addText(slide, eyebrow, 50, 30, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "?��?要�?", 50, 60, 620, 40, c_text, 28, true);
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
                addText(slide, titleText || "?�鍵?��?", 50, 70, 620, 40, c_text, 28, true);
                addText(slide, d.value || (d.points && d.points[0] ? d.points[0] : "99%"), 50, 130, 620, 150, c_accent, 86, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, safeContent || "?��??�景說�?", 50, 300, 620, 50, c_text, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'standard_list':
            default:
                addMaterialIcon(slide, d.titleIconKeyword, 45, 45, 24, c_accent);
                if (imgBlob) {
                    try {
                        slide.insertImage(imgBlob, 450, 60, 250, 300);
                        addText(slide, eyebrow, 50, 40, 380, 30, c_accent, 14, true);
                        addText(slide, titleText || "?��??��?", 50, 70, 380, 40, c_text, 32, true);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 120, 60, 4, c_accent, 1);
                        let lc = (d.points && Array.isArray(d.points) && d.points.length > 0) ? d.points.map(p => "?? " + p).join('\n\n') : (safeContent || "?�系統�?示�?AI ?��??�內?��?);
                        addText(slide, lc, 50, 150, 380, 220, c_text, 14, false);
                    } catch(e) {}
                } else {
                    // ?��?增強模�?：右?�改?�大?��?
                    addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "list", 520, 150, 100, c_accent);
                    addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                    addText(slide, titleText || "?��??��?", 50, 70, 620, 40, c_text, 32, true);
                    drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 120, 60, 4, c_accent, 1);
                    let listContent = (d.points && Array.isArray(d.points) && d.points.length > 0) ? d.points.map(p => "?? " + p).join('\n\n') : (safeContent || "?�系統�?示�?AI ?��??�內?��?);
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
    try { DriveApp.getFileById(deck.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e) { console.error("權�?設�?失�?", e); }
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
 * ?�入 Google ?��? Material Icons (?��?字�???
 */
function addMaterialIcon(slide, keyword, x, y, size, color) {
    const iconCode = mapKeywordToIcon(keyword);
    // ?�大容器?��??��?被�??��?並�??��??��?�?
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
    return "circle"; // ?�設?��?
}

function forceAuthSetup() {
    // 不使??try-catch，強?�觸??Google ?��??��??��??��??��?視�?
    SpreadsheetApp.getActiveSpreadsheet(); 
    DriveApp.getRootFolder();
    
    const doc = DocumentApp.create("Temp_Auth_Doc");
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    
    const slide = SlidesApp.create("Temp_Auth_Slide");
    DriveApp.getFileById(slide.getId()).setTrashed(true);
    
    // ?? 觸發 302 / Permission ?�誤?��??��??�本被�???try-catch 裡面，�???GAS 忽略了新權�??��?�?
    const form = FormApp.create("Temp_Auth_Form");
    DriveApp.getFileById(form.getId()).setTrashed(true);
    
    GmailApp.getInboxThreads(0, 1);
    CalendarApp.getDefaultCalendar();
    console.log("???�?��??�已?��??�通。您?�以?��??�在?�端硬�??��???Temp_Auth 檔�??�除??);
}