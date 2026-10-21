# H-Global 離線內容匯入 V2

目前本機驗證：37 頁來源 HTML → JSON staging → SQLite staging。資料內容與 SQLite 檔案保持私有，不提交公開 GitHub。

## 測試
- 首次匯入 37 筆；相同 manifest 重跑 changed=0。
- 原文 SHA256 變更時，版本表增加一筆，保留歷史。
- 來源 ID 不符合、hash 不符、publish_allowed=true 時拒絕。

## 下一階段
- 依 D1 schema 做正式的來源頁對照與 UPSERT migration。
- 明確分離原始來源快照與經審核可公開內容。
- 加上身份驗證、CMS 審核及逐頁發布。

本文件僅記錄本機測試，不代表已匯入 Cloudflare D1 或已完成網站移植。