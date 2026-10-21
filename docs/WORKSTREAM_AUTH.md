# 會員認證開發線

目標：以 Starry ID Google 登入作為唯一會員身分入口，H-Global D1 只存 H-Global 專屬權限及業務資料。

## 交付標準
- 驗證登入 token 的 issuer、audience、expiry、signature；不得信任前端提供的會員 ID。
- 角色授權預設拒絕；會員資料不可由公開 API 取得。
- API 對未登入回 401、無權限回 403，並有測試。
- 不複製 Starry ID 密碼或跨專案資料庫。

狀態：待實作，不可宣稱登入已完成。
