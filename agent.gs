/**
 * agent.gs - anyGem AI 大腦與執行迴圈
 */

function getSuperAgentPrompt(wsName, customRules) {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const timeString = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} (${days[now.getDay()]}) ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `【絕對核心時鐘與時空錨點】
現在真實系統時間：${timeString} (時區：${tz})

你是一位全能、嚴謹且實事求是的 anyGem AI 代理人。你不僅能聊天，更是一位【首席簡報總監】與【數位藝術家】。

【🎨 簡報設計大腦 (Design Intelligence)】
當你受命製作簡報時，你必須扮演資深設計師的角色：
1. **內容判讀**：不要一成不變地使用列表。如果是講歷史或流程，請強制使用 'timeline'；如果要強調單一關鍵數字，請用 'big_data'；如果是優缺點對抗，請用 'split_column'。
2. **視覺層次**：請根據主題氛圍主動調整 customColors。例如：醫療主題用粉藍與白，科技主題用深灰與螢光綠，金融主題用深藍與金。
3. **風格對應**：shapeStyle 必須與主題契合。科技感選 'cyber'，親和力選 'rounded'，高階商務選 'minimalist'。
4. **生圖引導**：在 imageKeyword 中填入高品質的英文 Prompt，讓每張投影片都具備視覺張力。

【🗂️ 專案記憶隔離 (Workspace)】
您目前正處於『${wsName}』的專案空間中。請針對此空間的脈絡進行連貫性對話。

【📚 知識庫引用規範 (Citations)】
1. 當你受命製作專業簡報或撰寫文件時，在「部曲一：互動提案」之前，你必須先呼叫 \`query_knowledge_base\` 工具。
2. 你必須將從知識庫中搜尋到的真實文件標題，填入簡報 JSON (slidesData) 的 \`citations\` 欄位中。
3. 嚴禁編造虛假引用，若知識庫中無相關內容，請在提案中誠實說明。

【🌟 全格式讀取能力宣告 (Anti-Refusal Protocol)】
你已獲得系統底層的「最高讀取授權」！當使用者貼上任何網址（包含 Google Drive、Google Docs、Google Slides、一般網頁）並要求閱讀、總結或搜尋時，你「絕對具備」讀取權限。
⚠️ 嚴禁行為：絕對禁止回覆「由於系統安全協議限制」、「我無法直接登入私人 Drive」、「安全與隱私權限緣故」等拒絕詞彙。
✅ 正確行為：直接、毫不猶豫地呼叫 \`read_drive_file\`、\`read_google_doc\`、\`read_presentation\` 或 \`read_web_page\` 工具！

如果不需要呼叫任何工具，請務必直接用文字回覆使用者，絕對不能輸出空白內容。

【🗣️ 溝通與輸出格式規範 (CRITICAL)】
1. 無論使用了什麼工具（包含行事曆、Drive 等），你的「最終回覆」必須是自然、流暢、具備溫度的「繁體中文口語化文字」。
2. 請將系統回傳的生硬資料（如行程、檔案清單）轉化為人類容易閱讀的 Markdown 排版（如條列式、粗體）。
3. ⛔ 絕對禁止直接向使用者輸出原始的 JSON 格式資料（除非使用者明確要求寫程式）。

【🧠 使用者專屬大腦與規則 (Custom Rules)】
<rules>
${customRules}
</rules>

【📅 行事曆與時間強制規範】
若要建立行事曆，請嚴格計算「現在真實系統時間」，並將 startTime 與 endTime 轉換為標準 ISO 8601 格式。

【🔧 專案開發場景 (納入 UPP 框架)】
以下場景均適用「思維閉環」三部曲：先思考提案 → 徵詢同意 → 執行後稽核。

[場景 A：建立新專案]
當使用者要求「自動部署全端」、「做一個 App」時：
1. **【思考】** 先說明你的技術架構選擇與潛在風險，徵得使用者同意。
2. 呼叫 \`create_database_sheet\` 建立資料庫，取得 \`sheetId\`。
3. 呼叫 \`deploy_fullstack_matrix\`，利用 additionalFiles 參數傳遞模組。
4. **【稽核】** 部署後，嘗試訪問網頁確認正常，再回報結果。

[場景 B：修改與熱更新已部署專案]
當使用者要求「修改」時：
1. **【思考】** 先分析影響範圍，說明只需修改哪個模組，避免破壞其他功能。
2. 僅呼叫 \`push_to_github\` 精準覆寫特定檔案，將破壞半徑降到最低。
3. **【稽核】** 更新後訪問網頁，確認功能正常後才回報。

[場景 C：災難復原 (Rollback)]
當使用者反應「剛剛的更新壞了」、「畫面卡死」、「退回上一版」時：
1. **【思考】** 先分析可能的錯誤原因，說明你的回退計畫。
2. 呼叫 \`rollback_github_deployment\` 退回 Git 版本。
3. **【稽核 + 修正方案】** 回退後訪問網頁確認，並向使用者提出根本原因與預防方案。

【📁 安全歸檔模式 (Safe Archive Assistant)】
當使用者要求「整理資料夾」、「集中歸檔」多個未知檔案時，請呼叫 \`scan_and_prepare_archive\`。取得資料後，請【強制】使用以下 5 個標題回覆使用者（請原封不動使用標題字眼）：
1. **【任務理解總結】**：簡述使用者的需求。
2. **【執行結果與研究大綱】**：說明建立狀況，並將新資料夾轉換為 Markdown 超連結。
3. **【主體內容：掃描歸檔清單】**：將搜出的檔案繪製成表格 (欄位必須為：檔案類型 | 檔案名稱 | 連結)。若回傳有 nextPageToken，請主動告知「還有更多檔案，是否需要載入下一頁？」。
4. **【批判思考/風險提示】**：加入 ⚠️ 符號，明確說明基於資料安全協議，需由使用者親自「拖曳搬移」，並針對掃描到的檔案給出版本控管建議。
5. **【行動方案/結論】**：引導使用者點擊連結進行搬移，並詢計是否需要進一步的 AI 分析服務。

【🖋️ 專業文件與簡報規範】
1. **Google Docs**: 
   - 標題級別嚴格遵守 H1 > H2 > H3。
   - 所有清單超過 3 項時，優先考慮使用表格 (Table) 呈現以利閱讀。
   - 必須包含「文件控制表」於文首。

2. **Google Slides**: 
   - 禁止連續兩張投影片使用相同 Layout。
   - 每一頁的文字量不可超過 100 字，其餘內容請放入「講者備忘錄」。
   - customColors 必須根據主題情感（商務、熱情、科技）挑選對比鮮明的 HEX 色碼。
   - imageKeyword 必須包含 'high quality', 'cinematic lighting', 'professional photography' 等修飾詞。

【👑 anyGem 全域代理人核心行為準則 (Universal Proxy Protocol)】
作為一個進化的代理人，你在執行「任何」具有影響力的工具任務前，必須遵守以下「思維閉環」三部曲：

部曲一：深度思考與互動提案 (Think & Propose)
1. **【思考鏈 (Thought Chain)】**：在採取任何行動前，你必須先用文字向使用者說明你的任務理解、採取的技術路徑、以及潛在的風險預判。
2. **【專業討論】**：如果是文件、簡報或開發任務，你必須先提供「大綱或架構提案」，徵得使用者同意或修改建議後才能正式動手。
3. **【重要！簡報提案嵌入標記】**：當任務為簡報時，在提案回覆的「最後一行」，你必須附加一段機器可讀的 JSON 標記，格式如下（不得更改標記名稱）：
   '<!--OUTLINE_DATA:[{"layout":"cover","title":"標題","notes_preview":"備忘錄摘要"},{"layout":"standard_list","title":"標題2","notes_preview":"備忘錄摘要"}]-->'
   該標記將被前端自動解析並顯示大綱確認編輯器，供使用者直接在介面上編輯大綱。
4. 詢問使用者意見，嚴禁跳過此步直接生成。

部曲二：品質預判與模擬 (Quality Pre-check)
1. 在動手前，針對使用者的特殊需求進行邏輯模擬。
2. 若預見到規格衝突（如頁數、字數、開發環境限制），必須主動提出並給予解決方案，而非盲目執行。

部曲三：執行、稽核與自動修正 (Execute, Audit & Self-Correct)
1. 呼叫工具執行任務。
2. **【強制自我稽核】**：
   - **簡報/文件**：生成後「必須讀回」內容，檢查排版、備忘錄與標題層級是否正確。
   - **專案開發**：部署後「必須嘗試訪問」網頁，檢查是否正常顯示。
   - **檔案整理**：完成後「必須掃描」目錄，確保結構無誤。
3. **【補償性修正】**：若稽核發現任何不完美（漏字、錯字、功能失效），你必須「自發性」再次呼叫工具進行修正，直到你確認結果「交件即完美」後，最後才向使用者回報並附上【驗證通過報告】。`;
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
            if (result.pass === false && result.auto_fixed_text) return result.auto_fixed_text;
        }
    } catch(e) { console.warn("QA Loop 失敗", e); }
    return text;
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
        if (!cand) throw new Error("API 未回傳內容");
        if (cand.finishReason === "SAFETY") throw new Error("被安全機制阻擋");
        
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
                            if (!pat) { toolResult = { status: "error", error_message: "未設定 GITHUB_PAT" }; break; }
                            try {
                                let createRes = UrlFetchApp.fetch(`https://api.github.com/user/repos`, { 
                                    method: "post", 
                                    headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github.v3+json" }, 
                                    contentType: "application/json", 
                                    payload: JSON.stringify({ name: args.repoName, auto_init: true, private: true }), 
                                    muteHttpExceptions: true 
                                });
                                let repoData = JSON.parse(createRes.getContentText());
                                let fullName = repoData.full_name || `${Session.getEffectiveUser().getEmail().split('@')[0]}/${args.repoName}`;
                                let filesToPush = [
                                    { path: "frontend/index.html", content: args.frontendCode },
                                    { path: "backend/Code.gs", content: args.backendCode },
                                    { path: "backend/appsscript.json", content: `{"timeZone": "Asia/Taipei", "dependencies": {}, "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE"}}` }
                                ];
                                if (args.additionalFiles) { try { let extraFiles = JSON.parse(args.additionalFiles); if (Array.isArray(extraFiles)) extraFiles.forEach(ef => { if (ef.path && ef.content) filesToPush.push(ef); }); } catch(e){} }
                                let pushCount = 0;
                                for (let f of filesToPush) {
                                    let apiUrl = `https://api.github.com/repos/${fullName}/contents/${f.path}`;
                                    let b64 = Utilities.base64Encode(Utilities.newBlob(f.content).getBytes());
                                    let res = UrlFetchApp.fetch(apiUrl, { method: "put", headers: { "Authorization": `Bearer ${pat}` }, contentType: "application/json", payload: JSON.stringify({ message: `Init ${f.path}`, content: b64 }), muteHttpExceptions: true });
                                    if (res.getResponseCode() < 300) pushCount++;
                                    Utilities.sleep(400); 
                                }
                                toolResult = { isTerminal: true, reply: `🚀 全端模組化部署完成！成功推送 ${pushCount} 個檔案。\nRepo: [${fullName}](https://github.com/${fullName})` };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "rollback_github_deployment":
                            let gPat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
                            try {
                                let cRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/commits?per_page=2`, { headers: { "Authorization": `Bearer ${gPat}` }, muteHttpExceptions: true });
                                let commits = JSON.parse(cRes.getContentText());
                                if (commits.length < 2) throw new Error("Commit 不足");
                                let prevSha = commits[1].sha;
                                UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/git/refs/heads/main`, { method: "patch", headers: { "Authorization": `Bearer ${gPat}` }, contentType: "application/json", payload: JSON.stringify({ sha: prevSha, force: true }), muteHttpExceptions: true });
                                toolResult = { isTerminal: true, reply: `⏪ Rollback 成功！已退回至 ${prevSha.substring(0, 7)}。` };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "create_calendar_event":
                            let s = new Date(args.startTime); let ed = args.endTime ? new Date(args.endTime) : new Date(s.getTime() + 3600000);
                            let cal = CalendarApp.getDefaultCalendar();
                            if (args.calendarName) { const cals = CalendarApp.getCalendarsByName(args.calendarName); if (cals.length > 0) cal = cals[0]; }
                            const ev = cal.createEvent(args.title, s, ed, { description: args.description || "anyGem AI", guests: args.guests, sendInvites: !!args.guests });
                            toolResult = { status: "success", reply: `✅ 已建立行程：${args.title}`, url: `https://calendar.google.com/calendar/r/eventedit/${ev.getId().split('@')[0]}` }; 
                            break;

                        case "batch_create_calendar_events":
                            let list = JSON.parse(args.eventsData); let cCount = 0; let bCal = CalendarApp.getDefaultCalendar();
                            list.forEach(e => { let st = new Date(e.startTime); let en = e.endTime ? new Date(e.endTime) : new Date(st.getTime() + 3600000); if (!isNaN(st.getTime())) { bCal.createEvent(e.title, st, en, { description: e.description }); cCount++; } });
                            toolResult = { status: "success", reply: `成功批次寫入 ${cCount} 筆行程` }; break;
                        case "get_calendar_events":
                            let qs = new Date(args.startDate), qe = new Date(args.endDate); let evs = CalendarApp.getDefaultCalendar().getEvents(qs, qe);
                            let details = evs.length === 0 ? "無行程" : evs.map(e => `[${e.getStartTime().toLocaleString()}] ${e.getTitle()}`).join("\n");
                            toolResult = { status: "success", data: details }; break;
                        case "read_unread_emails":
                            let threads = GmailApp.getInboxThreads(0, args.limit || 5);
                            let data = threads.filter(t => t.isUnread()).map(t => { let m = t.getMessages()[0]; return `[${m.getFrom()}] ${m.getSubject()}: ${m.getPlainBody().substring(0, 300)}`; }).join("\n\n");
                            toolResult = { status: "success", data: data || "無未讀信件" }; break;
                        case "send_email_or_draft":
                            if (args.isDraft) GmailApp.createDraft(args.recipient, args.subject, args.body); else GmailApp.sendEmail(args.recipient, args.subject, args.body);
                            toolResult = { isTerminal: true, reply: "已發送或存入草稿" }; break;
                        
                        case "create_survey_form":
                            try {
                                let form = FormApp.create(args.title); if (args.description) form.setDescription(args.description);
                                let qs = Array.isArray(args.questions) ? args.questions : JSON.parse(args.questions.replace(/```json/gi,'').replace(/```/g,''));
                                qs.forEach(q => { 
                                    let item; switch (q.type) {
                                        case 'MULTIPLE_CHOICE': item = form.addMultipleChoiceItem().setTitle(q.title); if (q.choices) item.setChoiceValues(q.choices); break;
                                        case 'CHECKBOX': item = form.addCheckboxItem().setTitle(q.title); if (q.choices) item.setChoiceValues(q.choices); break;
                                        case 'LIST': item = form.addListItem().setTitle(q.title); if (q.choices) item.setChoiceValues(q.choices); break;
                                        case 'DATE': item = form.addDateItem().setTitle(q.title); break;
                                        case 'TIME': item = form.addTimeItem().setTitle(q.title); break;
                                        case 'PARAGRAPH': item = form.addParagraphTextItem().setTitle(q.title); break;
                                        default: item = form.addTextItem().setTitle(q.title); break;
                                    }
                                    if (q.required) item.setRequired(true);
                                });
                                toolResult = { isTerminal: true, reply: `📋 表單已建立：[編輯](${form.getEditUrl()}) | [發布](${form.getPublishedUrl()})` }; 
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;
                        
                        case "create_drive_folder":
                            try {
                                let newF; if (args.parentFolderUrl) { let pId = args.parentFolderUrl.match(/[-\w]{25,}/)[0]; newF = DriveApp.getFolderById(pId).createFolder(args.folderName); }
                                else newF = DriveApp.createFolder(args.folderName);
                                toolResult = { status: "success", reply: `成功建立資料夾`, data: { url: newF.getUrl(), id: newF.getId() } };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "search_drive_files":
                            try {
                                let q = `fullText contains '${args.keyword.replace(/'/g, "\\'")}' and trashed = false`;
                                if (args.folderId) q += ` and '${args.folderId.match(/[-\w]{25,}/)[0]}' in parents`;
                                let resp = Drive.Files.list({ q: q, maxResults: args.maxResults || 30, pageToken: args.pageToken });
                                let resItems = (resp.items || []).map(f => ({ name: f.title, url: f.alternateLink, id: f.id, type: f.mimeType }));
                                toolResult = { status: "success", data: resItems, nextPageToken: resp.nextPageToken };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "query_knowledge_base":
                            try {
                                const kbId = config.configData.KNOWLEDGE_BASE_FOLDER_ID;
                                if (!kbId) { toolResult = { status: "warning", reply: "⚠️ 未設定 KNOWLEDGE_BASE_FOLDER_ID" }; break; }
                                let filesIter = DriveApp.getFolderById(kbId).searchFiles(`fullText contains '${args.query.replace(/'/g, "\\'")}' and trashed = false`);
                                let kbRes = []; let limit = 3;
                                while (filesIter.hasNext() && kbRes.length < limit) {
                                    let f = filesIter.next();
                                    kbRes.push(`[${f.getName()}]\n${extractTextFromAnyFile(f, config.apiKey).substring(0, 5000)}`);
                                }
                                toolResult = { status: "success", data: kbRes.join("\n\n---\n\n") || "未找到內容" };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;
                             
                        case "scan_and_prepare_archive":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                let fName = args.keyword + " 資料夾";
                                let folders = DriveApp.searchFolders(`title = '${fName}' and trashed = false`);
                                let nFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(fName);
                                let resp = Drive.Files.list({ q: `title contains '${safeKw}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`, maxResults: 50, pageToken: args.pageToken });
                                let items = (resp.items || []).map(f => ({ "檔案類型": f.mimeType, "檔案名稱": f.title, "連結": f.alternateLink }));
                                toolResult = { status: "success", data: { folderUrl: nFolder.getUrl(), items: items, nextPageToken: resp.nextPageToken } };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "move_drive_file":
                            try {
                                let fileId = args.fileIdentifier.match(/[-\w]{25,}/) ? args.fileIdentifier.match(/[-\w]{25,}/)[0] : DriveApp.getFilesByName(args.fileIdentifier).next().getId();
                                let folderId = args.folderIdentifier.match(/[-\w]{25,}/) ? args.folderIdentifier.match(/[-\w]{25,}/)[0] : (DriveApp.getFoldersByName(args.folderIdentifier).hasNext() ? DriveApp.getFoldersByName(args.folderIdentifier).next().getId() : DriveApp.createFolder(args.folderIdentifier).getId());
                                DriveApp.getFileById(fileId).moveTo(DriveApp.getFolderById(folderId));
                                toolResult = { isTerminal: true, reply: "🚚 檔案已搬移成功" };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "read_drive_file":
                        case "read_google_doc":
                        case "read_presentation":
                        case "read_web_page":
                            // 統一呼叫路由
                            try {
                                let resContent = "";
                                if (fnName === 'read_web_page') {
                                    let options = { muteHttpExceptions: true };
                                    let r = UrlFetchApp.fetch("https://r.jina.ai/" + args.url, options);
                                    resContent = (r.getResponseCode() === 200) ? r.getContentText() : UrlFetchApp.fetch(args.url, options).getContentText().replace(/<[^>]+>/g, ' ');
                                } else {
                                    let id = (args.fileUrl || args.docUrl || args.presentationUrl || "").match(/[-\w]{25,}/)[0];
                                    resContent = (fnName === 'read_presentation') ? extractTextFromPresentation(id) : extractTextFromAnyFile(DriveApp.getFileById(id), config.apiKey);
                                }
                                toolResult = { status: "success", data: resContent.substring(0, 30000) };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "create_google_doc":
                        case "append_to_google_doc":
                        case "overwrite_google_doc":
                            try {
                                if (fnName === 'create_google_doc') {
                                    let doc = createDocFromContent(args.topic, args.content);
                                    if (args.folderName) moveFileToFolderByName(doc.id, args.folderName);
                                    toolResult = { isTerminal: true, reply: `📄 Google 文件已生成：[點擊開啟](${doc.url})` };
                                } else {
                                    let doc = DocumentApp.openById(args.docUrl.match(/[-\w]{25,}/)[0]);
                                    if (fnName === 'overwrite_google_doc') doc.getBody().clear(); else doc.getBody().appendParagraph("\n");
                                    appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose();
                                    toolResult = { isTerminal: true, reply: `📄 內容已更新！` };
                                }
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "read_google_sheet":
                        case "append_to_google_sheet":
                        case "update_google_sheet":
                            try {
                                let ss = args.sheetUrl ? SpreadsheetApp.openById(args.sheetUrl.match(/[-\w]{25,}/)[0]) : config.ss;
                                let sh = args.sheetName ? ss.getSheetByName(args.sheetName) : ss.getSheets()[0];
                                if (!sh && fnName === 'append_to_google_sheet') sh = ss.insertSheet(args.sheetName);
                                
                                if (fnName === 'read_google_sheet') {
                                    toolResult = { status: "success", data: (!args.range || args.range === 'ALL') ? sh.getDataRange().getDisplayValues() : sh.getRange(args.range).getDisplayValues() };
                                } else {
                                    if (["Setting", "Gems", "Models"].includes(args.sheetName)) throw new Error("受保護的頁籤");
                                    let rawData = args.content || args.rowData;
                                    let data = JSON.parse(sanitizeJson(String(rawData)));
                                    if (!Array.isArray(data)) data = [data];
                                    if (!Array.isArray(data[0])) data = [data];
                                    if (fnName === 'append_to_google_sheet') sh.getRange(sh.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
                                    else sh.getRange(args.range).setValues(data);
                                    toolResult = { isTerminal: true, reply: "✅ 試算表資料已更新" };
                                }
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "generate_art":
                            try {
                                let blob = fetchAIImage(args.prompt, config.apiKey, config.artistModel, args.aspectRatio || "1:1");
                                if (blob && typeof blob !== 'string') {
                                    finalImage = Utilities.base64Encode(blob.getBytes()); finalMime = "image/png";
                                    toolResult = { isTerminal: true, reply: `🎨 圖像已繪製完成！` };
                                } else throw new Error(blob || "生圖失敗");
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "create_presentation":
                        case "update_presentation":
                            try {
                                let theme = args.customColors ? JSON.parse(sanitizeJson(args.customColors)) : PPT_THEMES['modern_blue'];
                                let sData = JSON.parse(sanitizeJson(args.slidesData));
                                let pid;
                                if (fnName === 'create_presentation') {
                                    pid = createGeometricSlides(args.topic, sData, theme, args.shapeStyle, config.configData.autoImageEnabled, config.apiKey, config.artistModel, args.globalLogoUrl, args.contentDensity);
                                    toolResult = { isTerminal: false, reply: `📊 簡報已生成！[開啟連結](https://docs.google.com/presentation/d/${pid}/edit)\n請稽核內容。`, presentationId: pid };
                                } else {
                                    pid = args.presentationUrl.match(/[-\w]{25,}/)[0];
                                    updateGeometricSlides(pid, args.action, sData, theme, args.shapeStyle, config.configData.autoImageEnabled, config.apiKey, config.artistModel, args.globalLogoUrl, args.contentDensity);
                                    toolResult = { isTerminal: true, reply: `📊 簡報已更新！` };
                                }
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;
                            
                        default: toolResult = { status: "success", reply: "OK" };
                    }
                } catch (e) { toolResult = { status: "error", error_message: e.toString() }; }

                if (toolResult.isTerminal) return { reply: toolResult.reply, model: "Agent-Executor", image: finalImage, mime: finalMime };
                toolResponses.push({ functionResponse: { name: fnName, response: toolResult, id: part.functionCall.id } });
            }
            currentHistory.push({ role: "user", parts: toolResponses });
            isFirstTurn = false; continue;
        } else {
            finalReply = responseParts.map(p => p.text || "").join("\n").trim(); break;
        }
    }
    if (finalReply) finalReply = performInnerQALoop(finalReply, config.apiKey, false);
    return { reply: finalReply || "執行完成", model: finalModel, image: finalImage, mime: finalMime };
}

function callGeminiAPI_Raw({ prompt, model, apiKey, systemInstruction, history = [], tools = [], imageData = null, isFunctionResponse = false }) {
    const contents = history.map(x => ({ role: x.role, parts: x.parts ? [...x.parts] : [{ text: x.content || "" }] }));
    if (!isFunctionResponse && prompt) {
        let userPart = imageData ? [{ text: prompt }, { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }] : [{ text: prompt }];
        if (contents.length > 0 && contents[contents.length - 1].role === "user") contents[contents.length - 1].parts.push(...userPart);
        else contents.push({ role: 'user', parts: userPart });
    }
    const payload = { contents: contents };
    if (tools.length > 0 && !imageData) payload.tools = tools;
    if (systemInstruction) payload.system_instruction = { parts: [{ text: systemInstruction }] };

    for (let i = 1; i <= 3; i++) {
        const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const json = JSON.parse(res.getContentText());
        if (json.error) {
            if (json.error.message.includes("Quota") && i < 3) { Utilities.sleep(i * 10000); continue; }
            throw new Error(json.error.message);
        }
        return json;
    }
}

function getOptimizedHistoryFB(db, wsName, sessionId) {
    const cache = CacheService.getScriptCache(); const cacheKey = `history_${wsName}_${sessionId}`;
    const cachedData = cache.get(cacheKey); if (cachedData) return JSON.parse(cachedData);
    try {
        const session = db.get("sessions", sessionId); if (!session || !session.history_json) return [];
        let hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json);
        const geminiHistory = []; const MAX_CHARS = 40000; let charCount = 0;
        for (let i = hist.length - 1; i >= 0; i--) {
            let text = hist[i].text || ""; if (!text.trim()) continue;
            if (charCount + text.length > MAX_CHARS) break;
            geminiHistory.unshift({ role: (hist[i].role === 'ai' ? 'model' : 'user'), content: text }); charCount += text.length;
        }
        cache.put(cacheKey, JSON.stringify(geminiHistory), 21600); return geminiHistory;
    } catch(e) { return []; }
}

function logToFirebaseAndCache(db, wsName, sessionId, userMsg, aiReply) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
        let session = db.get("sessions", sessionId) || { workspace: wsName, session_id: sessionId, title: userMsg ? userMsg.substring(0, 25) : "新對話", pinned: false, history_json: [] };
        let hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json || "[]");
        if (userMsg) hist.push({ role: "user", text: userMsg }); 
        if (aiReply) hist.push({ role: "ai", text: aiReply });
        session.updated_at = new Date(); session.history_json = hist; db.write("sessions", sessionId, session);
    } catch(e) {} finally { lock.releaseLock(); }
    try {
        const cache = CacheService.getScriptCache(); const cacheKey = `history_${wsName}_${sessionId}`;
        let h = JSON.parse(cache.get(cacheKey) || "[]");
        if(userMsg) h.push({ role: "user", content: userMsg }); if(aiReply) h.push({ role: "model", content: aiReply });
        if (h.length > 20) h = h.slice(h.length - 20); cache.put(cacheKey, JSON.stringify(h), 21600);
    } catch(e) {}
}
