const { google } = require('googleapis');
const { BrowserWindow } = require('electron');
const http = require('http');
const url = require('url');

class GoogleAuthManager {
    constructor() {
        this.oauth2Client = null;
        this.drive = null;
        this.userInfo = null;
    }

    init(clientId, clientSecret, redirectUri = 'http://localhost:3000/oauth2callback') {
        if (!clientId || !clientSecret) return false;
        this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        return true;
    }

    setCredentials(tokens) {
        if (this.oauth2Client && tokens) {
            this.oauth2Client.setCredentials(tokens);
            return true;
        }
        return false;
    }

    async login() {
        if (!this.oauth2Client) throw new Error('Google OAuth client not initialized (Missing ID/Secret)');

        const scopes = [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ];

        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent select_account'
        });

        return new Promise((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                try {
                    if (req.url.indexOf('/oauth2callback') > -1) {
                        const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
                        const code = qs.get('code');
                        res.end('Authentication successful! You can close this window.');
                        server.destroy();
                        
                        if (authWindow) authWindow.close();

                        const { tokens } = await this.oauth2Client.getToken(code);
                        this.oauth2Client.setCredentials(tokens);
                        
                        // Get user email
                        const oauth2 = google.oauth2({ auth: this.oauth2Client, version: 'v2' });
                        const userInfo = await oauth2.userinfo.get();
                        this.userInfo = userInfo.data;

                        resolve({ tokens, user: userInfo.data });
                    }
                } catch (e) {
                    reject(e);
                }
            });

            // Destroy helper
            let connections = [];
            server.on('connection', conn => {
                connections.push(conn);
                conn.on('close', () => connections = connections.filter(c => c !== conn));
            });
            server.destroy = () => {
                server.close();
                connections.forEach(conn => conn.destroy());
            };

            server.listen(3000, () => {
                // Open auth window
                authWindow = new BrowserWindow({ width: 600, height: 800, webPreferences: { nodeIntegration: false } });
                authWindow.loadURL(authUrl);
                authWindow.on('closed', () => {
                    authWindow = null;
                    reject(new Error('Login cancelled'));
                });
            });
        });
    }

    async listFiles(query = "trashed=false", pageSize = 50) {
        if (!this.drive) throw new Error('Not logged in');
        const res = await this.drive.files.list({
            pageSize: pageSize,
            fields: 'nextPageToken, files(id, name, mimeType, webViewLink, iconLink)',
            q: query,
            orderBy: 'modifiedTime desc'
        });
        return res.data.files;
    }

    async readFileText(fileId) {
        if (!this.drive) throw new Error('Not logged in');
        try {
            const metadata = await this.drive.files.get({ fileId, fields: 'name, mimeType' });
            const mimeType = metadata.data.mimeType;

            if (mimeType.includes('google-apps.document')) {
                const res = await this.drive.files.export({ fileId, mimeType: 'text/plain' });
                return res.data;
            } else if (mimeType.includes('google-apps.presentation')) {
                const res = await this.drive.files.export({ fileId, mimeType: 'text/plain' });
                return res.data;
            } else if (mimeType.includes('google-apps.spreadsheet')) {
                const res = await this.drive.files.export({ fileId, mimeType: 'text/csv' });
                return res.data;
            } else {
                // For non-Google docs (txt, csv, etc), get alt=media
                const res = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
                return res.data;
            }
        } catch (e) {
            throw new Error('Failed to read file: ' + e.message);
        }
    }
}

module.exports = new GoogleAuthManager();
