const enc = new TextEncoder();
const DAY = 86400;
const json = (value, status = 200, headers = {}) => Response.json(value, {
  status, headers: {'Cache-Control':'no-store', ...headers},
});
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const coord = (v, max) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v) && Math.abs(+v) <= max;
const publicTasks = tasks => {
  if (!tasks) return tasks;
  const {device_actions, ...visible} = tasks;
  return visible;
};
export function locationFrom(cf) {
  if (!cf || !coord(cf.latitude, 90) || !coord(cf.longitude, 180) || !cf.city || !cf.timezone) return null;
  try { new Intl.DateTimeFormat('en', {timeZone:cf.timezone}).format(); } catch { return null; }
  return {city:clean(cf.city, 80), country:clean(cf.country, 2),
    latitude:Math.round(+cf.latitude * 100) / 100,
    longitude:Math.round(+cf.longitude * 100) / 100, timezone:cf.timezone};
}
export function offsetAt(timezone, now) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
  return (Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second) - Math.floor(now / 1000)*1000) / 1000;
}
export function condition(code) {
  if (code === 0) return 'Clear';
  if ([1,2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if ([45,48].includes(code)) return 'Fog';
  if ([51,53,55,56,57].includes(code)) return 'Drizzle';
  if ([61,63,65,66,67,80,81,82].includes(code)) return 'Rain';
  if ([71,73,75,77,85,86].includes(code)) return 'Snow';
  if ([95,96,99].includes(code)) return 'Thunderstorm';
  return 'Unknown';
}
async function digest(s) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function authorized(request, token) {
  if (!token || token.length < 32) return false;
  const supplied = request.headers.get('Authorization') || '';
  return await digest(supplied) === await digest(`Bearer ${token}`);
}
async function smallJSON(request, limit = 4096) {
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader(); let size = 0; const chunks = [];
  for (;;) {
    const {value,done} = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('size'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function weatherFor(location, store, fetcher, now) {
  const key = `weather:${location.latitude}:${location.longitude}:${location.timezone}`;
  const cached = await store.get(key, 'json');
  if (cached && now - cached.fetched_at < 900) return {...cached, stale:false};
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({latitude:location.latitude,longitude:location.longitude,
      current:'temperature_2m,weather_code', daily:'temperature_2m_max,temperature_2m_min',
      timezone:location.timezone,forecast_days:'1'}).toString();
    const response = await fetcher(url, {signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('upstream');
    const data = await response.json();
    const nums = [data.current?.temperature_2m,data.current?.weather_code,
      data.daily?.temperature_2m_max?.[0],data.daily?.temperature_2m_min?.[0]];
    if (!nums.every(x=>typeof x === 'number' && Number.isFinite(x))) throw new Error('invalid');
    const result = {temperature:Math.round(nums[0]),condition:condition(nums[1]),
      high:Math.round(nums[2]),low:Math.round(nums[3]),observed_at:data.current.time,
      fetched_at:now,source:'Open-Meteo'};
    await store.put(key, JSON.stringify(result), {expirationTtl:DAY});
    return {...result,stale:false};
  } catch {
    if (cached && now-cached.fetched_at < DAY) return {...cached,stale:true};
    return null;
  }
}
export async function handle(request, env, {fetcher=fetch, now=Date.now()}={}) {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return json({service:'kindle-note',version:1});
  if (!env.STORE || !env.DEVICE_TOKEN || !env.ADMIN_TOKEN || env.DEVICE_TOKEN === env.ADMIN_TOKEN)
    return json({error:'service_not_configured'},503);
  if (url.pathname === '/v1/task-version') {
    if (!await authorized(request,env.DEVICE_TOKEN)) return json({error:'unauthorized'},401);
    if (request.method !== 'GET') return json({error:'method'},405);
    const tasks = await env.STORE.get('tasks','json');
    return new Response(String(tasks?.revision || 0),{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  }
  if (url.pathname === '/v1/task-action') {
    if (!await authorized(request,env.DEVICE_TOKEN)) return json({error:'unauthorized'},401);
    if (request.method !== 'POST') return json({error:'method'},405);
    let body;
    try { body = await smallJSON(request); } catch { return json({error:'invalid_body'},400); }
    if (!body || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.id || '') || typeof body.id !== 'string'
      || typeof body.operation_id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.operation_id)
      || typeof body.done !== 'boolean' || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0)
      return json({error:'invalid_action'},400);
    const current = await env.STORE.get('tasks','json') || {items:[],revision:0,updated_at:0};
    const actions = current.device_actions || [];
    const prior = actions.find(x=>x.operation_id === body.operation_id);
    if (prior) {
      if (prior.id !== body.id || prior.done !== body.done || prior.expected_revision !== body.expected_revision)
        return json({error:'operation_id_reused'},409);
      return json({ok:true,duplicate:true,revision:current.revision});
    }
    if (body.expected_revision !== current.revision) return json({error:'conflict_reload',revision:current.revision},409);
    const item = current.items.find(x=>x.id === body.id);
    if (!item) return json({error:'task_not_found'},404);
    const result = {...current,items:current.items.map(x=>x.id===body.id?{...x,done:body.done}:x),
      revision:current.revision+1,updated_at:Math.floor(now/1000),
      device_actions:[...actions,{id:body.id,done:body.done,expected_revision:body.expected_revision,operation_id:body.operation_id}].slice(-128)};
    // Node adapter serializes all task writes; receipt and change share one atomic file write.
    await env.STORE.put('tasks',JSON.stringify(result));
    return json({ok:true,duplicate:false,revision:result.revision});
  }
  if (url.pathname === '/v1/tasks') {
    if (!await authorized(request,env.ADMIN_TOKEN)) return json({error:'unauthorized'},401);
    const current = await env.STORE.get('tasks','json') || {items:[],revision:0,updated_at:0};
    if (request.method === 'GET') return json({...publicTasks(current),legacy_note:(await env.STORE.get('note','json'))?.text || ''});
    if (request.method !== 'PUT') return json({error:'method'},405);
    let body;
    try { body = await smallJSON(request,32768); } catch { return json({error:'invalid_body'},400); }
    if (!body || !Array.isArray(body.items) || body.items.length > 50 || !Number.isSafeInteger(body.revision)) return json({error:'invalid_tasks'},400);
    if (body.revision !== current.revision) return json({error:'conflict_reload'},409);
    const ids = new Set(), items = [];
    for (const item of body.items) {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)
        || typeof item.text !== 'string' || !item.text.trim() || Array.from(item.text).length > 120
        || /[\u0000-\u001f\u007f]/.test(item.text) || typeof item.done !== 'boolean') return json({error:'invalid_task'},400);
      ids.add(item.id); items.push({id:item.id,text:item.text.trim(),done:item.done});
    }
    const result = {items,revision:current.revision+1,updated_at:Math.floor(now/1000),
      ...(current.device_actions ? {device_actions:current.device_actions} : {})};
    await env.STORE.put('tasks',JSON.stringify(result));
    return json(publicTasks(result));
  }
  if (url.pathname === '/v1/note') {
    if (!await authorized(request,env.ADMIN_TOKEN)) return json({error:'unauthorized'},401);
    if (request.method === 'GET') return json(await env.STORE.get('note','json') || {text:'',updated_at:0});
    if (request.method !== 'PUT') return json({error:'method'},405);
    let body;
    try { body = await smallJSON(request); } catch { return json({error:'invalid_body'},400); }
    if (typeof body.text !== 'string' || Array.from(body.text).length > 800 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text))
      return json({error:'note_must_be_text_up_to_800_characters'},400);
    const note = {text:body.text.replace(/\r\n?/g,'\n'),updated_at:Math.floor(now/1000)};
    await env.STORE.put('note',JSON.stringify(note));
    return json(note);
  }
  if (url.pathname !== '/v1/state') return json({error:'not_found'},404);
  if (!await authorized(request,env.DEVICE_TOKEN)) return json({error:'unauthorized'},401);
  if (request.method !== 'GET') return json({error:'method'},405);
  const seconds = Math.floor(now/1000);
  const detected = locationFrom(request.cf); // Never trust caller-supplied location headers.
  const previous = await env.STORE.get('last-location','json');
  const location = detected || previous?.location;
  if (!location) return json({error:'location_unavailable',keep_cached:true},503);
  if (detected && (!previous || JSON.stringify(previous.location)!==JSON.stringify(detected)))
    await env.STORE.put('last-location',JSON.stringify({location:detected,detected_at:seconds}));
  const [weather,note,tasks] = await Promise.all([
    weatherFor(location,env.STORE,fetcher,seconds), env.STORE.get('note','json'), env.STORE.get('tasks','json'),
  ]);
  const state = {schema:1,location:{...location,source:detected?'network':'last-known'},
    utc_offset_seconds:offsetAt(location.timezone,now),weather,
    note:note || {text:'',updated_at:0},tasks:publicTasks(tasks),clock_interval_seconds:300,network_interval_seconds:300};
  const body = JSON.stringify(state);
  const etag = `"${await digest(body)}"`;
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-cache',
    'ETag':etag,'X-Server-Time':String(seconds),'Vary':'Authorization'};
  if (request.headers.get('If-None-Match') === etag) return new Response(null,{status:304,headers});
  return new Response(body,{headers});
}
export default {async fetch(request,env) {
  try { return await handle(request,env); } catch { return json({error:'temporary_failure',keep_cached:true},503); }
}};
