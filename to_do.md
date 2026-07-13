- [DONE] 添加email注册, 跨设备使用功能 — 005_multi_user.sql + @supabase/ssr + /login page
- [DONE] EMAIL LIMIT: 已接入 Brevo 自定义 SMTP（smtp-relay.brevo.com / 587 / 发件人 ericli6897@gmail.com），不再受 Supabase 免费限流约束。⚠️ 注意：无自定义域名、用 Gmail 当发件人有 DMARC/垃圾箱风险，正式放量前需上自定义域名 + 配置 SPF/DKIM。
- [DONE] API KEY COST: AI 解析成本已量化（~100 个 reminder ≈ 2 美分，可忽略）。真实风险是机器人刷接口 → 已加每用户每日 50 次解析上限（006_parse_usage.sql + /api/parse 检查），防滥用。BYO key 方案暂缓。

- 订阅设计（待做）: Free = 最多新建 30 个 reminder；Pro = $2.99/月（或 ~$24/年），解锁无限 reminder + 截图导入 + 多管家/主题。支付（Stripe/RevenueCat）本轮不做，待后续迭代。
- 在手机和电脑上前段布局：不可以让用户直观的感受到365个格子这个设计。
- 需要在测试一下核心后端通知逻辑，而不是让用户去真实测试，万一错过就完蛋了
- 已经完成的reminder，要有个backlog/completed让用户去查看, 以及trash去删除
- 通过截图的方式让llm去阅读图片, 这样就可以更方便地去进行一些别人发放的日常安排。（Pro 功能）
- 前端变的和我们的logo 一样风格
- ## 查看image.png, 现在这个AI听不懂正常对话逻辑, 做出来的remindder有多处错误。


