import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle,locationFrom,offsetAt} from '../src/worker.js';
const device='d'.repeat(40),admin='a'.repeat(40);
const cq={city:'Chongqing',country:'CN',latitude:'29.56',longitude:'106.55',timezone:'Asia/Shanghai'};
const london={city:'London',country:'GB',latitude:'51.5',longitude:'-0.12',timezone:'Europe/London'};
const now=Date.UTC(2026,8,13,15,0);
function setup() {
  const data=new Map();
  return {DEVICE_TOKEN:device,ADMIN_TOKEN:admin,STORE:{
    async get(k){return data.has(k)?JSON.parse(data.get(k)):null;},
    async put(k,v){data.set(k,v);},
  }};
}
function req(cf=cq,token=device,path='/v1/state',options={}) {
  const r=new Request(`https://example.test${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});
  Object.defineProperty(r,'cf',{value:cf}); return r;
}
const fetcher=async()=>Response.json({current:{temperature_2m:23.4,weather_code:3,time:'2026-09-13T23:00'},daily:{temperature_2m_max:[28],temperature_2m_min:[20]}});
test('automatic Chongqing -> London switch changes weather coordinates and clock offset',async()=>{
  const env=setup(); const calls=[];
  const f=async u=>{calls.push(new URL(u));return fetcher();};
  const a=await (await handle(req(),env,{fetcher:f,now})).json();
  const b=await (await handle(req(london),env,{fetcher:f,now})).json();
  assert.equal(a.location.city,'Chongqing');assert.equal(a.utc_offset_seconds,28800);
  assert.equal(b.location.city,'London');assert.equal(b.utc_offset_seconds,3600);
  assert.equal(calls[1].searchParams.get('latitude'),'51.5');
});
test('London DST offset is seasonal',()=>{
  assert.equal(offsetAt('Europe/London',Date.UTC(2026,0,1)),0);
  assert.equal(offsetAt('Europe/London',now),3600);
});
test('missing location uses last known; spoofed headers cannot override it',async()=>{
  const env=setup();await handle(req(),env,{fetcher,now});
  const state=await (await handle(req(null,device,'/v1/state',{headers:{'X-City':'London'}}),env,{fetcher,now})).json();
  assert.equal(state.location.city,'Chongqing');assert.equal(state.location.source,'last-known');
  assert.equal((await handle(req(null),setup(),{fetcher,now})).status,503);
});
test('weather failure uses same-city stale data, never another city',async()=>{
  const env=setup();await handle(req(),env,{fetcher,now});
  const offline=async()=>{throw new Error('offline');};
  const a=await (await handle(req(),env,{fetcher:offline,now:now+1800000})).json();
  assert.equal(a.weather.stale,true);
  const b=await (await handle(req(london),env,{fetcher:offline,now:now+1800000})).json();
  assert.equal(b.location.city,'London');assert.equal(b.weather,null);
});
test('ETag saves unchanged payload while providing fresh server time',async()=>{
  const env=setup();const a=await handle(req(),env,{fetcher,now});
  const b=await handle(req(cq,device,'/v1/state',{headers:{'If-None-Match':a.headers.get('ETag')}}),env,{fetcher,now:now+1000});
  assert.equal(b.status,304);assert.equal(b.headers.get('X-Server-Time'),String(now/1000+1));
});
test('device cannot write notes; admin can store Unicode as inert text',async()=>{
  const env=setup();const options={method:'PUT',body:JSON.stringify({text:'重庆\n<script>alert(1)</script> $(id)'})};
  assert.equal((await handle(req(cq,device,'/v1/note',options),env,{now})).status,401);
  assert.equal((await handle(req(cq,admin,'/v1/note',options),env,{now})).status,200);
  const state=await (await handle(req(),env,{fetcher,now})).json();
  assert.equal(state.note.text,'重庆\n<script>alert(1)</script> $(id)');
});
test('oversized notes and invalid locations fail closed',async()=>{
  assert.equal(locationFrom({...cq,latitude:''}),null);
  assert.equal(locationFrom({...cq,timezone:'Not/AZone'}),null);
  const response=await handle(req(cq,admin,'/v1/note',{method:'PUT',body:JSON.stringify({text:'x'.repeat(5000)})}),setup(),{now});
  assert.equal(response.status,400);
  assert.equal((await handle(req(cq,'bad'),setup(),{now})).status,401);
});
