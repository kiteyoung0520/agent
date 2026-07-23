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