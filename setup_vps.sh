#!/bin/bash
echo "🚀 準備將您的 AI 助理部署到雲端..."

# 1. 更新系統並安裝必要工具
echo "📦 正在安裝 Node.js, Docker 與必備套件..."
sudo apt-get update
sudo apt-get install -y curl wget

# 安裝 Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安裝 Docker
sudo apt-get install -y docker.io
sudo usermod -aG docker $USER

# 2. 安裝 PM2 (用於背景執行)
sudo npm install -g pm2

# 3. 安裝 Cloudflare Tunnel
echo "☁️ 正在安裝 Cloudflare Tunnel..."
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
rm cloudflared-linux-amd64.deb

# 4. 建立專案目錄並設定
mkdir -p ~/ai_agent
cd ~/ai_agent

# 將剛剛上傳的 agent.js 移到目錄下
if [ -f ~/agent.js ]; then
    mv ~/agent.js ~/ai_agent/agent.js
    echo "✅ 成功找到 agent.js"
else
    echo "⚠️ 警告：找不到 agent.js，請確定您有上傳檔案喔！"
fi

# 5. 啟動服務
echo "🔥 啟動代理伺服器與加密通道..."
# 啟動 Node.js Agent
pm2 start agent.js --name "ai-agent"

# 啟動 Cloudflare Tunnel 並將日誌寫入 tunnel.log
nohup cloudflared tunnel --url http://localhost:3456 > tunnel.log 2>&1 &

echo "⏳ 等待通道建立 (約需 5 秒)..."
sleep 5

# 抓取生成的 HTTPS 網址
CF_URL=$(grep -o 'https://[-a-zA-Z0-9]*\.trycloudflare\.com' tunnel.log | head -1)

echo "============================================="
echo "🎉 部署完成！"
if [ -n "$CF_URL" ]; then
    echo "✨ 您的專屬雲端連線網址為："
    echo "👉 $CF_URL"
    echo "請複製上面的網址，貼在我們的對話框告訴我！"
else
    echo "⚠️ 無法自動抓取網址，請手動執行 'cat tunnel.log' 查看"
fi
echo "============================================="

# 套用 docker 群組權限
newgrp docker
