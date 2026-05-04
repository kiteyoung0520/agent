/**
 * docs.gs - anyGem 內容生產與文件讀取中心
 */

function createDocFromContent(title, content) {
    const doc = DocumentApp.create(title); const body = doc.getBody(); body.clear();
    const tPara = body.appendParagraph(title); tPara.setHeading(DocumentApp.ParagraphHeading.TITLE).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    appendMarkdownToBody(body, content);
    doc.saveAndClose(); 
    try { DriveApp.getFileById(doc.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e){}
    return { url: doc.getUrl(), id: doc.getId() };
}

function appendMarkdownToBody(body, content) {
    let lines = content.split('\n');
    lines.forEach(line => {
        let t = line.trim();
        if (t.startsWith('# ')) body.appendParagraph(t.substring(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
        else if (t.startsWith('## ')) body.appendParagraph(t.substring(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        else if (t.startsWith('* ') || t.startsWith('- ')) body.appendListItem(t.substring(2)).setGlyphType(DocumentApp.GlyphType.BULLET);
        else if (t) body.appendParagraph(t);
        else body.appendParagraph("");
    });
}

function extractTextFromAnyFile(file, apiKey) {
    try {
        const mime = file.getMimeType();
        if (mime === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
        if (mime === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(file.getId()).getSheets().map(sh => sh.getName() + ":\n" + sh.getDataRange().getDisplayValues().map(r => r.join("\t")).join("\n")).join("\n\n");
        if (mime === MimeType.GOOGLE_SLIDES) return extractTextFromPresentation(file.getId());
        if (mime === MimeType.PLAIN_TEXT || mime === MimeType.CSV) return file.getBlob().getDataAsString();
        
        // OCR 支援
        if (mime === MimeType.PDF || mime.startsWith('image/')) {
            try {
                const temp = Drive.Files.copy({ title: "OCR_Temp", mimeType: MimeType.GOOGLE_DOCS }, file.getId(), { ocr: true, ocrLanguage: 'zh-TW' });
                const txt = DocumentApp.openById(temp.id).getBody().getText();
                Drive.Files.remove(temp.id);
                return txt || "OCR 無結果";
            } catch(e) { return "OCR 失敗: " + e.toString(); }
        }
        return `不支援的格式: ${mime}`;
    } catch(e) { return "讀取失敗: " + e.toString(); }
}
