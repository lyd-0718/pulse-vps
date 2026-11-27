# PulseVPS — Cloudflare Workers + D1 + Go 轻量级 VPS 监控

专为 3~10 台个人 VPS 定制的轻量实时监控面板，前端与 API 全托管于 Cloudflare Workers + D1，观测面与被控机完全隔离；同时支持开箱即用的 **Demo 演示模式** 与 **实时数据模式** 一键切换。

## 目录结构

- `src/` — React 19 + Tailwind CSS v4 + Recharts 前端面板（内置 Demo 数据模拟）
- `worker/` — Cloudflare Worker (Hono + D1 + Cron 边缘站点拨测 + 一键安装脚本)
- `migrations/` — D1 SQLite 数据库迁移脚本
- `agent/` — 纯 Go 静态编译采集端（CPU / 内存 / 磁盘 / 实时网速 / 月流量 / Docker 容器 / TCPing 拨测）
- `scripts/` — Agent 交叉编译与 Cloudflare 一键部署脚本

## 本地预览

```bash
pnpm install
pnpm run db:migrate:local
pnpm run build:web
pnpm run dev:worker
```

浏览器访问 `http://127.0.0.1:8787`（本地管理员默认密码：`admin123`，可在 `.dev.vars` 中修改）。

## 一键部署到 Cloudflare (`vps.ydiws.xyz`)

```bash
# 1. 登录 Cloudflare（如尚未登录）
npx wrangler login

# 2. 创建线上 D1、执行迁移、构建前端并部署到 vps.ydiws.xyz
pnpm run cf:deploy

# 3. 设置线上管理密码与签名密钥
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put JWT_SECRET
```

## 在 VPS 上安装 Go Agent

线上 Worker 已默认配置从 GitHub Releases 自动拉取对应架构 (`linux/amd64` 或 `linux/arm64`) 的静态二进制，登录后在节点详情中复制一键命令执行即可：

```bash
curl -fsSL https://vps.ydiws.xyz/install.sh | sudo bash -s -- --server https://vps.ydiws.xyz --token <你的节点Token>
```

如需本地交叉编译静态二进制：

```bash
pnpm run agent:build
```
