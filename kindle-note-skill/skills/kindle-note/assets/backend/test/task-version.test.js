import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../src/worker.js';
test('version probe is device-only and does not fetch weather or expose tasks',async()=>{
 const env={DEVICE_TOKEN:'d'.repeat(64),ADMIN_TOKEN:'a'.repeat(64),STORE:{get:async()=>({revision:14,items:[{text:'private'}]})}};
 for(const [token,status] of [[env.DEVICE_TOKEN,200],[env.ADMIN_TOKEN,401],['',401]]) {
  const r=await handle(new Request('https://example.com/v1/task-version',{headers:{Authorization:`Bearer ${token}`}}),env,{fetcher:()=>{throw new Error('No weather allowed');}});
  assert.equal(r.status,status);
  if(status===200){assert.equal(await r.text(),'14');assert.equal(r.headers.get('cache-control'),'no-store');}
 }
});
