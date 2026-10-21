// Event registration field validation shared by published form and write API.
// All values are bound to D1 statements; no raw HTML, SQL, or scripts accepted.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const KINDS=new Set(['text','textarea','number','select','multiselect','date','phone','email','checkbox','radio']);
export function validEventId(value){return typeof value==='string'&&ID.test(value)}
function choices(json){
  let options;
  try {options=JSON.parse(json||'[]');} catch {return null}
  if(!Array.isArray(options)||options.length>100 || options.some(x=>typeof x!=='string'||x.length>200))return null;
  return options;
}
export function publicField(field){
 const options=choices(field.options_json);
 if(!ID.test(String(field.field_key||'')) || !KINDS.has(field.field_type) || !options ||
    typeof field.label!=='string'||field.label.length>150) return null;
 return {key:field.field_key,label:field.label,type:field.field_type,
   required:field.required===1||field.required===true,options};
}
function checkValue(field,value){
 const type=field.type,opts=field.options;
 if(type==='multiselect'){
   if(!Array.isArray(value)||value.length>30||new Set(value).size!==value.length||
     value.some(x=>typeof x!=='string'||!opts.includes(x)))return null;
   return JSON.stringify(value);
 }
 if(type==='checkbox'){
   if(typeof value!=='boolean')return null;
   return value?'true':'false';
 }
 if(typeof value!=='string'||value.length>4000||/[\u0000-\u0008\u000B-\u001F]/.test(value))return null;
 const text=value.trim();
 if(type==='text'&&text.length>500)return null;
 if(type==='textarea'&&text.length>4000)return null;
 if(type==='phone'&&text!==''&&!/^\+?[0-9()\- ]{6,25}$/.test(text))return null;
 if(type==='email'&&text!==''&&!/^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,30}$/.test(text))return null;
 if(type==='date'&&text!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||
   !Number.isFinite(Date.parse(text+'T00:00:00Z')) ||
   new Date(Date.parse(text+'T00:00:00Z')).toISOString().slice(0,10)!==text))return null;
 if(type==='number'&&text!==''&&(!/^-?\d{1,12}(?:\.\d{1,4})?$/.test(text)||!Number.isFinite(Number(text))))return null;
 if(['select','radio'].includes(type)&&text!==''&&!opts.includes(text))return null;
 return text;
}
export function normalizeAnswers(fields,answers){
 if(!Array.isArray(fields)||fields.length>64)return {error:'event_form_configuration_unavailable'};
 if(!answers||typeof answers!=='object'||Array.isArray(answers))return {error:'invalid_event_answers'};
 const keys=Object.keys(answers);
 if(keys.length>64)return {error:'invalid_event_answers'};
 const byKey=new Map();
 for(const item of fields){
   const def=publicField(item);
   if(!def||byKey.has(def.key)||typeof item.id!=='string')return {error:'event_form_configuration_unavailable'};
   byKey.set(def.key,{...def,id:item.id});
 }
 for(const key of keys)if(!byKey.has(key))return {error:'unknown_event_field',field:key};
 const normalized=[];
 for(const field of byKey.values()){
   const present=Object.hasOwn(answers,field.key);
   const raw=present?answers[field.key]:undefined;
   if(!present || raw===undefined || raw===null || raw===''){
     if(field.required)return {error:'required_event_field',field:field.key};
     continue;
   }
   const value=checkValue(field,raw);
   if(value===null)return {error:'invalid_event_field',field:field.key};
   if(field.required&&(value===''||value==='false'||value==='[]'))
     return {error:'required_event_field',field:field.key};
   normalized.push({id:field.id,key:field.key,value});
 }
 return {values:normalized};
}
