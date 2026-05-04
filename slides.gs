/**
 * slides.gs - anyGem 簡報視覺生成引擎
 */

function createGeometricSlides(topic, slidesData, theme, style, enableAutoImage, apiKey, artistModel, globalLogoUrl, contentDensity) {
    const deck = SlidesApp.create(`PPT: ${topic}`); 
    const slides = deck.getSlides(); if (slides.length > 0) slides[0].remove();
    appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel, globalLogoUrl, contentDensity);
    deck.saveAndClose(); 
    try { DriveApp.getFileById(deck.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e) {}
    return deck.getId();
}

function updateGeometricSlides(presentationId, action, slidesData, theme, style, enableAutoImage, apiKey, artistModel, globalLogoUrl, contentDensity) {
    const deck = SlidesApp.openById(presentationId);
    if (String(action).toLowerCase().trim() === 'overwrite') {
        const temp = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        deck.getSlides().forEach(s => { if (s.getObjectId() !== temp.getObjectId()) s.remove(); });
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel, globalLogoUrl, contentDensity);
        temp.remove(); 
    } else {
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel, globalLogoUrl, contentDensity);
    }
    deck.saveAndClose();
}

function appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel, globalLogoUrl, contentDensity) {
    let mShape = SlidesApp.ShapeType.RECTANGLE; let cShape = SlidesApp.ShapeType.ELLIPSE; 
    if (style === 'rounded') { mShape = SlidesApp.ShapeType.ROUND_RECTANGLE; cShape = SlidesApp.ShapeType.ROUND_RECTANGLE; }
    else if (style === 'cyber') { mShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; cShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; }
    else if (style === 'dynamic') { mShape = SlidesApp.ShapeType.PARALLELOGRAM; cShape = SlidesApp.ShapeType.PARALLELOGRAM; }

    let logoBlob = globalLogoUrl ? UrlFetchApp.fetch(globalLogoUrl).getBlob() : null;

    slidesData.forEach((d, i) => {
        const slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); slide.getBackground().setSolidFill(theme.bg);
        if (logoBlob) try { slide.insertImage(logoBlob, 650, 20, 50, 50); } catch(e){}

        // 寫入備忘錄與來源
        try {
            const notes = slide.getNotesPage();
            let nTxt = (d.speakerNotes || d.speaker_notes || d.notes || "") + (d.citations ? `\n\n📖 [來源]:\n${d.citations}` : "");
            if (nTxt.trim()) {
                let body = notes.getPlaceholder(SlidesApp.PlaceholderType.BODY) || notes.getPlaceholders().find(p => p.getPlaceholderType() !== SlidesApp.PlaceholderType.TITLE);
                if (body) body.asShape().getText().setText(nTxt);
                else notes.insertShape(SlidesApp.ShapeType.TEXT_BOX, 18, 18, 684, 250).getText().setText(nTxt);
            }
        } catch(e){}

        let layout = (i === 0) ? 'cover' : (d.layout || 'standard_list');
        let imgBlob = null; let kw = d.imageKeyword || d.title || "business";
        if (enableAutoImage && ['cover', 'image_right', 'image_left'].includes(layout)) {
            Utilities.sleep(3000);
            let res = fetchAIImage(`Professional photography, ${kw}`, apiKey, artistModel, "16:9");
            if (res && typeof res !== 'string') imgBlob = res;
        }
        
        let content = d.content || (d.points ? d.points.join('\n') : "");
        switch(layout) {
            case 'cover':
                if (imgBlob) { slide.insertImage(imgBlob, 0, 0, 720, 405); drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, theme.bg, 0.7); }
                else { drawShape(slide, cShape, 450, -50, 450, 450, theme.shape, 0.5); }
                addText(slide, d.title, 50, 150, 600, 100, theme.text, 36, true); break;
            case 'image_right':
                if (imgBlob) slide.insertImage(imgBlob, 360, 0, 360, 405); else drawShape(slide, mShape, 360, 0, 360, 405, theme.shape, 0.3);
                addText(slide, d.title, 50, 40, 300, 60, theme.accent, 28, true);
                addText(slide, content, 50, 120, 300, 250, theme.text, 14, false); break;
            case 'standard_list':
            default:
                drawShape(slide, mShape, 0, 0, 50, 450, theme.accent, 0.5);
                addText(slide, d.title, 80, 40, 600, 60, theme.accent, 28, true);
                addText(slide, content, 80, 120, 550, 250, theme.text, 16, false); break;
        }
    });
}

function extractTextFromPresentation(presentationId) {
    const pres = SlidesApp.openById(presentationId);
    let full = "";
    pres.getSlides().forEach((s, idx) => {
        full += `\n--- Slide ${idx + 1} ---\n`;
        s.getPageElements().forEach(el => {
            if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) full += el.asShape().getText().asString().trim() + "\n";
        });
        const nPage = s.getNotesPage();
        if (nPage) nPage.getPageElements().forEach(el => { if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) full += "[Note]: " + el.asShape().getText().asString().trim() + "\n"; });
    });
    return full.substring(0, 30000);
}

function drawShape(s, t, x, y, w, h, c, a) { let sh = s.insertShape(t, x, y, w, h); sh.getBorder().setTransparent(); sh.getFill().setSolidFill(c, a); return sh; }
function addText(s, t, x, y, w, h, c, sz, b) { 
    if(!t) return; 
    let box = s.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, w, h); 
    let fs = sz; if (t.length > 500) fs = 10; else if (t.length > 200) fs = 12;
    box.getText().setText(t).getTextStyle().setFontSize(fs).setForegroundColor(c).setBold(b); 
}

function sanitizeJson(str) {
    if (!str) return "[]";
    let clean = str.replace(/```json/gi, '').replace(/```/g, '').trim();
    let res = ""; let inQ = false;
    for (let i = 0; i < clean.length; i++) {
        if (clean[i] === '"' && (i === 0 || clean[i-1] !== '\\')) inQ = !inQ;
        if (inQ && (clean[i] === '\n' || clean[i] === '\r')) res += "\\n";
        else res += clean[i];
    }
    return res;
}
