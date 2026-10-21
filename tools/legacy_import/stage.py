#!/usr/bin/env python3
"""Idempotent OFFLINE SQLite staging of 37 H-Global legacy pages. Never publishes."""
import argparse,hashlib,json,sqlite3
from pathlib import Path
from export import EXPECTED_IDS,SYSTEM_IDS

SCHEMA="""
CREATE TABLE IF NOT EXISTS source_pages (
 source_wp_id INTEGER PRIMARY KEY,
 source_title TEXT NOT NULL,
 source_url TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 source_snapshot_html TEXT NOT NULL,
 staging_html TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK(content_type IN ('content','system')),
 status TEXT NOT NULL CHECK(status='draft'),
 review_required INTEGER NOT NULL CHECK(review_required=1),
 media_verified INTEGER NOT NULL CHECK(media_verified=0),
 shortcode_detected INTEGER NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS source_revisions (
 source_wp_id INTEGER NOT NULL,
 source_sha256 TEXT NOT NULL,
 source_snapshot_html TEXT NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(source_wp_id,source_sha256)
);
CREATE TABLE IF NOT EXISTS import_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 manifest_sha256 TEXT NOT NULL,
 imported_count INTEGER NOT NULL,
 changed_count INTEGER NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

def stage(manifest,db_path):
    raw=Path(manifest).read_bytes()
    data=json.loads(raw)
    if data.get('schema_version')!=1 or data.get('publish_allowed') is not False:
        raise ValueError('Unsafe manifest: must prohibit publishing')
    pages=data.get('pages')
    if not isinstance(pages,list) or len(pages)!=37:
        raise ValueError('Expected exactly 37 old-site pages')
    ids=[p['source_wp_id'] for p in pages]
    if set(ids)!=EXPECTED_IDS or len(ids)!=len(set(ids)):
        raise ValueError('Duplicate, missing or extra WordPress IDs')
    required={'source_wp_id','source_title','source_url','source_sha256','source_snapshot_html','staging_html','content_type','status','review_required','media_verified','shortcode_detected'}
    for page in pages:
        if not required.issubset(page): raise ValueError('Missing staged page fields')
        if page['status']!='draft' or page['review_required'] is not True or page['media_verified'] is not False:
            raise ValueError('Unsafe publication/media flags')
        if page['content_type']!=('system' if page['source_wp_id'] in SYSTEM_IDS else 'content'):
            raise ValueError('Wrong source content type')
        if hashlib.sha256(page['source_snapshot_html'].encode('utf-8')).hexdigest()!=page['source_sha256']:
            raise ValueError('Source snapshot hash mismatch')
        if not isinstance(page['source_url'],str) or not page['source_url'].startswith('https://hglobal1985.com/'):
            raise ValueError('Untrusted source URL')
    Path(db_path).parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(db_path)
    try:
        con.executescript(SCHEMA)
        changed=0
        with con:
            for page in pages:
                old=con.execute('SELECT source_sha256 FROM source_pages WHERE source_wp_id=?',(page['source_wp_id'],)).fetchone()
                if old is None or old[0]!=page['source_sha256']: changed+=1
                con.execute('INSERT OR IGNORE INTO source_revisions(source_wp_id,source_sha256,source_snapshot_html) VALUES (?,?,?)',
                    (page['source_wp_id'],page['source_sha256'],page['source_snapshot_html']))
                con.execute("""INSERT INTO source_pages
                    (source_wp_id,source_title,source_url,source_sha256,source_snapshot_html,staging_html,content_type,status,review_required,media_verified,shortcode_detected)
                    VALUES (?,?,?,?,?,?,?,'draft',1,0,?)
                    ON CONFLICT(source_wp_id) DO UPDATE SET
                    source_title=excluded.source_title,
                    source_url=excluded.source_url,
                    source_sha256=excluded.source_sha256,
                    source_snapshot_html=excluded.source_snapshot_html,
                    staging_html=excluded.staging_html,
                    shortcode_detected=excluded.shortcode_detected,
                    updated_at=CASE WHEN source_pages.source_sha256<>excluded.source_sha256 THEN CURRENT_TIMESTAMP ELSE source_pages.updated_at END""",
                    (page['source_wp_id'],page['source_title'],page['source_url'],page['source_sha256'],page['source_snapshot_html'],
                    page['staging_html'],page['content_type'],int(page['shortcode_detected'])))
            con.execute('INSERT INTO import_runs(manifest_sha256,imported_count,changed_count) VALUES (?,?,?)',
                (hashlib.sha256(raw).hexdigest(),len(pages),changed))
        return {'staged':len(pages),'changed':changed,
            'revisions':con.execute('SELECT COUNT(*) FROM source_revisions').fetchone()[0],
            'published':0}
    finally: con.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('manifest',type=Path)
    parser.add_argument('--db',required=True,type=Path)
    args=parser.parse_args()
    print(json.dumps(stage(args.manifest,args.db),ensure_ascii=False))
