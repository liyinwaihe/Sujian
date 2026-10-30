#!/usr/bin/env bash
# 素笺（sujian）服务器端部署脚本：在目标机器上执行
# 用法: ./deploy.sh [端口，默认3000]
set -e
PORT="${1:-3000}"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Node.js 检查（>=16 即可）
if ! command -v node >/dev/null 2>&1; then
  echo "[sujian] Node.js 未安装。"
  echo "  Debian/Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "  CentOS/RHEL:    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo yum install -y nodejs"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 16 ]; then
  echo "[sujian] Node.js 版本过低 ($(node -v))，需要 >= 16"
  exit 1
fi
echo "[sujian] Node $(node -v) OK"

# 2. 语法自检
node --check "$APP_DIR/server.js"
echo "[sujian] syntax OK"

# 3. 停旧进程（仅匹配 sujian 的 server.js）
pkill -f "node .*sujian/server.js" 2>/dev/null || true
sleep 1

# 4. 启动（nohup 后台，日志重定向）
cd "$APP_DIR"
if command -v systemctl >/dev/null 2>&1; then
  echo "[sujian] 检测到 systemd，可选的服务安装见 README 部署章节；先用 nohup 拉起"
fi
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" nohup node "$APP_DIR/server.js" > "$APP_DIR/server.log" 2>&1 &
echo $! > "$APP_DIR/sujian.pid"
sleep 2

# 5. 健康检查
CODE=$(curl -s -o /dev/null -w "%{http_code}" --noproxy '*' "http://127.0.0.1:$PORT/" || echo 000)
if [ "$CODE" = "200" ]; then
  echo "[sujian] deployed OK at http://127.0.0.1:$PORT (pid $(cat "$APP_DIR/sujian.pid"))"
else
  echo "[sujian] health check failed (HTTP $CODE)，查看日志："
  tail -20 "$APP_DIR/server.log"
  exit 1
fi
