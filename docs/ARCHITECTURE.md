# H-Global 架構基準（初版）

## 環境隔離
- GitHub `main`：正式程式碼基準。
- 功能分支 + PR：所有實作先在分支完成。
- Cloudflare Pages Preview：先驗收 UI；Preview 不連正式資料庫。
- Production：只有驗收通過後才啟用正式部署。
- 本階段已建立 Cloudflare Pages 測試預覽與獨立測試 D1 `hglobal-preview-db`。初始 schema migration 已套用；僅 Preview 綁定 `HGLOBAL_DB`，Production 不綁定該測試資料庫。尚未建立正式資料庫、R2/KV、會員登入或正式身分串接。

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
目前前端頁面仍使用示意內容；Preview API 已提供健康檢查與公開讀取端點（最新消息、已發布活動、啟用場地），目前資料表為空。會員登入、寫入 API、後台權限與正式身分串接尚未完成。此分支為第一個 UI/API 基礎里程碑，不可宣稱為可正式營運的完整系統。


## 已建立的 Preview 資源（2026-10-20）
- Cloudflare Pages 專案：`hglobal-preview`，網址為 `hglobal-preview.pages.dev`。
- 專用測試 D1：`hglobal-preview-db`（APAC）；僅 Preview binding `HGLOBAL_DB`。
- Migration：`migrations/0001_initial_schema.sql`，包含頁面／版本、會員外部識別、角色與版主、訂閱與提醒、通知、新聞、活動／場次／動態報名欄位／報名值、場地／時段／預訂／設備、人工審核匯入、繁星回聲唯讀音檔引用、管理設定與審計紀錄等資料表。
- Preview API：`GET /api/v1/health`、`GET /api/v1/news`、`GET /api/v1/events`、`GET /api/v1/venues`。
- API 目前只提供公開資料的唯讀列表及健康檢查；跨 APP 授權、寫入端點、速率限制與 CORS allowlist 必須在對外串接前完成。
- 正式部署自動化維持停用；未綁定 `hglobal1985.com`；沒有修改 DNS。
