// Text-only safe authoring subset used until rich-text media and sanitizer are reviewed.
// Content is never interpreted as HTML from a user's input.
export const MENU_KEYS=new Set(['首頁','最新消息','活動報名','寰宇大學','活動花絮','場地租借','關於寰宇']);
export function draftInput(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) return null;
  const {public_id,title,menu_key,text}=value;
  if(typeof public_id!=='string' || !/^[0-9]{1,12}$/.test(public_id) ||
     typeof title!=='string' || title.trim().length<1 || title.trim().length>120 ||
     typeof menu_key!=='string' || !MENU_KEYS.has(menu_key) ||
     typeof text!=='string' || text.length>24000) return null;
  return {public_id,title:title.trim(),menu_key,text};
}
export function safeTextHtml(input) {
  const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  return input.split(/\r?\n/).map(s=>'<p>'+escape(s)+'</p>').join('');
}
