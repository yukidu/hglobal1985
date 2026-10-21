import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAnswers,publicField,validEventId} from '../functions/_lib/event-form.js';
import {onRequestGet} from '../functions/api/v1/event-form.js';

const field=(id,key,type,required=0,options=[])=>({id,field_key:key,label:'欄位 '+key,
  field_type:type,required,options_json:JSON.stringify(options)});
test('validate all supported dynamic field kinds without HTML injection',()=>{
 const fields=[
  field('1','name','text',1),
  field('2','description','textarea'),
  field('3','qty','number',1),
  field('4','food','select',1,['素食','葷食']),
  field('5','hobbies','multiselect',0,['閱讀','散步']),
  field('6','arrival','date',1),
  field('7','phone','phone'),
  field('8','email','email'),
  field('9','consent','checkbox',1),
  field('10','choice','radio',1,['A','B'])
 ];
 const answers={name:'報名者',description:'<script>alert(1)</script>',qty:'2',
   food:'素食',hobbies:['閱讀'],arrival:'2026-11-30',phone:'0912 345 678',
   email:'foo@example.com',consent:true,choice:'A'};
 const v=normalizeAnswers(fields,answers);
 assert.equal(v.error,undefined);
 assert.equal(v.values.length,10);
 assert.deepEqual(v.values.map(x=>x.id),fields.map(x=>x.id));
 assert.equal(v.values[4].value,'["閱讀"]');
 assert.equal(v.values[8].value,'true');
});
test('required fields are enforced and invalid options, dates, email are rejected',()=>{
 const fields=[field('1','full_name','text',1),field('2','food','select',1,['vegan']),
  field('3','birthday','date'),field('4','confirm','checkbox',1)];
 for(const [answers,error] of [
  [{full_name:'',food:'vegan',confirm:true},'required_event_field'],
  [{full_name:'Amy',food:'steak',confirm:true},'invalid_event_field'],
  [{full_name:'Amy',food:'vegan',confirm:false},'required_event_field'],
  [{full_name:'Amy',food:'vegan',confirm:true,birthday:'2026-02-30'},'invalid_event_field'],
  [{full_name:'Amy',food:'vegan',confirm:true,admin_role:'super_admin'},'unknown_event_field']
 ])assert.equal(normalizeAnswers(fields,answers).error,error);
});
test('malformed form definitions fail closed',()=>{
 assert.equal(validEventId('../secret'),false);
 assert.equal(publicField(field('id','bad','password')),null);
 assert.equal(normalizeAnswers([field('id','a','text'),field('id2','a','text')],{}).error,
   'event_form_configuration_unavailable');
 assert.equal(normalizeAnswers([field('id','a','text',1)],'bad').error,'invalid_event_answers');
 assert.equal(normalizeAnswers(Array.from({length:65},(_,i)=>field(String(i),'key'+i,'text')),{})
   .error,'event_form_configuration_unavailable');
});
test('public form endpoint only reads form for published event',async()=>{
 const sql=[],ids=[];
 const db={prepare(s){sql.push(s);return{bind(x){ids.push(x);return{
   first:async()=>({id:'evt',title:'活動',category:'training'}),
   all:async()=>({results:[field('secret-db-id','food','select',1,['vegan'])]})
 }}}}};
 const res=await onRequestGet({request:new Request('https://preview.test/api/v1/event-form?event_id=evt'),
  env:{HGLOBAL_DB:db}});
 assert.equal(res.status,200);
 assert.match(sql[0],/status='published'/);
 assert.deepEqual(ids,['evt','evt']);
 const body=await res.json();
 assert.deepEqual(body.fields[0],{key:'food',label:'欄位 food',type:'select',required:true,options:['vegan']});
 assert.doesNotMatch(JSON.stringify(body),/secret-db-id/);
});
test('public form endpoint rejects invalid id and missing D1',async()=>{
 const call=(suffix,env)=>onRequestGet({request:new Request('https://preview.test/api/v1/event-form'+suffix),env});
 assert.equal((await call('?event_id=../secret',{})).status,400);
 assert.equal((await call('?event_id=evt',{})).status,503);
});
