// 延遲載入設定，避免未授權時全域初始化崩潰
function getBaseConfig() {
    const props = PropertiesService.getScriptProperties();
    return {
        TIMEOUT_LIMIT: 240000,
        SHEET_ID: props.getProperty('SHEET_ID') || "1b9Ge4uVe21kgPGVIqt0BTmd_8yPIfxWqazDIxnaSvKw",
        SETTING_SHEET_NAME: "Setting"
    };
}
// 向下相容性包裝，首次實際呼叫時才讀取
const BASE_CONFIG = new Proxy({}, {
    get(_, key) { 
        const val = getBaseConfig()[key];
        if (val) return val;
        if (key === 'SHEET_ID') return "1b9Ge4uVe21kgPGVIqt0BTmd_8yPIfxWqazDIxnaSvKw";
        if (key === 'SETTING_SHEET_NAME') return "Setting";
        return null;
    }
});

function loadSettings(ss) {
    const s = { CUSTOM_RULES: "" };
    const sh = ss.getSheetByName(BASE_CONFIG.SETTING_SHEET_NAME) || ss.getSheetByName("setting") || ss.getSheetByName("設定");
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

function getAccumulatedGeminiApiKeys(CONFIG) {
    const keys = [];
    
    // 1. 從 Script Properties 載入
    try {
        const props = PropertiesService.getScriptProperties().getProperties();
        
        // 支援 GEMINI_API_KEY (可以是逗號分隔的多個 Key)
        if (props['GEMINI_API_KEY']) {
            props['GEMINI_API_KEY'].split(',').forEach(k => keys.push(k.trim()));
        }
        
        // 支援 GEMINI_API_KEY_2, GEMINI_API_KEY_3... 等編號金鑰
        Object.keys(props)
            .filter(k => k.startsWith('GEMINI_API_KEY_'))
            .sort()
            .forEach(k => keys.push(props[k].trim()));
    } catch (e) {
        console.error("讀取 Script Properties 金鑰失敗:", e);
    }
    
    // 2. 從試算表設定載入 (作為備援或額外擴充)
    if (CONFIG) {
        if (CONFIG.GEMINI_API_KEY) {
            CONFIG.GEMINI_API_KEY.split(',').forEach(k => keys.push(k.trim()));
        }
        // 遍歷 CONFIG 物件找出 GEMINI_API_KEY_2 等編號金鑰
        Object.keys(CONFIG)
            .filter(k => k.startsWith('GEMINI_API_KEY_'))
            .sort()
            .forEach(k => keys.push(CONFIG[k].trim()));
    }
    
    // 去除重複值與空值
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    
    return uniqueKeys.join(',');
}

function fetchGoogleAPIWithRotation(urlTemplate, payload, apiKey, method = "post") {
    // 1. 解析金鑰清單
    let keys = [];
    if (apiKey) {
        keys = apiKey.split(',').map(k => k.trim()).filter(Boolean);
    }
    if (keys.length === 0) {
        throw new Error("找不到任何有效的 API Key！");
    }

    const cache = CacheService.getScriptCache();
    
    // 獲取非失效金鑰清單
    function getActiveKeys() {
        return keys.filter(k => !cache.get("key_blocked_" + k.substring(0, 15)));
    }

    let activeKeys = getActiveKeys();
    if (activeKeys.length === 0) {
        // 全失效時重置所有標記
        keys.forEach(k => cache.remove("key_blocked_" + k.substring(0, 15)));
        activeKeys = keys;
    }

    let lastError = "";
    
    for (let keyIndex = 0; keyIndex < activeKeys.length; keyIndex++) {
        const currentKey = activeKeys[keyIndex];
        const cacheKey = "key_blocked_" + currentKey.substring(0, 15);
        
        // 替換 URL 中的 {KEY} 佔位符
        const finalUrl = urlTemplate.replace("{KEY}", currentKey);
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const options = {
                    method: method,
                    contentType: "application/json",
                    muteHttpExceptions: true
                };
                if (payload) {
                    options.payload = JSON.stringify(payload);
                }
                
                const res = UrlFetchApp.fetch(finalUrl, options);
                const resText = res.getContentText();
                let json = {};
                try {
                    json = JSON.parse(resText);
                } catch (e) {
                    throw new Error(`回傳內容非 JSON 格式: ${resText}`);
                }
                
                if (json.error) {
                    let errMsg = json.error.message || "";
                    if (errMsg.includes("Quota exceeded") || errMsg.includes("429") || res.getResponseCode() === 429) {
                        // 🚀 [自動彈性降級] 如果使用 Pro 高階模型且觸發免費額度限制 (2 RPM)，自動降級為 Flash 模型重試
                        if (finalUrl.includes("-pro")) {
                            console.warn("金鑰 [" + currentKey.substring(0, 7) + "...] 呼叫 Pro 模型達限制，自動降級至 Flash 模型重試。");
                            const fallbackUrl = finalUrl.replace("-pro", "-flash");
                            try {
                                const retryRes = UrlFetchApp.fetch(fallbackUrl, options);
                                const retryText = retryRes.getContentText();
                                const retryJson = JSON.parse(retryText);
                                if (!retryJson.error) {
                                    console.log("降級重試成功！自動使用搭配相對金鑰權限的最新 Flash 模型。");
                                    return retryJson;
                                }
                            } catch(retryErr) {
                                console.warn("降級重試失敗: " + retryErr.toString());
                            }
                        }
                        
                        console.warn("金鑰 [" + currentKey.substring(0, 7) + "...] 已達配額限制，標記失效 10 分鐘，嘗試切換下一組。");
                        cache.put(cacheKey, "true", 600);
                        lastError = errMsg;
                        break; // 跳出當前金鑰的 attempt，換下一個金鑰
                    }
                    
                    if (attempt < 3) {
                        Utilities.sleep(attempt * 2000);
                        continue;
                    }
                    lastError = errMsg;
                    break; // 跳出當前金鑰，換下一個金鑰
                }
                
                return json; // 成功！
            } catch (err) {
                lastError = err.toString();
                if (attempt < 3) {
                    Utilities.sleep(attempt * 2000);
                    continue;
                }
                break; // 換下一個金鑰
            }
        }
    }
    
    throw new Error(`所有配給的 Google API 金鑰均不可用。最後錯誤：${lastError}`);
}

function getOrCreateAnyGemFolder() {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty('ANYGEM_FOLDER_ID');
    if (folderId) {
        try {
            return DriveApp.getFolderById(folderId);
        } catch(e) {
            // Folder might have been deleted, recreate
        }
    }
    
    // Find or create "anyGem_Storage" folder
    const folders = DriveApp.getFoldersByName("anyGem_Storage");
    let folder;
    if (folders.hasNext()) {
        folder = folders.next();
    } else {
        folder = DriveApp.createFolder("anyGem_Storage");
    }
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    props.setProperty('ANYGEM_FOLDER_ID', folder.getId());
    return folder;
}

function saveImageToDrive(base64Data, filename = "AI_Image.png") {
    if (!base64Data) return null;
    if (String(base64Data).startsWith("http")) return base64Data;
    try {
        const folder = getOrCreateAnyGemFolder();
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png", filename);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
    } catch(e) {
        console.error("Save image to Drive failed:", e);
        return null;
    }
}

function saveArtifactToDrive(code, toolName) {
    if (!code) return null;
    try {
        const folder = getOrCreateAnyGemFolder();
        const safeName = String(toolName || "tool").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "_");
        const filename = `${safeName}_${new Date().getTime()}.html`;
        const file = folder.createFile(filename, code, MimeType.HTML);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return file.getId();
    } catch(e) {
        console.error("Save artifact to Drive failed:", e);
        return null;
    }
}