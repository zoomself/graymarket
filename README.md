# GrayMarket 暗盘资金监控

基于东方财富 `darktrade` 接口的 A 股暗盘资金实时监控。独立 Worker 在交易时段采集数据，经本地 JSON 队列写入 Supabase；Web 端仿东方财富暗盘资金榜 UI 展示榜单与个股折线图。

## 功能

- 交易时段（09:30–11:30、13:00–15:00）自动轮询东方财富接口
- 分页采集全量个股（StartPage 递增直至无数据）
- 本地 JSON 队列 → Supabase 批量写入，成功后删除本地文件
- 每轮采集完成后间隔 10 秒开始下一轮
- Web 榜单：暗盘/明盘资金排序、点击个股查看当日折线图

## 技术栈

- Next.js 16 + TypeScript + Tailwind CSS
- Supabase (PostgreSQL)
- ECharts
- 独立 Worker (`tsx scripts/worker.ts`)

## 快速开始

### 1. 创建 Supabase 项目

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard) 创建新项目
2. 在 **SQL Editor** 中依次执行：
   - [`supabase/migrations/001_dark_trade.sql`](supabase/migrations/001_dark_trade.sql)
   - [`supabase/migrations/002_rls_policies.sql`](supabase/migrations/002_rls_policies.sql)
   - [`supabase/migrations/003_content_hash.sql`](supabase/migrations/003_content_hash.sql)（用于相同数据跳过入库）
3. 在 **Project Settings → API** 复制：
   - Project URL → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`（仅 Worker 使用，勿暴露到前端）

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local` 填入 Supabase 凭证。

### 3. 安装依赖

```bash
npm install
```

### 4. 启动 Web

```bash
npm run dev
```

访问 http://localhost:3000

### 5. 启动采集 Worker

```bash
npm run worker
```

Worker 会在交易时段自动采集；非交易时段每 60 秒检测一次。

## 环境变量

| 变量 | 说明 |
|------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key（Worker 写入） |
| `NEXT_PUBLIC_SUPABASE_URL` | 同上（Web 读取） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key（Web 读取） |
| `EASTMONEY_REFERER` | 接口 Referer，默认 `https://emrnweb.eastmoney.com/` |
| `WORKER_PAGE_DELAY_MS` | 分页请求间隔，默认 200 |
| `WORKER_ITERATION_DELAY_MS` | 轮次间隔，默认 10000 |

## 云端部署 Worker

```bash
docker build -f Dockerfile.worker -t graymarket-worker .
docker run --env-file .env.local graymarket-worker
```

或使用 `docker compose`:

```yaml
services:
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    env_file: .env.local
    restart: unless-stopped
```

Web 可部署到 Vercel 或任意 Node 主机（`npm run build && npm start`），与 Worker 共享同一 Supabase 实例。

## 目录结构

```
src/
  app/              # Next.js 页面与 API
  components/       # UI 组件
  lib/
    eastmoney/      # 东方财富 API 客户端
    queue/          # 本地队列与 DB 写入
    supabase/       # Supabase 客户端
scripts/worker.ts   # 采集 Worker
data/queue/         # 本地队列（gitignore）
supabase/migrations/
```

## API

- `GET /api/iterations/latest?date=20260610` — 当日最新 completed 轮次快照
- `GET /api/stocks/{code}/history?date=20260610` — 个股当日时序（折线图）

## 注意事项

- 暗盘资金为东方财富量化模型估算值，非官方数据
- 接口可能限流，可通过 `WORKER_PAGE_DELAY_MS` 调大间隔
- `service_role` key 仅用于 Worker，不要提交到前端或公开仓库
