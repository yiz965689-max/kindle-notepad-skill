import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
test('screen metadata and serialized phone/device writes share the same task revision',async()=>{
 const data=new Map([['tasks',JSON.stringify({items:[{id:'one',text:'Test',done:false}],revision:1,updated_at:0})]]);
 const env={ADMIN_TOKEN:'a'.repeat(64),DEVICE_TOKEN:'d'.repeat(64),STORE:{get:async k=>data.has(k)?JSON.parse(data.get(k)):null,put:async(k,v)=>{await new Promise(r=>setTimeout(r,5));data.set(k,v);}}};
 const server=createServer(env,{locate:async()=>({city:'London',country:'GB',latitude:51.5,longitude:-0.1,timezone:'Europe/London'}),fetcher:async()=>new Response('',{status:503})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const req=(path,token,method='GET',body)=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
 try {
  const screen=await req('/v1/screen',env.DEVICE_TOKEN);
  assert.equal(screen.status,200);assert.equal(screen.headers.get('x-task-revision'),'1');assert.equal(screen.headers.get('x-task-hits'),'one,32,471,132,551');
  const responses=await Promise.all([
   req('/v1/task-action',env.DEVICE_TOKEN,'POST',{id:'one',done:true,expected_revision:1,operation_id:'operation-00000001'}),
   req('/v1/tasks',env.ADMIN_TOKEN,'PUT',{items:[{id:'one',text:'Phone edit',done:false}],revision:1}),
  ]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(JSON.parse(data.get('tasks')).revision,2);
 } finally {await new Promise(r=>server.close(r));}
});
