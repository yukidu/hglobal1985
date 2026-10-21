"""Synthetic regression tests: do not require or reveal original 37 pages."""
import copy,hashlib,json,sqlite3,tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'/'legacy_import'))
from export import EXPECTED_IDS,export
from stage import stage

class LegacyImportTests(unittest.TestCase):
    def build(self,directory):
        source=directory/'source.html'
        html='<html><body>'
        for wp_id in sorted(EXPECTED_IDS):
            html+=(f'<section class="page" id="p-{wp_id}" data-page-title="頁面{wp_id}">'
                '<div class="article"><p>公開測試內容<script>alert(1)</script>'
                '<a href="javascript:alert(1)" onclick="alert(1)">連結</a></p></div>'
                f'<div class="links"><a href="https://hglobal1985.com/?page_id={wp_id}">來源</a></div></section>')
        source.write_text(html+'</body></html>',encoding='utf-8')
        return export(source)

    def test_all_pages_safe_and_repeatable(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);manifest=root/'private-staging.json';db=root/'private-staging.sqlite'
            data=self.build(root)
            self.assertEqual(len(data['pages']),37)
            self.assertFalse(data['publish_allowed'])
            first=data['pages'][0]
            self.assertNotIn('<script',first['staging_html'])
            self.assertNotIn('onclick',first['staging_html'])
            self.assertNotIn('javascript:',first['staging_html'])
            self.assertEqual(first['status'],'draft')
            manifest.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            self.assertEqual(stage(manifest,db)['changed'],37)
            self.assertEqual(stage(manifest,db)['changed'],0)
            changed=copy.deepcopy(data)
            changed['pages'][0]['source_snapshot_html']+='<p>change</p>'
            changed['pages'][0]['source_sha256']=hashlib.sha256(changed['pages'][0]['source_snapshot_html'].encode()).hexdigest()
            manifest.write_text(json.dumps(changed,ensure_ascii=False),encoding='utf-8')
            self.assertEqual(stage(manifest,db)['changed'],1)
            self.assertEqual(stage(manifest,db)['revisions'],38)
            con=sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM source_pages WHERE status='draft'").fetchone()[0],37)
            con.close()

    def test_rejects_unreviewed_publish_and_hash_tamper(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);manifest=root/'private-staging.json';db=root/'private.sqlite'
            data=self.build(root);data['publish_allowed']=True
            manifest.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            with self.assertRaises(ValueError):stage(manifest,db)
            data['publish_allowed']=False;data['pages'][0]['source_sha256']='0'*64
            manifest.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            with self.assertRaises(ValueError):stage(manifest,db)
if __name__=='__main__':unittest.main()
