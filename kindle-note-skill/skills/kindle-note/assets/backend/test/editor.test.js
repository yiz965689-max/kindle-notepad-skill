import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('editor removes fragment, loads Unicode, and saves only via admin API', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
    return nodes.get(id);
  };
  let replaced = false; const calls = [];
  const ctx = {document:{getElementById:node},window:{addEventListener(){}},location:{hash:'#key=private-key',pathname:'/'},
    history:{replaceState(){replaced=true;}},URLSearchParams,AbortSignal,confirm:()=>true,
    fetch:async (url,options) => {calls.push({url,options});return Response.json({text:options.method==='GET'?'你好':JSON.parse(options.body).text});}};
  vm.runInNewContext(readFileSync(new URL('../src/editor.js',import.meta.url),'utf8'),ctx);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(replaced,true); assert.equal(node('note').value,'你好');
  assert.equal(node('editor').hidden,false);
  node('note').value='重庆\n今天专注一件事';
  await node('noteForm').listeners.submit({preventDefault(){}});
  assert.equal(calls.at(-1).url,'/v1/note');
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer private-key');
  assert.equal(JSON.parse(calls.at(-1).options.body).text,node('note').value);
  assert.ok(node('status').textContent.includes('已保存'));
  const before=calls.length; node('note').value='中'.repeat(801);
  await node('noteForm').listeners.submit({preventDefault(){}});
  assert.equal(calls.length,before);
});
