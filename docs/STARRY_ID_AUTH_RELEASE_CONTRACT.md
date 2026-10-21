# H-Global × Starry ID 中央登入接線契約

## 目前事實（2026-10-21）
- 中央登入服務使用 id.starry.phd，實作位於 yukidu/Echo-Starry。
- 既有 SSO App allowlist 尚未包含 H-Global；目前無法直接沿用中央 App Ticket 登入。
- 尚未確認 Starry ID 對 H-Global 發行專屬短效簽章 JWT 的 JWKS/API 契約。不能自行假設存在。
- H-Global 已具備驗證 RS256 JWT、issuer、audience、exp、subject，並讀取 H-Global D1 角色的後端基礎；缺少可信中央簽發環節時一律拒絕存取。

## 完成上線前必備條件
1. 中央正式註冊 hglobal App，獨立授權、origin allowlist 及登入回跳 URL。
2. 採用一次性短效 App Ticket + 安全後端兌換，或 OIDC + PKCE；不得在回跳 URL 暴露長期 token。
3. 後端只接受 Starry ID 簽章、精確 issuer、專屬 audience=hglobal1985 的短效認證；支援金鑰輪替。
4. 經核准的 App Scoped API 只讀取必要中央會員基本欄位，禁止 H-Global 直接連中央 Starry ID D1。
5. 將中央 subject 映射至 H-Global members.external_subject，管理角色由 H-Global member_roles 判定。
6. 完成登入、登出、過期、撤銷、封鎖會員、跨站安全與手機 PWA 回跳測試。
7. 上述未通過前，所有會員寫入 API 只能拒絕未授權請求，不對一般使用者開放。

## H-Global 專用部署設定（中央已支持後才設定）
- STARRY_ID_ISSUER
- STARRY_ID_AUDIENCE
- STARRY_ID_JWKS_URL

這些僅可透過 Cloudflare 環境安全設定配置；不可公開貼出 API Token 或將金鑰放進 GitHub 程式碼。

## 其他正式上線門檻
- CMS 圖文／YouTube 富文字編輯、審核發布、版本還原
- 活動完整表單、名額、報名、QR 報到、候補／取消
- 場地申請、審核、修改取消、通知與衝突測試
- 37 頁原文與媒體檢查及逐頁審核發布
- 訂閱／站內、Push、Email 通知，已刪除 LINE 通知不得恢復
- Production 獨立 D1、資源/Secrets、DNS、安全驗證、可回滾部署
