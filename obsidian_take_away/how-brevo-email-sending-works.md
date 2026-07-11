# Brevo 邮件发送原理

## 谁在发信？

整个流程有三个角色，容易混淆：

| 角色 | 是谁 | 干什么 |
|------|------|--------|
| **Brevo** | 邮件服务商（快递公司） | 实际承运邮件、维护服务器信誉、提供 SMTP 中继 |
| **Gmail（ericli6897@gmail.com）** | 发件人落款 | 收件方看到的"寄信人"；我的 Gmail 账号 |
| **Supabase Auth** | 触发方 | 用户注册/忘记密码时调用 SMTP，把邮件交给 Brevo 发出 |

比喻：Supabase 写了一封信，盖上我 Gmail 的署名，然后交给 Brevo 这家快递公司发出去。

---

## 邮件是怎么流出去的？

```
用户触发（注册 / 忘记密码）
        ↓
Supabase Auth 生成邮件内容（含验证码或重置链接）
        ↓
Supabase 用 SMTP 配置连接 Brevo
  Host: smtp-relay.brevo.com
  Port: 587
  User: b19655001@smtp-brevo.com（Brevo 账号标识）
  Pass: Brevo API key
        ↓
Brevo 以"From: ericli6897@gmail.com"发出邮件
        ↓
收件方收到邮件，显示发件人为 ericli6897@gmail.com
```

---

## 验证与 DMARC 风险

**DMARC** 是 Gmail 域名发布的一条 DNS 策略，大意是：
> "凡是声称从 @gmail.com 发出的邮件，必须经过 Google 自己的服务器发出，否则视为可疑。"

Brevo 不是 Google 的服务器，所以用 Gmail 当落款有以下风险：
- 邮件被收件方 ESP（如 QQ、163、Outlook）判入**垃圾箱**
- 严格的收件方直接拒收

**正式放量前的解决方案：**
1. 购买自定义域名（如 `talkreminder.app`）
2. 在域名 DNS 添加 SPF 记录（允许 Brevo 代发）
3. 在 Brevo 后台生成 DKIM 私钥，添加到 DNS
4. 将 Supabase 发件人改为 `no-reply@talkreminder.app`

---

## 全自动流程（用户视角）

1. 打开 `/login` → 点"Create Account" → 填邮箱 + 密码
2. 后台：Supabase → Brevo → 邮件到达用户邮箱（含 6 位验证码）
3. 用户回到页面输入验证码 → 验证通过 → 自动跳转主页
4. 如果没收到：**先查垃圾邮件 / Promotions 文件夹**

---

## 当前配置（2026-07-10）

| 参数 | 值 |
|------|----|
| SMTP Host | smtp-relay.brevo.com |
| Port | 587 |
| SMTP User | b19655001@smtp-brevo.com |
| 发件人落款 | ericli6897@gmail.com |
| 配置位置 | Supabase Dashboard → Auth → SMTP Settings |
