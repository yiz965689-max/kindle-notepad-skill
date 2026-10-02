import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, validSession} from '../src/server.js';

test('persistent browser login is private, scoped, CSRF protected and clearable', async () => {
  const admin='a'.repeat(64), device='d'.repeat(64), data=new Map();
  const server=createServer({ADMIN_TOKEN:admin,DEVICE_TOKEN:device,STORE:{get:async k=>data.has(k)?JSON.parse(data.get(k)):null,put:async(k,v)=>data.set(k,v)}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`, origin='https://kindle.example.com';
  try {
    const send=(path,options={})=>fetch(base+path,options);
    assert.equal((await send('/v1/tasks')).status,401);
    assert.equal((await send('/v1/session',{method:'POST',headers:{Authorization:`Bearer ${device}`}})).status,401);
    assert.equal((await send('/v1/session',{method:'POST',headers:{Authorization:`Bearer ${admin}`,Origin:'https://evil.example'}})).status,403);
    const login=await send('/v1/session',{method:'POST',headers:{Authorization:`Bearer ${admin}`,Origin:origin}});
    assert.equal(login.status,204);
    const set=login.headers.get('set-cookie'),cookie=set.split(';')[0];
    for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=15552000'])assert.ok(set.includes(flag));
    assert.ok(!set.includes(admin));assert.equal(validSession(cookie,admin),true);
    assert.equal(validSession(cookie,device),false);
    assert.equal(validSession(cookie.replace(/.$/,'z'),admin),false);
    assert.equal(validSession(cookie.replace(/=\d+/, '=1000000000000'),admin),false);
    assert.equal((await send('/v1/tasks',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await send('/v1/state',{headers:{Cookie:cookie}})).status,401);
    const body=JSON.stringify({items:[{id:'one',text:'测试',done:false}],revision:0});
    for(const extra of [{},{Origin:'https://evil.example'}])assert.equal((await send('/v1/tasks',{method:'PUT',headers:{Cookie:cookie,...extra},body})).status,403);
    assert.equal((await send('/v1/tasks',{method:'PUT',headers:{Cookie:cookie,Origin:origin},body})).status,200);
    const logout=await send('/v1/session',{method:'DELETE',headers:{Cookie:cookie,Origin:origin}});
    assert.equal(logout.status,204);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
  } finally {await new Promise(r=>server.close(r));}
});
