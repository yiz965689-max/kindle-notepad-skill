import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/worker.js';
import {screenSVG} from '../src/screen.js';
const admin='a'.repeat(40),device='d'.repeat(40);
const request=(method,body,token=admin)=>new Request('https://example.test/v1/tasks',{method,headers:{Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
test('tasks create, complete, restore; old note preserved and device cannot write',async()=>{
  const db=new Map([['note',JSON.stringify({text:'原便签'})]]);
  const env={ADMIN_TOKEN:admin,DEVICE_TOKEN:device,STORE:{async get(k){return db.has(k)?JSON.parse(db.get(k)):null;},async put(k,v){db.set(k,v);}}};
  const start=await(await handle(request('GET'),env)).json();assert.equal(start.legacy_note,'原便签');
  const item={id:'first',text:'记得带护照',done:false};
  assert.equal((await handle(request('PUT',{items:[item],revision:0},device),env)).status,401);
  const created=await(await handle(request('PUT',{items:[item],revision:0}),env)).json();assert.equal(created.revision,1);
  assert.equal((await handle(request('PUT',{items:[],revision:0}),env)).status,409);
  const done=await(await handle(request('PUT',{items:[{...item,done:true}],revision:1}),env)).json();assert.equal(done.items[0].done,true);
  const restored=await(await handle(request('PUT',{items:[item],revision:2}),env)).json();assert.equal(restored.items[0].done,false);
  assert.equal((await env.STORE.get('note')).text,'原便签');
  assert.equal((await handle(request('PUT',{items:[item,item],revision:3}),env)).status,400);
  assert.equal((await handle(request('PUT',{items:[{...item,text:'x'.repeat(121)}],revision:3}),env)).status,400);
});
test('Kindle renders only incomplete tasks as vertical circles',()=>{
  const svg=screenSVG({location:{city:'重庆'},note:{text:'legacy'},tasks:{items:[{text:'要显示',done:false},{text:'不应显示',done:true}]}});
  assert.ok(svg.includes('要显示'));assert.ok(!svg.includes('不应显示'));assert.ok(svg.includes('<circle'));assert.ok(!svg.includes('legacy'));
});
