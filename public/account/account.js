// H-Global member desk. All member data is loaded from same-origin authenticated
// APIs and rendered with textContent, never inserted as untrusted HTML.
(() => {
 const byId=id=>document.getElementById(id);
 const status=byId('accountStatus'),login=byId('loginPanel'),panel=byId('authenticatedPanel');
 const tabs=byId('accountTabs'),host=byId('accountContent');
 const labels={profile:'我的資料',events:'我的活動',venues:'場地預約',
   subscriptions:'我的訂閱',notifications:'站內通知',admin:'內容管理'};
 let identity=null,revision=0;
 function el(tag,text,cls){
   const n=document.createElement(tag);
   if(text!==undefined && text!==null)n.textContent=String(text);
   if(cls)n.className=cls;
   return n;
 }
 function button(text,handler,variant){
   const b=el('button',text,'account-btn'+(variant?' '+variant:''));
   b.type='button';
   b.addEventListener('click',async()=>{
     b.disabled=true;
     try{await handler()}catch(err){showError(err)}
     finally{b.disabled=false}
   });
   return b;
 }
 function labelled(label,tag='input',type='text',value=''){
   const box=el('label',label);
   const input=document.createElement(tag);
   if(tag==='input')input.type=type;
   if(type!=='checkbox')input.value=String(value??'');
   else input.checked=Boolean(value);
   box.append(input);
   return {box,input};
 }
 function section(title){
   const box=el('section',null,'account-section');
   box.append(el('h3',title));
   host.append(box);
   return box;
 }
 function list(container,rows,render){
   if(!Array.isArray(rows)||!rows.length){
     container.append(el('p','目前沒有相關紀錄。','account-empty'));
     return;
   }
   const ul=el('ul',null,'account-list');
   for(const row of rows){
     const li=el('li');render(li,row);ul.append(li);
   }
   container.append(ul);
 }
 function line(container,text){container.append(el('p',text,'account-note'))}
 function link(href,text){
   const a=el('a',text,'account-link primary-btn');a.href=href;return a;
 }
 function empty(){host.replaceChildren()}
 function title(text){host.append(el('h2',text))}
 function showError(err){
   const code=String(err?.message||err||'request_failed').slice(0,120);
   status.className='account-status error';
   status.textContent='操作未完成：'+code+'。請確認權限、資料或稍後重試。';
 }
 function showInfo(text){
   status.className='account-status';
   status.textContent=text;
 }
 async function api(path,method='GET',body){
   const headers={'Accept':'application/json'};
   if(body!==undefined)headers['Content-Type']='application/json';
   const res=await fetch(path,{method,headers,credentials:'same-origin',
     cache:'no-store',redirect:'error',
     ...(body!==undefined?{body:JSON.stringify(body)}:{})});
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(data?.error||'HTTP '+res.status);
   return data;
 }
 function handleDate(value){return value?String(value).replace('T',' ').slice(0,19):'未設定'}
 function refresh(key){return render(key)}
 function renderTabs(){
   tabs.replaceChildren();
   const items=['profile','events','venues','subscriptions','notifications'];
   if(identity.roles?.some(role=>role==='super_admin'||role==='global_secretary'))items.push('admin');
   for(const key of items){
     const b=el('button',labels[key]);b.type='button';b.dataset.tab=key;
     b.setAttribute('aria-current',key==='profile'?'page':'false');
     b.addEventListener('click',()=>refresh(key).catch(showError));
     tabs.append(b);
   }
 }
 async function render(key){
   empty();
   tabs.querySelectorAll('button').forEach(b=>
     b.setAttribute('aria-current',b.dataset.tab===key?'page':'false'));
   title(labels[key]||'我的寰宇');
   try{
     if(key==='profile')await drawProfile();
     if(key==='events')await drawEvents();
     if(key==='venues')await drawVenues();
     if(key==='subscriptions')await drawSubscriptions();
     if(key==='notifications')await drawNotifications();
     if(key==='admin')await drawAdmin();
   }catch(err){
     host.append(el('p','資料暫時無法取得：'+String(err?.message||err),'account-error'));
   }
 }
 async function drawProfile(){
   const m=identity.member;
   const box=section('會員身分');
   line(box,'顯示名稱：'+(m.display_name||'未設定'));
   line(box,'會員識別碼：'+m.id);
   line(box,'獎銜：'+(m.rank_label||'未設定'));
   line(box,'本站管理權限：'+(identity.roles?.join('、')||'一般會員'));
   line(box,'中央會員資料仍由 Starry ID 管理；本站不保管 Google 密碼。');
   box.append(button('安全登出',async()=>{
     const res=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',
       cache:'no-store',redirect:'manual'});
     if(![200,303].includes(res.status))throw Error('logout_failed');
     location.assign('/');
   },'danger'));
 }
 function makeOption(select,value,text){
   const option=el('option',text);option.value=value;select.append(option);
 }
 function inputForField(def){
   const type=def.type;
   const outer=el('label',def.label+(def.required?'（必填）':''));
   let input;
   if(type==='textarea')input=el('textarea');
   else if(['select','radio','multiselect'].includes(type)){
     input=el('select');
     if(type==='multiselect')input.multiple=true;
     else makeOption(input,'','請選擇');
     for(const option of def.options||[])makeOption(input,String(option),String(option));
   }else{
     input=el('input');
     const typeMap={email:'email',phone:'tel',number:'number',date:'date',checkbox:'checkbox'};
     input.type=typeMap[type]||'text';
     if(type==='number')input.step='any';
     if(type==='checkbox')outer.className='checkbox';
   }
   input.required=Boolean(def.required);
   input.dataset.field=def.key;
   outer.append(input);
   return {outer,getValue(){
     if(type==='checkbox')return input.checked;
     if(type==='multiselect')return Array.from(input.selectedOptions,x=>x.value);
     return input.value;
   }};
 }
 async function drawEvents(){
   const mine=await api('/api/v1/event-registrations');
   const items=section('我的活動報名');
   list(items,mine.data,(li,r)=>{
     li.append(el('strong',r.event_title||r.event_id));
     line(li,'場次：'+(r.session_title||r.session_id)+' · '+handleDate(r.starts_at));
     line(li,'狀態：'+r.status+' · 付款：'+r.payment_status);
     if(['submitted','confirmed','waitlisted'].includes(r.status)&&
         ['unpaid','not_required'].includes(r.payment_status)){
       li.append(button('取消報名',async()=>{
         if(!confirm('確定取消這筆活動報名？'))return;
         await api('/api/v1/event-registrations/'+encodeURIComponent(r.id),'DELETE');
         showInfo('已取消活動報名。');await refresh('events');
       },'danger'));
     }
   });
   const available=section('報名新活動');
   const res=await api('/api/v1/events?limit=50&offset=0');
   list(available,res.data,(li,event)=>{
     li.append(el('strong',event.title||'活動'));
     line(li,event.summary||'');
     li.append(button('選擇場次及填寫報名表',async()=>drawEventForm(event,li),'subtle'));
   });
 }
 async function drawEventForm(event,root){
   const [sessions,form]=await Promise.all([
     api('/api/v1/event-sessions?event_id='+encodeURIComponent(event.id)),
     api('/api/v1/event-form?event_id='+encodeURIComponent(event.id))
   ]);
   const box=el('form',null,'account-form');
   box.addEventListener('submit',async e=>{
     e.preventDefault();
     const selected=sel.value;
     if(!selected){showInfo('請先選擇場次。');return}
     const answers={};
     for(const field of inputs)answers[field.key]=field.getValue();
     const submit=box.querySelector('button[type=submit]');
     submit.disabled=true;
     try{
       await api('/api/v1/event-registrations','POST',
         {event_id:event.id,session_id:selected,answers});
       showInfo('活動報名已送出，請留意後續審核通知。');
       await refresh('events');
     }catch(err){showError(err)}
     finally{submit.disabled=false}
   });
   const sessionsLabel=el('label','活動場次');
   const sel=el('select');sel.required=true;
   makeOption(sel,'','請選擇場次');
   for(const session of sessions.sessions||[]){
     makeOption(sel,session.id,(session.title||'場次')+' · '+
       handleDate(session.starts_at)+' · '+(session.venue_text||''));
   }
   sessionsLabel.append(sel);box.append(sessionsLabel);
   const inputs=[];
   for(const def of form.fields||[]){
     const field=inputForField(def);
     inputs.push({key:def.key,getValue:field.getValue});
     box.append(field.outer);
   }
   const send=el('button','提交報名','account-btn');send.type='submit';
   box.append(send);
   const old=root.querySelector('form');
   if(old)old.remove();
   root.append(box);
 }
 async function drawVenues(){
   const mine=await api('/api/v1/venue-bookings');
   const bookings=section('我的場地申請');
   list(bookings,mine.data,(li,b)=>{
     li.append(el('strong',b.venue_name||b.venue_id));
     line(li,handleDate(b.starts_at)+' 至 '+handleDate(b.ends_at));
     line(li,'狀態：'+b.status+' · '+b.total_amount+' '+b.currency);
     if(b.status==='pending')li.append(button('取消待審核預約',async()=>{
       if(!confirm('確定取消這筆場地預約？'))return;
       await api('/api/v1/venue-bookings/'+encodeURIComponent(b.id),'DELETE');
       showInfo('已取消待審核場地預約。');await refresh('venues');
     },'danger'));
   });
   const venues=section('查詢可預約場地');
   const results=await api('/api/v1/venues?limit=50&offset=0');
   list(venues,results.data,(li,v)=>{
     li.append(el('strong',v.name||v.id));
     line(li,v.address_text||'');
     li.append(button('查詢可用日期與時段',()=>drawVenueSlots(v,li),'subtle'));
   });
 }
 async function drawVenueSlots(venue,root){
   const previous=root.querySelector('form');
   if(previous)previous.remove();
   const form=el('form',null,'account-form');
   const dates=el('div',null,'account-row');
   const start=labelled('開始日期','input','date');
   const end=labelled('結束日期','input','date');
   dates.append(start.box,end.box);form.append(dates);
   const phone=labelled('聯絡電話（選填）','input','tel');
   const purpose=labelled('用途（選填）','textarea');
   form.append(phone.box,purpose.box);
   const slots=el('div',null,'account-list');
   form.addEventListener('submit',async e=>{
     e.preventDefault();
     const from=start.input.value,to=end.input.value;
     if(!from||!to||from>to){showInfo('請選擇有效日期範圍。');return}
     slots.replaceChildren(el('p','正在查詢時段…'));
     try{
       const p=new URLSearchParams({venue_id:venue.id,from,to});
       const result=await api('/api/v1/venue-availability?'+p);
       slots.replaceChildren();
       if(!result.slots?.length){line(slots,'該日期範圍沒有可用時段。');return}
       for(const slot of result.slots){
         const item=el('div',null,'account-box');
         item.append(el('strong',handleDate(slot.starts_at)+' 至 '+handleDate(slot.ends_at)));
         line(item,'預約金額依後端時段價格確認：'+slot.price_amount+' '+slot.currency);
         item.append(button('申請此時段',async()=>{
           if(!confirm('確定提交此時段的預約申請？'))return;
           await api('/api/v1/venue-bookings','POST',{
             slot_id:slot.id,contact_phone:phone.input.value,purpose:purpose.input.value
           });
           showInfo('場地預約申請已送出，等待管理員審核。');
           await refresh('venues');
         }));
         slots.append(item);
       }
     }catch(err){showError(err)}
   });
   const submit=el('button','查詢可用時段','account-btn');
   submit.type='submit';form.append(submit,slots);root.append(form);
 }
 async function drawSubscriptions(){
   const subscriptions=await api('/api/v1/subscriptions');
   const current=section('訂閱中的頁面');
   list(current,subscriptions.data,(li,s)=>{
     li.append(el('strong',s.title||s.public_id));
     line(li,s.enabled?'已訂閱站內通知':'目前停用');
     if(s.enabled)li.append(button('取消訂閱',async()=>{
       await api('/api/v1/subscriptions/'+encodeURIComponent(s.public_id),'DELETE');
       showInfo('已取消訂閱。');await refresh('subscriptions');
     },'subtle'));
   });
   const pages=section('新增公開頁面訂閱');
   line(pages,'目前只開放站內通知；Email 及 PWA 推播須另行取得明確授權後才會啟用。');
   const candidates=await api('/api/v1/pages?limit=50&offset=0');
   list(pages,candidates.data,(li,p)=>{
     li.append(el('strong',p.title||p.public_id));
     if(p.subscribable===0)return;
     li.append(button('訂閱',async()=>{
       await api('/api/v1/subscriptions/'+encodeURIComponent(p.public_id),'PUT');
       showInfo('已訂閱此頁面的站內通知。');
       await refresh('subscriptions');
     }));
   });
 }
 async function drawNotifications(){
   const response=await api('/api/v1/notifications?limit=50&offset=0');
   const box=section('站內訊息（未讀：'+response.unread_count+'）');
   list(box,response.data,(li,n)=>{
     li.append(el('strong',n.title||'通知'));
     line(li,n.body||'');
     line(li,handleDate(n.created_at)+(n.read_at?' · 已讀':' · 未讀'));
     if(!n.read_at)li.append(button('標示已讀',async()=>{
       await api('/api/v1/notifications/'+encodeURIComponent(n.id),'PATCH');
       await refresh('notifications');
     },'subtle'));
   });
 }
 async function drawAdmin(){
   if(!identity.roles?.some(r=>r==='super_admin'||r==='global_secretary')){
     host.append(el('p','沒有管理權限。'));return;
   }
   const box=section('建立內容草稿');
   const form=el('form',null,'account-form');
   const id=labelled('公開頁面 ID（僅數字）');
   id.input.required=true;id.input.pattern='[0-9]{1,12}';
   const name=labelled('標題');name.input.required=true;name.input.maxLength=120;
   const menu=labelled('所屬一級選單','select');
   for(const option of ['首頁','最新消息','活動報名','寰宇大學','活動花絮','場地租借','關於寰宇'])
     makeOption(menu.input,option,option);
   const body=labelled('內文（安全文字模式）','textarea');body.input.maxLength=24000;
   form.append(id.box,name.box,menu.box,body.box);
   const create=el('button','建立草稿','account-btn');create.type='submit';form.append(create);
   form.addEventListener('submit',async e=>{
     e.preventDefault();create.disabled=true;
     try{
       await api('/api/v1/admin/page-drafts','POST',{
         public_id:id.input.value,title:name.input.value,
         menu_key:menu.input.value,text:body.input.value
       });
       showInfo('已建立草稿及初始版本。');await refresh('admin');
     }catch(err){showError(err)}finally{create.disabled=false}
   });
   box.append(form);
   const drafts=section('草稿與版本');
   const listData=await api('/api/v1/admin/page-drafts');
   list(drafts,(listData.data||[]).filter(x=>x.status==='draft'),(li,p)=>{
     li.append(el('strong',p.title+'（'+p.public_id+'）'));
     line(li,'最後編輯：'+handleDate(p.updated_at));
     li.append(button('開啟編輯及送審',()=>editDraft(p.public_id,li),'subtle'));
   });
   const review=section('待審核發布申請');
   const pending=await api('/api/v1/admin/page-publications?status=pending');
   list(review,pending.data,(li,q)=>{
     li.append(el('strong',q.title+'（'+q.public_id+'）'));
     line(li,'版本：'+q.revision_no+' · 申請者：'+q.requested_by);
     li.append(button('核准並發布',async()=>{
       if(!confirm('確認已核對內容並核准發布？提交者不可自行核准。'))return;
       await api('/api/v1/admin/page-publications','POST',{action:'approve',request_id:q.id});
       showInfo('已核准發布。');await refresh('admin');
     }));
     li.append(button('拒絕申請',async()=>{
       const reason=prompt('請填寫拒絕原因（最多 300 字）','需要修正內容');
       if(reason===null)return;
       await api('/api/v1/admin/page-publications','POST',{
         action:'reject',request_id:q.id,review_note:reason.slice(0,300)
       });
       showInfo('已拒絕發布申請。');await refresh('admin');
     },'danger'));
   });
 }
 function safeTextFromHtml(html){
   const documentFragment=new DOMParser().parseFromString(String(html||''),'text/html');
   return Array.from(documentFragment.body.children,x=>x.textContent||'').join('\n');
 }
 async function editDraft(publicId,root){
   const data=await api('/api/v1/admin/page-drafts/'+encodeURIComponent(publicId));
   const latest=data.revisions?.[0];
   if(!latest)throw Error('draft_revision_unavailable');
   const old=root.querySelector('form');if(old)old.remove();
   const form=el('form',null,'account-form');
   const title=labelled('草稿標題','input','text',data.page.title);
   const menu=labelled('一級選單','select');
   for(const option of ['首頁','最新消息','活動報名','寰宇大學','活動花絮','場地租借','關於寰宇'])
     makeOption(menu.input,option,option);
   menu.input.value=data.page.menu_key;
   const text=labelled('草稿內容','textarea','text',safeTextFromHtml(data.page.content_html));
   const note=labelled('修改說明','input','text','內容修正');
   form.append(title.box,menu.box,text.box,note.box);
   const save=el('button','儲存新版本','account-btn');save.type='submit';form.append(save);
   form.addEventListener('submit',async e=>{
     e.preventDefault();save.disabled=true;
     try{
       await api('/api/v1/admin/page-drafts/'+encodeURIComponent(publicId),'PATCH',{
         title:title.input.value,menu_key:menu.input.value,text:text.input.value,
         expected_revision:latest.revision_no,change_note:note.input.value
       });
       showInfo('草稿新版本已建立。');await refresh('admin');
     }catch(err){showError(err)}finally{save.disabled=false}
   });
   form.append(button('提交雙人發布審核',async()=>{
     await api('/api/v1/admin/page-publications','POST',{
       action:'submit',public_id:publicId,revision_no:latest.revision_no
     });
     showInfo('已提交審核。需由另一位有權限管理員核准。');
     await refresh('admin');
   },'subtle'));
   root.append(form);
 }
 async function start(){
   try{
     const me=await api('/api/v1/members/me');
     if(!me?.member)throw Error('member_identity_missing');
     identity=me;
     login.hidden=true;panel.hidden=false;
     showInfo('Starry ID 身分已驗證，可使用 H-Global 會員功能。');
     renderTabs();await render('profile');
   }catch(err){
     login.hidden=false;panel.hidden=true;
     showInfo('目前尚未登入，或 Starry ID 中央服務尚未完成授權。');
   }
 }
 start().catch(showError);
})();
