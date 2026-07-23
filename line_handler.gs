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
            
            const triggerMsg = userMessage.toLowerCase();
            if (triggerMsg === '新對話' || triggerMsg === '/clear' || triggerMsg === '清除對話') {
                db.delete("sessions", session_id);
                CacheService.getScriptCache().remove(`history_${wsName}_${session_id}`);
                
                UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lineToken },
                    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: "✨ 已為您開啟新對話！過去的記憶已清除，我們重新開始吧！" }] })
                });
                return;
            }

            let targetSheet = ss ? ss.getSheetByName(wsName) : null;
            if (!targetSheet && ss) {
                targetSheet = ss.insertSheet(wsName);
                targetSheet.appendRow(["🔥 LINE 機器人專區", "來自 LINE 的對話將儲存於此空間對應的 Firebase 中。"]);
                targetSheet.getRange("A1:B1").setFontColor("red").setFontWeight("bold");
            }

            let fallbackModel = "gemini-2.5-flash";
            try {
                const modelSheet = ss ? ss.getSheetByName("Models") : null;
                if (modelSheet && modelSheet.getLastRow() > 1) {
                    fallbackModel = String(modelSheet.getRange(2, 2).getValue()).trim() || fallbackModel;
                }
            } catch(e) {}

            const history = getOptimizedHistoryFB(db, wsName, session_id);
            
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

            if (draw_mode) {
                finalTools = [{ functionDeclarations: AGENT_TOOLS[0].functionDeclarations.filter(t => t.name === "generate_art") }];
                finalSystemInstruction += `\n\n【🎨 強制繪圖模式】使用者要求畫圖，請將使用者的文字轉換為詳細的英文畫面描述，並直接輸出 Markdown 圖片語法 "![圖片描述](https://image.pollinations.ai/prompt/經過URL編碼的英文提示詞?width=800&height=800&nologo=true)"。不要講廢話。`;
            } else if (web_search) {
                finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
                finalSystemInstruction += `\n\n【🌍 聯網搜尋模式】使用者正在詢問外部資訊，請優先使用 google_search 與 read_web_page 工具提供最新答案。`;
            } else {
                finalTools = JSON.parse(JSON.stringify(AGENT_TOOLS));
            }

            try {
                const agentResult = runAutonomousAgentLoop({
                    ss: ss, apiKey: apiKey, prompt: actualMessage, 
                    model: CONFIG.MODEL_LINE || fallbackModel,
                    wsName: wsName, sessionId: session_id || "default",
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