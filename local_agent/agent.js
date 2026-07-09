/**
 * anyGem 本機磁碟代理 (Local Disk Agent)
 * 版本: 1.0.0
 * 功能: 讓 anyGem AI 助理能搜尋、讀取、整理本機磁碟檔案
 * 
 * 啟動方式: node agent.js
 * 預設 Port: 3456
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// ===== 載入設定 =====
const CONFIG_PATH = path.join(__dirname, 'config.json');
let CONFIG = {
    allowed_roots: ['D:\\'],
    port: 3456,
    max_file_size_kb: 512,
    allowed_extensions: ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.log', '.bat', '.ps1'],
    deny_patterns: ['node_modules', '.git', 'System Volume Information', '$RECYCLE.BIN']
};

try {
    if (fs.existsSync(CONFIG_PATH)) {
        CONFIG = { ...CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
} catch (e) {
    console.warn('[Config] 無法讀取 config.json，使用預設設定:', e.message);
}

const PORT = CONFIG.port || 3456;
const ALLOWED_ROOTS = CONFIG.allowed_roots || ['D:\\'];
const MAX_FILE_SIZE = (CONFIG.max_file_size_kb || 512) * 1024;

// ===== 安全檢查 =====
function isPathAllowed(targetPath) {
    const normalized = path.normalize(targetPath).toLowerCase();
    return ALLOWED_ROOTS.some(root => normalized.startsWith(root.toLowerCase()));
}

function isDenied(name) {
    return CONFIG.deny_patterns.some(p => name.toLowerCase().includes(p.toLowerCase()));
}

function isAllowedExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return CONFIG.allowed_extensions.includes(ext);
}

// ===== 工具函數 =====

/**
 * 遞迴搜尋檔案
 */
async function searchFiles(rootDir, query, options = {}) {
    const results = [];
    const maxResults = options.maxResults || 50;
    const searchContent = options.searchContent || false;
    const extFilter = options.ext ? options.ext.toLowerCase() : null;

    function walk(dir, depth = 0) {
        if (depth > 8 || results.length >= maxResults) return;
        if (!isPathAllowed(dir)) return;

        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) { return; }

        for (const entry of entries) {
            if (results.length >= maxResults) break;
            if (isDenied(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        type: 'folder',
                        name: entry.name,
                        path: fullPath,
                        size: null,
                        modified: null
                    });
                }
                walk(fullPath, depth + 1);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extFilter && ext !== extFilter) continue;

                const nameMatch = entry.name.toLowerCase().includes(query.toLowerCase());
                let contentMatch = false;

                if (!nameMatch && searchContent && isAllowedExtension(fullPath)) {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size <= MAX_FILE_SIZE) {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            contentMatch = content.toLowerCase().includes(query.toLowerCase());
                        }
                    } catch (e) {}
                }

                if (nameMatch || contentMatch) {
                    try {
                        const stat = fs.statSync(fullPath);
                        results.push({
                            type: 'file',
                            name: entry.name,
                            path: fullPath,
                            ext: ext,
                            size: stat.size,
                            size_readable: formatSize(stat.size),
                            modified: stat.mtime.toISOString(),
                            match_type: nameMatch ? 'name' : 'content'
                        });
                    } catch (e) {}
                }
            }
        }
    }

    walk(rootDir);
    return results;
}

/**
 * 列出目錄內容
 */
function listDirectory(dirPath) {
    if (!isPathAllowed(dirPath)) throw new Error('存取被拒絕：路徑不在允許範圍內');

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
        if (isDenied(entry.name)) continue;
        const fullPath = path.join(dirPath, entry.name);
        try {
            const stat = fs.statSync(fullPath);
            items.push({
                type: entry.isDirectory() ? 'folder' : 'file',
                name: entry.name,
                path: fullPath,
                ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : null,
                size: entry.isFile() ? stat.size : null,
                size_readable: entry.isFile() ? formatSize(stat.size) : null,
                modified: stat.mtime.toISOString(),
                item_count: entry.isDirectory() ? countItems(fullPath) : null
            });
        } catch (e) {}
    }

    // 資料夾優先，然後按名稱排序
    items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-TW');
    });

    return {
        path: dirPath,
        parent: path.dirname(dirPath),
        total: items.length,
        items
    };
}

/**
 * 讀取檔案內容
 */
function readFile(filePath) {
    if (!isPathAllowed(filePath)) throw new Error('存取被拒絕：路徑不在允許範圍內');
    if (!isAllowedExtension(filePath)) throw new Error('不支援讀取此類型的檔案');

    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) throw new Error(`檔案過大（${formatSize(stat.size)}），上限為 ${CONFIG.max_file_size_kb}KB`);

    const content = fs.readFileSync(filePath, 'utf8');
    return {
        path: filePath,
        name: path.basename(filePath),
        ext: path.extname(filePath).toLowerCase(),
        size: stat.size,
        size_readable: formatSize(stat.size),
        modified: stat.mtime.toISOString(),
        content
    };
}

/**
 * 整理檔案操作
 */
function organizeFile(action, srcPath, destPath = null) {
    if (!isPathAllowed(srcPath)) throw new Error('來源路徑不在允許範圍內');
    if (destPath && !isPathAllowed(destPath)) throw new Error('目標路徑不在允許範圍內');

    switch (action) {
        case 'rename':
            if (!destPath) throw new Error('rename 需要 dest_path');
            fs.renameSync(srcPath, destPath);
            return { success: true, message: `已重新命名：${path.basename(srcPath)} → ${path.basename(destPath)}` };

        case 'move':
            if (!destPath) throw new Error('move 需要 dest_path');
            const moveDest = fs.statSync(destPath).isDirectory()
                ? path.join(destPath, path.basename(srcPath))
                : destPath;
            fs.renameSync(srcPath, moveDest);
            return { success: true, message: `已移動至：${moveDest}` };

        case 'copy':
            if (!destPath) throw new Error('copy 需要 dest_path');
            const copyDest = fs.existsSync(destPath) && fs.statSync(destPath).isDirectory()
                ? path.join(destPath, path.basename(srcPath))
                : destPath;
            fs.copyFileSync(srcPath, copyDest);
            return { success: true, message: `已複製至：${copyDest}` };

        case 'delete':
            fs.unlinkSync(srcPath);
            return { success: true, message: `已刪除：${path.basename(srcPath)}` };

        case 'mkdir':
            fs.mkdirSync(srcPath, { recursive: true });
            return { success: true, message: `已建立資料夾：${srcPath}` };

        case 'open':
            exec(`start "" "${srcPath}"`);
            return { success: true, message: `已用預設程式開啟：${path.basename(srcPath)}` };

        default:
            throw new Error(`不支援的操作：${action}`);
    }
}

/**
 * 取得磁碟資訊
 */
function getDiskInfo() {
    return new Promise((resolve) => {
        exec('wmic logicaldisk get size,freespace,caption /format:csv', (err, stdout) => {
            const disks = [];
            if (!err && stdout) {
                const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
                for (const line of lines) {
                    const parts = line.split(',');
                    if (parts.length >= 4) {
                        const caption = parts[1]?.trim();
                        const freeSpace = parseInt(parts[2]) || 0;
                        const size = parseInt(parts[3]) || 0;
                        if (caption && size > 0) {
                            disks.push({
                                drive: caption,
                                total: formatSize(size),
                                free: formatSize(freeSpace),
                                used: formatSize(size - freeSpace),
                                percent_used: Math.round((size - freeSpace) / size * 100),
                                allowed: isPathAllowed(caption + '\\')
                            });
                        }
                    }
                }
            }
            resolve({ disks, allowed_roots: ALLOWED_ROOTS });
        });
    });
}
/**
 * 執行 Docker 沙盒指令
 */
function dockerRunCommand(command, cwd) {
    return new Promise((resolve) => {
        const root = ALLOWED_ROOTS[0];
        let containerCwd = '/workspace';
        if (cwd && isPathAllowed(cwd)) {
            const relPath = path.relative(root, cwd).replace(/\\/g, '/');
            if (relPath && !relPath.startsWith('..')) {
                containerCwd = `/workspace/${relPath}`;
            }
        }
        
        const image = 'node:18';
        const dockerCmd = `docker run --rm -v "${root}:/workspace" -w "${containerCwd}" ${image} bash -c "${command.replace(/"/g, '\\"')}"`;
        
        exec(dockerCmd, (error, stdout, stderr) => {
            resolve({
                success: !error,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error ? error.message : null
            });
        });
    });
}


/**
 * 執行系統指令 (OpenCode 核心功能)
 */
function runCommand(command, cwd) {
    return new Promise((resolve) => {
        const options = {};
        if (cwd && isPathAllowed(cwd)) {
            options.cwd = cwd;
        }
        
        exec(command, options, (error, stdout, stderr) => {
            resolve({
                success: !error,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error ? error.message : null
            });
        });
    });
}

/**
 * 寫入檔案內容 (OpenCode 核心功能)
 */
function writeToFile(filePath, content) {
    if (!isPathAllowed(filePath)) throw new Error('存取被拒絕：路徑不在允許範圍內');
    
    // 建立上層目錄
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    return {
        path: filePath,
        name: path.basename(filePath),
        size: Buffer.byteLength(content, 'utf8'),
        size_readable: formatSize(Buffer.byteLength(content, 'utf8')),
        modified: new Date().toISOString()
    };
}

// ===== 輔助函數 =====
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function countItems(dirPath) {
    try { return fs.readdirSync(dirPath).length; } catch (e) { return null; }
}

// ===== HTTP 伺服器 =====
const server = http.createServer(async (req, res) => {
    // CORS 設定 - 只允許本機
    const origin = req.headers.origin || '';
    const allowedOrigins = ['http://localhost', 'https://agent-bay-tau.vercel.app', 'null'];
    
    res.setHeader('Access-Control-Allow-Origin', '*'); // 允許所有來源（本機代理）
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Private-Network');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0', allowed_roots: ALLOWED_ROOTS }));
        return;
    }

    if (req.method !== 'POST' || req.url !== '/api') {
        res.writeHead(404);
        res.end(JSON.stringify({ error: '未知的路由' }));
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const payload = JSON.parse(body);
            const { action } = payload;
            let result;

            console.log(`[${new Date().toLocaleTimeString('zh-TW')}] ${action}`, payload.path || payload.query || '');

            switch (action) {
                case 'search':
                    result = await searchFiles(
                        payload.root || ALLOWED_ROOTS[0],
                        payload.query || '',
                        {
                            maxResults: payload.max_results || 50,
                            searchContent: payload.search_content || false,
                            ext: payload.ext || null
                        }
                    );
                    result = { status: 'success', results: result, count: result.length };
                    break;

                case 'list':
                    result = { status: 'success', ...listDirectory(payload.path || ALLOWED_ROOTS[0]) };
                    break;

                case 'read':
                    result = { status: 'success', ...readFile(payload.path) };
                    break;

                case 'organize':
                    result = { status: 'success', ...organizeFile(payload.op, payload.src, payload.dest) };
                    break;

                case 'run_command':
                    console.log(`[執行指令] ${payload.command}`);
                    result = { status: 'success', ...(await runCommand(payload.command, payload.cwd)) };
                    break;

                case 'docker_run_command':
                    console.log(`[Docker沙盒指令] ${payload.command}`);
                    result = { status: 'success', ...(await dockerRunCommand(payload.command, payload.cwd)) };
                    break;

                case 'write_file':
                    console.log(`[寫入檔案] ${payload.path}`);
                    result = { status: 'success', ...writeToFile(payload.path, payload.content) };
                    break;

                case 'disk_info':
                    result = { status: 'success', ...(await getDiskInfo()) };
                    break;

                default:
                    result = { status: 'error', message: `未知操作：${action}` };
            }

            res.writeHead(200);
            res.end(JSON.stringify(result));
        } catch (err) {
            console.error('[Error]', err.message);
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║     anyGem 本機磁碟代理 v1.0.0           ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  狀態：✅ 已啟動，監聽 Port ${PORT}         ║`);
    console.log(`║  允許根目錄：${ALLOWED_ROOTS.join(', ').padEnd(26)}║`);
    console.log('║  按 Ctrl+C 停止服務                      ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} 已被佔用！請修改 config.json 中的 port 設定，或關閉佔用的程式。`);
    } else {
        console.error('❌ 伺服器錯誤:', err.message);
    }
    process.exit(1);
});

// 優雅關閉
process.on('SIGINT', () => {
    console.log('\n[anyGem 代理] 正在關閉...');
    server.close(() => process.exit(0));
});
