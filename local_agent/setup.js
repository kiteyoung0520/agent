#!/usr/bin/env node
/**
 * anyGem 本機磁碟代理 — 一鍵安裝腳本
 * 
 * 功能：
 *   1. 自動掃描本機可用磁碟（排除系統碟 C:\）
 *   2. 自動尋找可用 Port（3456 起）
 *   3. 產出 config.json
 *   4. 註冊 Windows 開機自動啟動（工作排程）
 *   5. 啟動本機代理
 * 
 * 使用方式：
 *   一般安裝 → 雙擊 setup.js 或以系統管理員執行
 *   自訂磁碟 → node setup.js --roots D:,E:
 *   自訂 Port → node setup.js --port 8080
 *   僅啟動   → node setup.js --start-only
 *   移除     → node setup.js --uninstall
 * 
 * 注意：工作排程註冊需要「系統管理員權限」
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const http = require('http');

// ==========================================
// 設定
// ==========================================
const AGENT_DIR = __dirname;
const AGENT_JS = path.join(AGENT_DIR, 'agent.js');
const CONFIG_PATH = path.join(AGENT_DIR, 'config.json');
const TASK_NAME = 'anyGem_LocalAgent';
const DEFAULT_PORT = 3456;
const PORT_SCAN_RANGE = 10;  // 往上掃描 10 個 Port

// ==========================================
// 工具函數
// ==========================================

function printBanner() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     anyGem 本機磁碟代理 — 一鍵安裝工具         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  代理目錄: ${AGENT_DIR.padEnd(38)}║`);
    console.log(`║  版本: 1.0.0${' '.repeat(47)}║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
}

function printStep(step, message) {
    console.log(`  [${step}/5] ${message}`);
}

function printSuccess(message) {
    console.log(`  ✅ ${message}`);
}

function printWarning(message) {
    console.log(`  ⚠️  ${message}`);
}

function printError(message) {
    console.log(`  ❌ ${message}`);
}

function printInfo(message) {
    console.log(`     ${message}`);
}

/**
 * 確認是否有系統管理員權限
 */
function isAdmin() {
    try {
        const result = execSync('net session 2>&1', { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 掃描本機所有磁碟機代號
 */
function scanDrives() {
    const drives = [];
    try {
        const output = execSync('wmic logicaldisk get caption,drivetype /format:csv', {
            stdio: 'pipe',
            encoding: 'utf8'
        });
        
        const lines = output.trim().split('\n').filter(l => l.trim());
        for (const line of lines) {
            if (line.startsWith('Node')) continue;
            const parts = line.split(',');
            if (parts.length >= 3) {
                const caption = (parts[1] || '').trim();
                const driveType = parseInt(parts[2]) || 0;
                if (caption && /^[A-Z]:$/.test(caption)) {
                    drives.push({
                        drive: caption,
                        type: driveType,
                        // 3=本地磁碟, 4=網路磁碟, 5=光碟
                        is_system: caption === 'C:',
                        is_removable: driveType === 2,
                        is_cdrom: driveType === 5,
                        is_network: driveType === 4
                    });
                }
            }
        }
    } catch (e) {
        // fallback: 只掃描 A-Z
        for (let i = 68; i <= 90; i++) { // D 到 Z
            const letter = String.fromCharCode(i);
            const drivePath = `${letter}:\\`;
            try {
                fs.accessSync(drivePath);
                drives.push({
                    drive: `${letter}:`,
                    type: 3,
                    is_system: letter === 'C',
                    is_removable: false,
                    is_cdrom: false,
                    is_network: false
                });
            } catch (e2) {}
        }
    }
    return drives;
}

/**
 * 尋找可用 Port
 */
function findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + PORT_SCAN_RANGE; port++) {
        try {
            const result = execSync(
                `netstat -ano | findstr :${port}`,
                { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 3000 }
            );
            // 如果 findstr 有回傳結果，表示 Port 被佔用
            if (result.trim()) {
                printInfo(`Port ${port} 已被佔用，嘗試下一個...`);
                continue;
            }
        } catch (e) {
            // findstr 無結果時會 errorlevel 1，表示 Port 可用
            return port;
        }
    }
    return null; // 所有 Port 都被佔用
}

/**
 * 取得磁碟空間資訊（用於顯示）
 */
function getDriveInfo(drive) {
    try {
        const output = execSync(`wmic logicaldisk where caption="${drive}" get size,freespace /format:csv`, {
            stdio: 'pipe',
            encoding: 'utf8'
        });
        const lines = output.trim().split('\n').filter(l => l.trim());
        for (const line of lines) {
            if (line.startsWith('Node')) continue;
            const parts = line.split(',');
            if (parts.length >= 3) {
                const freeSpace = parseInt(parts[1]) || 0;
                const size = parseInt(parts[2]) || 0;
                if (size > 0) {
                    const used = size - freeSpace;
                    return {
                        total: formatSize(size),
                        used: formatSize(used),
                        free: formatSize(freeSpace),
                        percent: Math.round(used / size * 100)
                    };
                }
            }
        }
    } catch (e) {}
    return null;
}

/**
 * 格式化檔案大小
 */
function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/**
 * 測試代理是否能正常啟動
 */
function testAgent(port) {
    return new Promise((resolve) => {
        const testUrl = `http://127.0.0.1:${port}/ping`;
        let attempts = 0;
        const maxAttempts = 10;
        
        const check = () => {
            attempts++;
            const req = http.get(testUrl, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    try {
                        const d = JSON.parse(body);
                        if (d.status === 'ok') {
                            resolve(true);
                            return;
                        }
                    } catch (e) {}
                    retry();
                });
            });
            req.on('error', retry);
            req.setTimeout(1000, () => { req.destroy(); retry(); });
            
            function retry() {
                if (attempts < maxAttempts) {
                    setTimeout(check, 500);
                } else {
                    resolve(false);
                }
            }
        };
        setTimeout(check, 1000);
    });
}

/**
 * 建立 Windows 工作排程（需系統管理員權限）
 */
function createScheduledTask(nodePath) {
    const command = `cmd /c start /min "anyGem代理" "${nodePath}" "${AGENT_JS}"`;
    
    try {
        // 刪除舊任務
        execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe', timeout: 5000 });
    } catch (e) {}
    
    try {
        execSync(
            `schtasks /create ` +
            `/tn "${TASK_NAME}" ` +
            `/tr "${command}" ` +
            `/sc ONLOGON ` +
            `/rl HIGHEST ` +
            `/f ` +
            `/delay 0000:30`,
            { stdio: 'pipe', timeout: 10000, encoding: 'utf8' }
        );
        return true;
    } catch (e) {
        printWarning(`工作排程建立失敗: ${e.message}`);
        return false;
    }
}

/**
 * 移除安裝（工作排程 + 停止代理）
 */
function uninstall() {
    printStep(1, '正在移除 anyGem 本機代理...');
    
    // 停止代理
    try {
        const result = execSync(
            `netstat -ano | findstr :${CONFIG.port || DEFAULT_PORT}`,
            { stdio: 'pipe', encoding: 'utf8', timeout: 3000 }
        );
        const lines = result.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
                const pid = parseInt(parts[4]);
                if (pid && pid > 0) {
                    try {
                        execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
                        printSuccess(`已停止代理程序 (PID: ${pid})`);
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        printInfo('代理未在運行');
    }
    
    // 刪除工作排程
    try {
        execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe', timeout: 5000 });
        printSuccess('已移除開機自動啟動');
    } catch (e) {
        printInfo('工作排程不存在或移除失敗');
    }
    
    console.log('');
    console.log('  🗑️  anyGem 本機代理已從此電腦移除。');
    console.log('  config.json 保留未刪除，如需完整清除請手動刪除。');
    console.log('');
}

// ==========================================
// 主流程
// ==========================================
async function main() {
    // 解析命令列參數
    const args = process.argv.slice(2);
    const customRoots = args.find(a => a.startsWith('--roots='));
    const customPort = args.find(a => a.startsWith('--port='));
    const startOnly = args.includes('--start-only');
    const doUninstall = args.includes('--uninstall');
    const skipTask = args.includes('--no-task');
    
    printBanner();
    
    // === 解除安裝模式 ===
    if (doUninstall) {
        uninstall();
        process.exit(0);
    }
    
    // === 步驟 1：環境檢查 ===
    printStep(1, '環境檢查');
    
    // 1a. 確認 agent.js 存在
    if (!fs.existsSync(AGENT_JS)) {
        printError(`找不到 agent.js！`);
        printInfo(`預期位置: ${AGENT_JS}`);
        printInfo('請確認 setup.js 和 agent.js 在同一個資料夾。');
        process.exit(1);
    }
    printSuccess(`agent.js 存在 (${formatSize(fs.statSync(AGENT_JS).size)})`);
    
    // 1b. Node.js 版本
    const nodeVersion = process.version;
    printSuccess(`Node.js ${nodeVersion}`);
    
    // 1c. 作業系統
    if (os.platform() !== 'win32') {
        printWarning('非 Windows 系統，工作排程與磁碟掃描功能可能受限。');
    } else {
        printSuccess(`Windows ${os.release()}`);
    }
    
    // 1d. 系統管理員權限（僅在需要建立排程時檢查）
    const admin = isAdmin();
    if (admin) {
        printSuccess('系統管理員權限 ✅');
    } else {
        printWarning('非系統管理員權限（工作排程註冊需要管理員身分）');
        if (!skipTask) {
            printInfo('將嘗試以普通權限啟動代理，開機自動啟動需另行設定。');
        }
    }
    
    console.log('');
    
    // === 步驟 2：掃描磁碟 ===
    printStep(2, '掃描本機磁碟');
    
    const allDrives = scanDrives();
    const validDrives = allDrives.filter(d => !d.is_system && !d.is_cdrom);
    
    if (validDrives.length === 0) {
        // 如果只有 C 槽，還是允許使用 C 槽（僅限腳本所在目錄）
        printWarning('未找到非系統資料磁碟，將使用 script 所在目錄');
        const scriptDrive = AGENT_DIR.substring(0, 3); // e.g. "D:\"
        const allowedRoots = [scriptDrive];
        printInfo(`允許根目錄: ${allowedRoots.join(', ')}`);
    } else {
        // 顯示找到的磁碟
        for (const d of validDrives) {
            const info = getDriveInfo(d.drive);
            if (info) {
                printInfo(`${d.drive}  ${info.used} / ${info.total} (${info.percent}% 已用) ${d.type === 2 ? '[可移除]' : d.type === 4 ? '[網路]' : ''}`);
            } else {
                printInfo(`${d.drive}  (無法讀取容量資訊)`);
            }
        }
    }
    
    console.log('');
    
    // === 步驟 3：尋找可用 Port ===
    printStep(3, '尋找可用 Port');
    
    const startPort = customPort ? parseInt(customPort.split('=')[1]) : DEFAULT_PORT;
    let agentPort;
    
    if (startOnly) {
        // 僅啟動模式：使用現有 config
        if (fs.existsSync(CONFIG_PATH)) {
            const existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            agentPort = existing.port || DEFAULT_PORT;
            printInfo(`使用現有設定 Port ${agentPort}`);
        } else {
            agentPort = DEFAULT_PORT;
            printInfo(`無現有設定，使用預設 Port ${agentPort}`);
        }
    } else {
        agentPort = findAvailablePort(startPort);
        if (!agentPort) {
            printError(`無法找到可用 Port (${startPort} ~ ${startPort + PORT_SCAN_RANGE - 1} 皆被佔用)`);
            printInfo('請以 --port=xxxx 指定其他 Port');
            process.exit(1);
        }
    }
    
    printSuccess(`Port ${agentPort} 可用`);
    
    console.log('');
    
    // === 步驟 4：產出 config.json ===
    printStep(4, '產出設定檔 config.json');
    
    // 處理自訂磁碟根目錄
    let allowedRoots;
    if (customRoots) {
        allowedRoots = customRoots.split('=')[1].split(',').map(r => r.trim() + '\\');
    } else if (validDrives.length > 0) {
        allowedRoots = validDrives.map(d => d.drive + '\\');
    } else {
        allowedRoots = [AGENT_DIR.substring(0, 3)]; // 腳本所在磁碟
    }
    
    const config = {
        allowed_roots: allowedRoots,
        port: agentPort,
        max_file_size_kb: 512,
        allowed_extensions: [
            '.txt', '.md', '.csv', '.json', '.js', '.ts', '.gs',
            '.py', '.html', '.css', '.xml', '.yaml', '.yml',
            '.ini', '.cfg', '.log', '.bat', '.ps1',
            '.docx', '.xlsx', '.pdf'
        ],
        deny_patterns: [
            'node_modules', '.git', 'System Volume Information',
            '$RECYCLE.BIN', 'Windows', 'Program Files',
            'Program Files (x86)'
        ],
        install_info: {
            installed_at: new Date().toISOString(),
            installed_by: os.userInfo().username,
            hostname: os.hostname(),
            node_version: process.version,
            platform: os.platform(),
            agent_dir: AGENT_DIR
        }
    };
    
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    printSuccess(`config.json 已產生`);
    printInfo(`  允許根目錄: ${allowedRoots.join(', ')}`);
    printInfo(`  Port: ${agentPort}`);
    printInfo(`  路徑: ${CONFIG_PATH}`);
    
    console.log('');
    
    // === 步驟 5：註冊開機自動啟動 ＆ 啟動代理 ===
    printStep(5, '註冊開機自動啟動 ＆ 啟動代理');
    
    // 5a. 檢查是否已有代理在運行
    let alreadyRunning = false;
    try {
        const checkReq = http.get(`http://127.0.0.1:${agentPort}/ping`, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const d = JSON.parse(body);
                    if (d.status === 'ok') alreadyRunning = true;
                } catch (e) {}
            });
        });
        checkReq.on('error', () => {});
        checkReq.setTimeout(1000, () => { checkReq.destroy(); });
    } catch (e) {}
    
    if (alreadyRunning) {
        printSuccess('代理已在運行中，跳過啟動步驟');
    } else {
        // 5b. 建立工作排程
        if (!skipTask) {
            if (admin) {
                const nodeExe = process.execPath;
                const taskCreated = createScheduledTask(nodeExe);
                if (taskCreated) {
                    printSuccess(`工作排程已建立: ${TASK_NAME}`);
                    printInfo('  每次登入 Windows 後 30 秒自動啟動');
                } else {
                    printWarning('工作排程建立失敗，請以系統管理員身分執行 setup.js');
                }
            } else {
                printWarning('非管理員權限，跳過工作排程註冊');
                printInfo('  欲設定開機自動啟動：');
                printInfo('  1. 以系統管理員身分執行 setup.js');
                printInfo('  2. 或手動執行 setup_autostart.bat');
            }
        } else {
            printInfo('已跳過工作排程註冊 (--no-task)');
        }
        
        // 5c. 啟動代理
        printInfo('正在啟動本機代理...');
        
        const child = spawn('node', [AGENT_JS], {
            cwd: AGENT_DIR,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        
        // 5d. 等待啟動完成
        printInfo('等待代理就緒...');
        const isReady = await testAgent(agentPort);
        
        if (isReady) {
            printSuccess(`本機代理已啟動 (Port ${agentPort})`);
        } else {
            // 啟動可能較慢，先檢查錯誤
            printWarning('代理啟動中，請稍後手動驗證...');
            printInfo(`  訪問 http://127.0.0.1:${agentPort}/ping 確認狀態`);
        }
    }
    
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║              🎉 安裝完成！                       ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  代理 Port:  ${agentPort}${' '.repeat(41)}║`);
    console.log(`║  允許磁碟:  ${allowedRoots.join(', ').substring(0, 36)}${' '.repeat(Math.max(0, 36 - allowedRoots.join(', ').length))}║`);
    console.log(`║  工作排程:  ${skipTask ? '已跳過' : (admin ? '已註冊 ✅' : '未註冊 ⚠️')}${' '.repeat(35)}║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  下一步：                                        ║');
    console.log('║  1. 打開瀏覽器 → https://kiteyoung0520.github.io ║');
    console.log('║  2. 前端會自動偵測本機代理                        ║');
    console.log('║  3. 開始使用磁碟搜尋/讀寫/命令執行功能            ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
}

main().catch(err => {
    console.error('❌ 安裝過程中發生錯誤：');
    console.error(`   ${err.message}`);
    process.exit(1);
});