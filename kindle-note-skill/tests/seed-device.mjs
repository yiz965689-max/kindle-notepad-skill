import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'kindle-seed-test-'));
const previousFetch=globalThis.fetch,previousArgs=process.argv;
try {
 await mkdir(path.join(root,'backend'));
 await mkdir(path.join(root,'device-stage/kindle-note'),{recursive:true});
 await writeFile(path.join(root,'backend/secrets.json'),JSON.stringify({DEVICE_TOKEN:'d'.repeat(64)}));
 await writeFile(path.join(root,'device-stage/kindle-note/base-url'),'https://kindle.example.org\n');
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://kindle.example.org/v1/screen');
  assert.equal(options.headers.Authorization,`Bearer ${'d'.repeat(64)}`);
  assert.equal(options.redirect,'error');
  return new Response(Buffer.from('89504e470d0a1a0a','hex'),{headers:{'X-Task-Revision':'7','X-Task-Hits':'none','X-UTC-Offset':'3600'}});
 };
 process.argv=['node','seed-device.mjs',root];
 await import('../skills/kindle-note/scripts/seed-device.mjs');
 const meta=await readFile(path.join(root,'device-stage/kindle-note/task-meta'),'utf8');
 assert.match(meta,/^7\nnone\n\d+ 8\n$/);
 assert.equal(await readFile(path.join(root,'device-stage/kindle-note/utc-offset'),'utf8'),'3600\n');
 console.log('Seed staging: authenticated read, checksum metadata and timezone passed (mock response, no network).');
}finally{globalThis.fetch=previousFetch;process.argv=previousArgs;await rm(root,{recursive:true});}
