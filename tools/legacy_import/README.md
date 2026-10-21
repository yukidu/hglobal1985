# H-Global 37 頁舊站內容：私人暫存工具

來源：V10 交接包中 `HGlobal_舊網站實際內容_安全預覽版.html`（不放進公開 GitHub）。

## 本機執行

```bash
python -m pip install 'beautifulsoup4>=4.12,<5'
python tools/legacy_import/export.py /path/to/HGlobal_舊網站實際內容_安全預覽版.html --output /private/location/private-staging.json
python tools/legacy_import/stage.py /private/location/private-staging.json --db /private/location/private-staging.sqlite
python tools/legacy_import/stage.py /private/location/private-staging.json --db /private/location/private-staging.sqlite
python -m unittest -v tests/test_legacy_import.py
```

預期：37 頁（25 內容、12 系統）；第一次 changed=37，第二次 changed=0；revision 數量不重複增加。

## 安全限制

- 全程本機執行；沒有連接 Cloudflare、Starry ID、繁星回聲，也沒有 D1 寫入。
- 原始內容和版本快照可能包含敏感資訊，不可提交公開 GitHub。
- 匯入一律 draft、review_required=true、media_verified=false、publish_allowed=false。
- 舊版 WordPress 外掛 shortcode 不執行，顯示「舊版外掛功能待重建」。
- `source_snapshot_html` 是未淨化的來源，不可在前端直接渲染。
- `staging_html` 使用保守 HTML allowlist；不能取代正式 CMS 的伺服器端消毒與安全審核。
- 沒有匯入到 Preview D1，更沒有上線任何舊站頁面。

## 尚待開發

- 私密、安全的 D1 staging 匯入管道及分批審核。
- 內容／媒體完整性核對，舊版系統頁標記為不發布。
- 原始 URL 到新版 URL 的映射、權限檢查、逐頁發布。
