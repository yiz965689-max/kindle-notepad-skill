import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {FileStore, validToken, makeLocator, createServer} from '../src/server.js';

test('file store survives recreation and handles missing keys', async () => {
  const dir = await mkdtemp(`${tmpdir()}/kindle-store-`);
  try {
    const store = new FileStore(dir);
    assert.equal(await store.get('missing'), null);
    await store.put('../note', JSON.stringify({text:'重庆 London'}));
    assert.deepEqual(await new FileStore(dir).get('../note'), {text:'重庆 London'});
  } finally { await rm(dir, {recursive:true}); }
});
test('locator validates IP and caches successful geolocation', async () => {
  let calls = 0;
  const locate = makeLocator(async () => { calls++; return Response.json({success:true, city:'London',country_code:'GB',latitude:51.5,longitude:-0.12,timezone:{id:'Europe/London'}}); });
  assert.equal(await locate('8.8.8.8/../../etc'), null);
  assert.equal((await locate('8.8.8.8')).city, 'London');
  await locate('8.8.8.8'); assert.equal(calls, 1);
  assert.equal(validToken('Bearer invalid', 'x'.repeat(40)), false);
});
test('Chongqing districts display 重庆 without changing weather coordinates', async () => {
  const locate = makeLocator(async () => Response.json({success:true,city:'Yuzhong',region:'Chongqing',country_code:'CN',latitude:29.56,longitude:106.57,timezone:{id:'Asia/Shanghai'}}));
  const location = await locate('8.8.8.8');
  assert.equal(location.city,'重庆');
  assert.equal(location.latitude,29.56);
  assert.equal(location.longitude,106.57);
});
test('HTTP adapter authenticates before looking up IP; notes persist', async () => {
  const dir = await mkdtemp(`${tmpdir()}/kindle-http-`);
  const device = 'd'.repeat(40), admin = 'a'.repeat(40); let lookups = 0;
  const server = createServer({DEVICE_TOKEN:device, ADMIN_TOKEN:admin, STORE:new FileStore(dir)}, {locate:async () => {lookups++; return null;}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const page = await fetch(`${base}/`);
    assert.equal(page.status,200);
    assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    const html = await page.text();
    assert.ok(html.includes('管理钥匙'));
    assert.ok(!html.includes(admin));
    assert.equal((await fetch(`${base}/editor.js`)).status,200);
    assert.equal((await fetch(`${base}/v1/state`)).status, 401);
    assert.equal(lookups, 0);
    const response = await fetch(`${base}/v1/note`, {method:'PUT',headers:{Authorization:`Bearer ${admin}`},body:JSON.stringify({text:'测试'})});
    assert.equal(response.status, 200);
    assert.equal((await (await fetch(`${base}/v1/note`, {headers:{Authorization:`Bearer ${admin}`}})).json()).text, '测试');
    assert.equal((await fetch(`${base}/v1/note`, {method:'PUT',headers:{Authorization:`Bearer ${device}`},body:'{}'})).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, {recursive:true}); }
});
