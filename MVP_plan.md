# 自然语言 → 日历 + 提醒（Demo 原型）技术方案 v2

## 背景 / Context
用户想解决"一次性手动录入很多未来日程很麻烦"的问题。目标：用自然语言描述未来的一批日程 → AI 自动解析成日历事件 → 到点发通知提醒。本方案为从零搭建（`/Users/vivianbb/Downloads/AI_Reminders` 目前仅有本文档）。

## 已确认的关键决策
- **形态**：网页 App（PWA），不上架 App Store（省年费），靠"加到主屏 + 通知授权"实现提醒。
- **Demo 目标**：本地跑 + 桌面 Chrome 验证整条链路（含到点通知）；iPhone 真机推送为后续验证项。
- **数据归属**：事件存在我们自己的（Supabase）库里，不同步第三方日历。
- **语音**：MVP 不做语音模型，语音交给系统键盘听写；SenseVoice 列为后续增强。
- **确认后再保存**：AI 解析后先出可编辑预览卡片，用户点 Confirm 才存入。

## 技术栈
- **前端 + 应用逻辑**：Next.js + React + Tailwind CSS，配 PWA（manifest + service worker）。API 路由处理解析、CRUD。
- **AI 解析**：OpenAI `gpt-4o-mini`，用 JSON schema/function-calling 强制结构化输出，prompt 注入"今天日期 + 浏览器时区"，重复输出为 **RRULE** 字符串。解析层做**厂商解耦**（日后可换 Claude）。
- **存储**：Supabase Postgres。
- **定时 + 推送**：Supabase `pg_cron`（每分钟扫）+ Edge Function（VAPID Web Push）。免费、7×24 常驻，用户电脑关机也不影响。
- **重复展开**：`rrule.js` 把 RRULE 展开成具体发生日期。

## 架构总览
```
[浏览器 PWA (Next.js)]
  ├─ 首页：管家开场白 + 文字输入框（语音靠系统键盘听写）
  ├─ 一年格子墙（上半）+ 最近 5 条 reminders（下半）
  ├─ 预览/编辑卡片（多事件多卡，Confirm 一次性保存）
  ├─ 齿轮面板：英文 tutorial 示范例句 + 名字设置
  ├─ Service Worker（接收 Web Push）
  │
  ├─ Next.js API 路由
  │    ├─ /api/parse     → OpenAI 解析文字 → 结构化事件(JSON, 含 RRULE)
  │    ├─ /api/events    → CRUD（Supabase），保存时用 rrule.js 展开 reminders
  │    └─ /api/subscribe → 存 Web Push 订阅
  │
  └─ Supabase
       ├─ Postgres：events / reminders / settings
       ├─ pg_cron（每分钟）→ 调 Edge Function 发到点/提前的推送
       └─ pg_cron（每周）→ 给无结束日期的重复补足未来 reminders
```

## 数据模型（三张表）

**events**：`id` / `title`(必填) / `note` / `date`(必填) / `time` / `location` / `early_reminder`(提前N天) / `rrule`(重复规则，空=不重复) / `repeat_end_date` / `color`。未提及字段留空，无默认值。

**reminders**（保存时展开的具体触发行）：`id` / `event_id` / `fire_at`(UTC 时间戳) / `kind`(day-of | early) / `days_before` / `sent`(bool) / 冗余展示字段（title/time/location/color）供 Edge Function 拼文案。pg_cron 每分钟：`SELECT * FROM reminders WHERE fire_at <= now() AND sent=false`，推完置 `sent=true`。

**settings**（单行）：`user_name` / `butler_name`。

## 重复与提醒展开逻辑
- 保存/编辑事件时：用 `rrule.js` 按 `rrule` + `date` + `repeat_end_date` 展开成每个发生日；每个发生日生成一条 day-of reminder，若有 `early_reminder` 再生成一条 early reminder（提前 N 天的时刻）。全部换算成 UTC `fire_at` 写入 `reminders`。
- **无结束日期**的重复：先展开到**明年年底**；**每周一次的 pg_cron** 检查并补足，保证未来始终有约 12 个月的提醒行，"永远重复"不断层。
- 编辑事件：删掉该事件所有 `sent=false` 的旧 reminders，按新内容重新展开。删除事件：清掉其未发 reminders。

## 前端设计
- **首页开场白**：管家人设，如 "I'm your butler. What future reminders can I set for you?" + 文字输入框。UI 全英文。
- **上半 · 一年格子墙**：GitHub 贡献图式 7×53 布局，覆盖当年 1/1–12/31；今天之前的格子涂灰（纯前端按"今天"计算，无需后端）；未来某天有 reminder 则该格子涂成该 reminder 的颜色；一天多个事件 → 格子最多切 4 象限（左上/右上/左下/右下），超过 4 显示"＋更多"。跨年时自动是新一年的空图。
- **下半 · 最近 5 条**：离今天最近的 5 个 reminders，显示 颜色 + 标题 + 日期。
- **查看详情**：点格子或点列表项 → 弹出该 reminder 的完整信息（备注/时间/地点/重复/提前提醒）。
- **预览/编辑卡片**：一句话多事件 → 多张卡；每张可改 标题/备注/日期/时间/地点/提前提醒/重复(下拉: None / Daily / Weekly / Monthly / Custom N days)/颜色（AI 先分配，可点开调色板改）；可删单张；底部一个 Confirm 一次性保存。
- **齿轮面板（右上角）**：① 英文示范例句 tutorial；② 设置"你的名字 / 管家名字"（存 Supabase）。

## 通知方案（Web Push + VAPID）
- 一进 App 就申请通知授权（一次性要完权限），订阅信息存 Supabase。
- Edge Function 拼**个性化文案**：
  - 当天：`Hey {user_name}, it's {butler_name}. Today 8:00 PM — Basketball at Gym.`
  - 提前：`Hey {user_name}, it's {butler_name}. In 3 days (Jun 6) — Mom's birthday.`
- 点击通知 → 打开 PWA。
- 桌面/安卓：关页也能到点提醒。iPhone：需"加到主屏 + HTTPS + 授权"，送达时机可能被 iOS 节流——列为后续真机验证项。

## 时区处理
前端用 `Intl.DateTimeFormat().resolvedOptions().timeZone` 拿浏览器时区，随请求带给后端：① 注入 OpenAI prompt 以正确解析"下周一/后天"；② 把解析出的本地时间换算成 UTC `fire_at` 存储。

## 核心流程
1. 首页输入文字（语音靠系统键盘听写）。
2. `/api/parse`（OpenAI）→ 一个或多个结构化事件 JSON（含 RRULE、AI 预分配颜色）。
3. 渲染成可编辑预览卡片，用户核对/改/删/调色。
4. Confirm → `/api/events` 存 Supabase，用 rrule.js 展开 reminders。
5. pg_cron 每分钟扫 reminders → Edge Function → Web Push → Service Worker 弹通知。

## 关键文件（新建）
| 文件 | 作用 |
|---|---|
| `frontend/app/page.tsx` | 首页（管家开场白 + 输入框 + 年格子墙 + 最近 5 条） |
| `frontend/components/YearGrid.tsx` | 一年格子墙（涂灰/上色/多象限） |
| `frontend/components/UpcomingList.tsx` | 最近 5 条 reminders |
| `frontend/components/EventPreviewCard.tsx` | 可编辑预览卡（含重复下拉、调色板） |
| `frontend/components/DetailModal.tsx` | 格子/列表点击后的详情弹窗 |
| `frontend/components/SettingsPanel.tsx` | 齿轮面板（tutorial + 名字设置） |
| `frontend/public/sw.js` + `manifest.json` | PWA 与通知 |
| `frontend/app/api/parse/route.ts` | 调 OpenAI，结构化解析（注入今日日期+时区，输出 RRULE），厂商解耦 |
| `frontend/app/api/events/route.ts` | 事件 CRUD + rrule.js 展开 reminders |
| `frontend/app/api/subscribe/route.ts` | 存 Web Push 订阅 |
| `frontend/lib/expand.ts` | rrule.js 展开逻辑（含无结束日期到明年底） |
| `supabase/migrations/*.sql` | 三张表 + pg_cron（每分钟推送 / 每周补足） |
| `supabase/functions/push/index.ts` | Edge Function，读 settings 拼个性化文案发 VAPID Web Push |

## MVP 范围边界

**做**：文字输入 → OpenAI 解析（多事件/RRULE/时区）→ 可编辑预览 → Supabase 存储 → 年格子墙+最近5条 → 编辑/删除 → pg_cron+Edge Function 到点/提前 Web Push（桌面 Chrome 验证）→ 管家个性化通知 → 齿轮 tutorial+名字设置。

**不做（列为后续）**：SenseVoice 本地语音；iPhone 真机后台推送验证；完整月历网格视图；多用户/登录；写入系统日历；生产部署。

## 验证方式（端到端）
1. 配置 Supabase（三表 + 两个 pg_cron）与 VAPID 密钥；`npm run dev` 起前端/API。
2. 输入多事件文本（如 "Meeting next Monday at 3pm, gym Wednesday 8pm repeat weekly until end of month"），确认 `/api/parse` 返回多个正确事件（日期/时间/RRULE 对）。
3. 在预览卡改一个日期字段 + 换个颜色并 Confirm，检查 Supabase `events`/`reminders` 数据与展开正确。
4. 年格子墙：确认过去涂灰、未来事件按颜色上色、同日多事件切象限；下半最近 5 条正确；点格子/列表能看详情。
5. 设一个 1 分钟后的事件，桌面 Chrome 授权通知，确认到点收到个性化 Web Push（`Hey {user}, it's {butler}. …`）。
6. 编辑/删除一个事件，确认旧未发 reminders 被清理并（编辑时）重新展开。
7. （后续）把 PWA 加到 iPhone 主屏，验证真机推送。

## 后续增强
- **SenseVoice-Small 语音**：独立 Python 小服务 + `/transcribe` 接口，前端麦克风录音 → 转文字回填输入框。
- **iPhone 真机后台推送**：内网穿透（ngrok/cloudflared）验证 HTTPS 环境下 iOS 推送。
- **完整月历网格视图**。
- **多用户 / 登录**：接入 Supabase Auth。
- **生产部署**：Vercel（Next.js）+ Supabase（免费套餐可承载个人使用）。
