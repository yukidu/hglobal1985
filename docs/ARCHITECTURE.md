# H-Global 架構基準（初版）

## 環境隔離
- GitHub `main`：正式程式碼基準。
- 功能分支 + PR：所有實作先在分支完成。
- Cloudflare Pages Preview：先驗收 UI；Preview 不連正式資料庫。
- Production：只有驗收通過後才啟用正式部署。
- 本次首階段只建立靜態 UI 測試預覽；尚未建立 D1/R2/KV、API 或會員登入。

## 資料邊界
H-Global 必須使用專屬 D1、R2 與 Worker/Pages Functions。禁止直接讀寫 Starry ID、繁星回聲的應用資料庫。Starry ID 與繁星回聲只能透過明確核准、最小權限的 API 介接。

預定 API 模組（版本化）：
- `/api/v1/news`：最新消息
- `/api/v1/events`：活動與報名
- `/api/v1/venues`：場地租借
- `/api/v1/pages`：CMS 頁面與選單
- `/api/v1/members/me`：經 Starry ID 授權後的目前會員資訊（不複製中央身分系統）

## 原則
- 手機優先；管理後台同樣響應式。
- 所有網址、前綴、頁面權限與版主設定由 CMS 管理。
- 資料庫變更必須用可追蹤的 migration；不在正式資料上測試。
- 不提交秘密、token、個人會員資料。
- 保留 V10 交接包規格及後續已確認更正；刪除項目不可恢復。
- 視覺基準為 V11.3 翡翠綠 × 香檳金；設計 token 和共用元件統一控制樣式。

## 目前限制
目前預覽使用示意資料，尚無正式登入、資料持久化、API 或後台權限。此分支為第一個 UI 架構里程碑，不可宣稱為可正式營運的完整系統。
