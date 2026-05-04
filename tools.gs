/**
 * tools.gs - anyGem 通用工具與外部 API
 */

function fetchYouTubeTranscriptNative(videoId) {
    try {
        const html = UrlFetchApp.fetch(`https://www.youtube.com/watch?v=${videoId}`).getContentText();
        const match = html.match(/"captionTracks":\[\{"baseUrl":"(https[^"]+)"/);
        if (!match) return "無字幕";
        const xml = UrlFetchApp.fetch(match[1].replace(/\\u0026/g, "&")).getContentText();
        const tMatch = xml.match(/<text[^>]*>(.*?)<\/text>/g);
        return tMatch ? tMatch.map(t => t.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&')).join(" ") : "解析失敗";
    } catch(e) { return "抓取失敗"; }
}

function fetchAIImage(prompt, key, model, aspectRatio = "1:1") {
    try {
        let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        let payload = { contents: [{ parts: [{ text: prompt + ` (Aspect Ratio: ${aspectRatio})` }] }], generationConfig: { responseModalities: ["IMAGE"] } };
        if (model.includes("imagen")) {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
            payload = { instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: aspectRatio } };
        }
        const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const json = JSON.parse(res.getContentText());
        if (json.error) return json.error.message;
        let b64 = model.includes("imagen") ? json.predictions?.[0]?.bytesBase64Encoded : json.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        return b64 ? Utilities.newBlob(Utilities.base64Decode(b64), "image/png") : "無影像資料";
    } catch(e) { return e.toString(); }
}

function fetchIconImage(keyword, color, bg) {
    try {
        let c = color.replace('#','');
        let res = UrlFetchApp.fetch(`https://img.icons8.com/ios-filled/100/${c}/${encodeURIComponent(keyword)}.png`, {muteHttpExceptions: true});
        return res.getResponseCode() === 200 ? res.getBlob() : null;
    } catch(e) { return null; }
}

function getOrCreateSubFolder(parent, name) { 
    let it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); 
}

function moveFileToFolderByName(fileId, folderName) { 
    try { 
        let f = DriveApp.getFileById(fileId); 
        let its = DriveApp.getFoldersByName(folderName); 
        let target = its.hasNext() ? its.next() : DriveApp.createFolder(folderName); 
        f.moveTo(target); return target.getUrl(); 
    } catch(e) { return null; } 
}
