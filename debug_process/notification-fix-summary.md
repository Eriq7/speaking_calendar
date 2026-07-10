# 推送通知修复记录

> 现象:在网站设了一条提醒,到点后 Mac 什么都不弹。
> 结果:全链路修复,通知正常。以下是完整过程。

## 一句话总结

通知发不出来,是**三层问题叠加**:① 发送代码有 2 个 bug 会崩溃;② 数据库里没有登记浏览器(订阅丢失,且 UI 没有重新登记的入口);③ macOS 系统层没允许 Chrome 发通知。三层全打通,通知才正常。

---

## 层次一:Edge Function 发送代码的 2 个 bug

文件:`supabase/functions/push/index.ts`

| # | Bug | 后果 | 修复 |
|---|-----|------|------|
| 1 | `importVapidKeys` 传了单个合并 JWK `{kty,crv,x,y,d}` | 库里读不到 `publicKey` → `buildAppServer()` 崩溃 → 函数返回 500 → 提醒发不出去 | 改成传两个分开的 JWK:`{ publicKey:{x,y}, privateKey:{x,y,d} }` |
| 2 | 把 `pushTextMessage()` 的返回当成 `resp.ok` 读 | 该方法其实返回 void、失败靠 throw → `resp.status` 抛 TypeError 被吞 → 永远返回 false → `sent` 永不置 true(还会每分钟重复发) | 改成 `await` + `try/catch`,成功 `return true`,失败在 catch 里读 `err.response.status`(410/404 清理失效订阅) |

**额外改进(诊断):** 响应体加了 `delivered / failed / error` 字段,手动测一次就能看出是"发成功""被拒(403/410)"还是"没有收件人"。

> ⚠️ 关键教训:上一版部署时测试恰好没有到期提醒(`count:0`),发送代码一行都没跑到,所以"看着部署成功"其实带病上线、从未验证。**部署 ≠ 验证。**

---

## 层次二:订阅丢失 + UI 没有重新登记入口

- 数据库 `subscriptions` 表 **0 条** → 函数找到 2 条到期提醒,却发给了 0 个设备(`delivered:0, failed:0`)。
- 根因盲点:App 只在浏览器权限 **未授予**时才显示「🔔 Enable」按钮。一旦权限是 `granted` 但订阅又丢了,UI 就假设"已订阅",**不再给任何按钮** → 死胡同。
- 临时解法(无需改代码):Chrome 地址栏小锁 → **Reset permission** → 刷新页面 → 横幅重新出现 → 点 **Enable** → **允许** → 订阅数 0→1。

> 🔧 可优化项:让"重新登记"始终有入口(即使权限已授予),避免订阅一丢就无法自助恢复。

---

## 层次三:macOS 系统层(用户发现)

即使①②都对,通知仍可能不弹,因为网页跑在 Chrome 里:
- **系统设置 → 通知 → Google Chrome = 允许**
- 关闭「专注 / 勿扰」模式

> 网站允许发通知 ≠ Chrome 被系统允许发通知。两者都要开,缺一不弹。

---

## 验证清单(端到端)

1. 部署:`supabase functions deploy push --project-ref ddyekighahupfvquagkv` ✅
2. 定时器在跑:`select jobname, schedule, active from cron.job;` → `push-due-reminders * * * * * true` ✅
3. 手动触发:`curl -X POST .../functions/v1/push -d '{"mode":"send"}'` → 读 `delivered/failed/error` ✅
4. 订阅存在:`select count(*) from subscriptions;` → 从 0 变 1 ✅
5. 真实通知在 Mac 弹出 ✅

## 涉及文件

- `supabase/functions/push/index.ts` — 唯一改动的代码文件
- `frontend/lib/push.ts` / `frontend/components/SettingsPanel.tsx` / `frontend/app/page.tsx` — 订阅与 Enable 按钮逻辑(本次未改,但定位死胡同用到)
