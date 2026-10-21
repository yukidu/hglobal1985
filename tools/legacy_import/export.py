#!/usr/bin/env python3
"""Offline H-Global 37-page staging exporter. Never publishes or calls Cloudflare.
Output is PRIVATE: source snapshots can include legacy personal information.
Requires: pip install beautifulsoup4
"""
import argparse, hashlib, json, re
from pathlib import Path
from bs4 import BeautifulSoup, Comment

EXPECTED_IDS={10,24,28,30,35,37,39,51,63,100,131,148,228,230,232,234,236,240,346,350,420,468,718,721,739,1646,2246,2518,2519,2520,2521,2522,2934,2952,4008,4508,4695}
SYSTEM_IDS={228,230,232,234,236,240,2518,2519,2520,2521,2522,4508}
SAFE_TAGS={'p','br','strong','b','em','i','u','h1','h2','h3','h4','ul','ol','li','table','thead','tbody','tr','td','th','blockquote','hr','figure','figcaption','details','summary','div','span','small','a'}
SAFE_ATTRS={'a':{'href','title'},'td':{'colspan','rowspan'},'th':{'colspan','rowspan'}}
SHORTCODE=re.compile(r'\[(?:/?[A-Za-z][\w-]*)(?:\s[^\]]*)?\]')

def sanitize(fragment):
    soup=BeautifulSoup(fragment,'html.parser')
    for node in list(soup.find_all(string=lambda x:isinstance(x,Comment))): node.extract()
    for node in list(soup.find_all(True)):
        if node.name in {'script','style','iframe','object','embed','form','input','button','svg','math'}:
            node.decompose()
        elif node.name not in SAFE_TAGS:
            node.unwrap()
        else:
            for key in list(node.attrs):
                if key not in SAFE_ATTRS.get(node.name,set()): del node[key]
            if node.name=='a' and node.has_attr('href'):
                href=node['href'].strip()
                if not (href.startswith(('https://','http://','/','#')) and not href.startswith('//')):
                    del node['href']
    for node in soup.find_all(string=True):
        if SHORTCODE.search(str(node)):
            node.replace_with(SHORTCODE.sub('[舊版外掛功能待重建]',str(node)))
    return str(soup)

def export(source):
    soup=BeautifulSoup(Path(source).read_text(encoding='utf-8'),'html.parser')
    pages=[]
    for section in soup.select('section.page[id^="p-"]'):
        found=re.fullmatch(r'p-(\d+)',section.get('id',''))
        if not found: continue
        wp_id=int(found.group(1))
        article=section.select_one('.article')
        if article is None: raise ValueError(f'Missing article: {wp_id}')
        raw=article.decode_contents()
        links=section.select('.links a[href]')
        url=next((a['href'] for a in links if f'page_id={wp_id}' in a['href']),f'https://hglobal1985.com/?page_id={wp_id}')
        pages.append({
            'source_wp_id':wp_id,'source_title':section.get('data-page-title','').strip(),'source_url':url,
            'source_sha256':hashlib.sha256(raw.encode('utf-8')).hexdigest(),
            'source_snapshot_html':raw,'staging_html':sanitize(raw),
            'content_type':'system' if wp_id in SYSTEM_IDS else 'content',
            'status':'draft','review_required':True,'media_verified':False,
            'shortcode_detected':bool(SHORTCODE.search(BeautifulSoup(raw,'html.parser').get_text()))
        })
    ids=[p['source_wp_id'] for p in pages]
    if len(ids)!=37 or set(ids)!=EXPECTED_IDS or len(ids)!=len(set(ids)):
        raise ValueError(f'37-page source mismatch: missing {EXPECTED_IDS-set(ids)}, unexpected {set(ids)-EXPECTED_IDS}')
    return {'schema_version':1,'publish_allowed':False,'pages':sorted(pages,key=lambda p:p['source_wp_id'])}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    if args.output.exists(): raise SystemExit('Refusing to overwrite existing private staging data')
    result=export(args.source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Staged',len(result['pages']),'legacy pages as UNPUBLISHED private drafts')
