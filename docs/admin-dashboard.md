# Admin Dashboard 設計文檔（V1）

## 1. 目標

- 為運營與技術團隊提供可觀測、可操作、可審計的管理後台。
- 覆蓋租戶管理、郵箱池運營、消息處理、Webhook 運維、計費與風控。
- 與 `docs/development.md` 的服務邊界與 API 契約一一對應。

## 2. 使用角色與權限

### 2.1 角色定義
- `Owner`
  - 組織級最高權限，可管理賬單、策略、管理員。
- `Admin`
  - 可管理租戶下全部資源與策略，不可轉移所有權。
- `Operator`
  - 可執行運維操作（凍結/回收郵箱、重試 webhook），不可改計費策略。
- `Viewer`
  - 只讀訪問，不能發起改動。

### 2.2 權限矩陣（V1）
- 租戶配置：Owner/Admin 可寫，Operator/Viewer 只讀。
- 郵箱池操作：Owner/Admin/Operator 可寫，Viewer 只讀。
- 消息查看：Owner/Admin/Operator/Viewer 可讀。
- Webhook 管理：Owner/Admin/Operator 可寫，Viewer 只讀。
- 計費配置：僅 Owner/Admin 可寫。
- 審計查詢：全角色可讀（Viewer 僅可導出脫敏視圖）。

## 3. 信息架構（IA）

- `Overview`（總覽）
- `Tenants`（租戶）
- `Mailboxes`（郵箱池）
- `Messages`（消息）
- `Webhooks`（Webhook）
- `Billing`（計費）
- `Risk`（風控）
- `Audit`（審計）
- `Settings`（系統配置）

## 4. 頁面設計

### 4.1 Overview

#### 核心指標卡
- 活躍租戶數（24h）
- 活躍 mailbox lease 數
- 郵件接收量（1h/24h）
- OTP 提取成功率（24h）
- Webhook 投遞成功率（24h）
- 支付成功率（402 -> paid）

#### 主要圖表
- 郵件流量趨勢（時間序列）
- API 付費請求趨勢（按端點）
- 風險事件分佈（按 tenant）

### 4.2 Tenants

#### 列表字段
- `tenant_id`
- `name`
- `status`
- `primary_did`
- `active_agents`
- `active_mailboxes`
- `monthly_usage`
- `updated_at`

#### 詳情頁分區
- 基本信息
- DID/Wallet 綁定
- 配額與限流
- 最近賬單
- 風險狀態

#### 操作
- 啟用/禁用租戶
- 調整配額
- 重置租戶 token（高風險操作，需二次確認）

### 4.3 Mailboxes

#### 列表字段
- `mailbox_id`
- `address`
- `type`（alias/real）
- `status`（available/leased/frozen/retired）
- `tenant_id`
- `agent_id`
- `lease_expires_at`

#### 操作
- 手動分配 mailbox
- 提前回收 lease
- 凍結/解凍 mailbox
- 查看 mailbox 歷史事件

#### 批量操作
- 批量凍結
- 批量回收（僅 expired）

### 4.4 Messages

#### 列表字段
- `message_id`
- `mailbox_id`
- `sender_domain`
- `subject`
- `received_at`
- `parsed_status`
- `otp_extracted`（bool）

#### 詳情區塊
- 基礎頭信息
- OTP/驗證鏈接提取結果
- parser 錯誤與重試記錄
- webhook 投遞記錄

#### 操作
- 重跑解析
- 屏蔽發件域
- 手動觸發 webhook 重放

### 4.5 Webhooks

#### 列表字段
- `webhook_id`
- `tenant_id`
- `target_url`
- `event_types`
- `status`
- `last_delivery_at`
- `last_status_code`

#### 操作
- 建立/編輯/停用 webhook
- 旋轉 secret
- 重試最近一次失敗投遞
- 按時間窗口回放事件

### 4.6 Billing

#### 列表字段
- `invoice_id`
- `tenant_id`
- `period`
- `amount_usdc`
- `status`
- `settlement_tx_hash`

#### 視圖
- 月度用量明細（端點維度）
- 402 請求轉支付漏斗
- 鏈上結算對賬視圖

#### 操作
- 出賬（draft -> issued）
- 標記已支付（受鏈上回執驅動）
- 導出賬單明細 CSV

### 4.7 Risk

#### 指標
- 高風險租戶數
- 被封禁域命中率
- 速率限制觸發次數

#### 操作
- 新增/移除 denylist 域名
- 調整租戶速率策略
- 標記租戶為觀察狀態

### 4.8 Audit

#### 查詢條件
- `request_id`
- `tenant_id`
- `agent_id`
- `actor_did`
- `action`
- 時間範圍

#### 展示字段
- `timestamp`
- `actor_did`
- `action`
- `resource_type`
- `resource_id`
- `result`

#### 操作
- 導出審計報告（JSON/CSV）

## 5. 核心操作流程

### 5.1 郵箱凍結流程
1. Operator 在 Mailboxes 頁選擇 mailbox。
2. 執行 `Freeze`，填寫原因。
3. 系統寫入 `audit_logs`。
4. Mailbox 狀態變更為 `frozen`，新請求不可分配。

### 5.2 Webhook 失敗重放流程
1. 在 Webhooks 查看失敗投遞。
2. 選擇事件窗口重放。
3. 系統將事件重新入隊。
4. 投遞結果回寫記錄並更新圖表。

### 5.3 計費對賬流程
1. Billing 頁生成當期草稿賬單。
2. 系統聚合 `usage_records`，計算 `amount_usdc`。
3. 監聽鏈上支付回執，更新 invoice 為 `paid`。
4. 保存 `settlement_tx_hash` + `statement_hash`。

## 6. Dashboard API 對應（建議）

- Overview
  - `GET /v1/admin/overview/metrics`
  - `GET /v1/admin/overview/timeseries`
- Tenants
  - `GET /v1/admin/tenants`
  - `GET /v1/admin/tenants/{tenant_id}`
  - `PATCH /v1/admin/tenants/{tenant_id}`
- Mailboxes
  - `GET /v1/admin/mailboxes`
  - `POST /v1/admin/mailboxes/{mailbox_id}/freeze`
  - `POST /v1/admin/mailboxes/{mailbox_id}/release`
- Messages
  - `GET /v1/admin/messages`
  - `POST /v1/admin/messages/{message_id}/reparse`
  - `POST /v1/admin/messages/{message_id}/replay-webhook`
- Webhooks
  - `GET /v1/admin/webhooks`
  - `POST /v1/admin/webhooks/{webhook_id}/replay`
  - `POST /v1/admin/webhooks/{webhook_id}/rotate-secret`
- Billing
  - `GET /v1/admin/invoices`
  - `POST /v1/admin/invoices/{invoice_id}/issue`
- Risk
  - `GET /v1/admin/risk/events`
  - `POST /v1/admin/risk/policies`
- Audit
  - `GET /v1/admin/audit/logs`

## 7. 告警與SLO

### 7.1 告警規則（V1）
- Webhook 成功率 < 97%（5 分鐘窗口）
- OTP 提取成功率 < 95%（15 分鐘窗口）
- `mailboxes/allocate` p95 > 2 秒（10 分鐘窗口）
- 402 到支付成功率 < 90%（30 分鐘窗口）

### 7.2 SLO（V1）
- API 可用性：99.9%
- Webhook 最終送達率：99%
- 計費日匯總準確率：99.99%

## 8. 前端實作建議

- 框架：Next.js + TypeScript
- UI：表格優先（高密度運營場景）
- 狀態管理：React Query
- 圖表：ECharts 或 Recharts
- 權限控制：前後端雙重校驗

## 9. 開發排期（Dashboard 3 週）

### 第 1 週
- IA、路由、權限骨架
- Overview/Tenants/Mailboxes 列表頁

### 第 2 週
- Messages/Webhooks/Billing 頁
- 高風險操作確認彈窗與審計埋點

### 第 3 週
- Risk/Audit 頁
- 告警看板與導出
- E2E 驗收

## 10. 驗收清單

- 能按角色限制菜單與操作按鈕。
- 所有寫操作都可在 Audit 查到對應 `request_id`。
- Webhook 重放與消息重解析可用。
- 計費頁可看到賬單、用量、鏈上交易關聯。
- 主要看板在 10k+ 記錄下查詢可在 2 秒內返回（p95）。

## 11. 相關文檔
- `docs/development.md`（總體架構與服務邊界）
- `docs/openapi-admin.yaml`（Admin API 契約）
