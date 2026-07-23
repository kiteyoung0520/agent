class FirebaseClient {
    constructor() {
        const props = PropertiesService.getScriptProperties();
        this.projectId = props.getProperty('FB_PROJECT_ID') || 'anygem-r1';
        this.apiKey = props.getProperty('FB_API_KEY') || 'AIzaSyBc2UgxhcagZtH06HVpJHTZ4XRUMn8kIEo';
        
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

    queryAllSessions() {
        if (!this.apiKey) return [];
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;
        const payload = { structuredQuery: { from: [{ collectionId: "sessions" }], limit: 500 } };
        const res = this.fetchWithRetry(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        if (!res) return []; const json = JSON.parse(res.getContentText()); const results = [];
        if (Array.isArray(json)) json.forEach(item => { if (item.document && item.document.fields) results.push(this._parseData(item.document.fields)); });
        return results;
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