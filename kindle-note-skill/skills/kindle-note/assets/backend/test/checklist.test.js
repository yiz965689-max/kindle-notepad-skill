import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('checklist UI adds, completes, restores and removes inert text',async()=>{
  const nodes=new Map(),all=[];
  function element(){const el={value:'',textContent:'',hidden:false,children:[],listeners:{},addEventListener(t,f){this.listeners[t]=f;},setAttribute(){},replaceChildren(){this.children=[];},append(...c){this.children.push(...c);}};all.push(el);return el;}
  const byId=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  let data={items:[],revision:0,legacy_note:'原文字'},counter=0;
  const ctx={document:{getElementById:byId,createElement:element,querySelectorAll:()=>all},URLSearchParams,AbortSignal,
    location:{hash:'#key=admin',pathname:'/'},history:{replaceState(){}},crypto:{randomUUID:()=>`id-${++counter}`},confirm:()=>true,prompt:()=>null,
    fetch:async(url,options)=>{if(url==='/v1/session'){assert.equal(options.method,'POST');return new Response(null,{status:204});}assert.equal(url,'/v1/tasks');assert.equal(options.headers.Authorization,undefined);if(options.method==='PUT'){const next=JSON.parse(options.body);assert.equal(next.revision,data.revision);data={...next,revision:data.revision+1};}return Response.json(data);}};
  vm.runInNewContext(readFileSync(new URL('../src/checklist.js',import.meta.url),'utf8'),ctx);
  const flush=()=>new Promise(resolve=>setTimeout(resolve,5));await flush();
  assert.equal(byId('legacyText').textContent,'原文字');
  byId('newTask').value='<script>中文</script>';
  await byId('addForm').listeners.submit({preventDefault(){}});
  assert.equal(data.items.length,0,'draft must not be uploaded automatically');
  await byId('upload').listeners.click();
  assert.equal(data.items.length,1);assert.equal(byId('pending').children[0].children[1].textContent,'<script>中文</script>');
  let checkbox=byId('pending').children[0].children[0];checkbox.checked=true;await checkbox.listeners.change();
  await byId('upload').listeners.click();
  assert.equal(byId('completed').children.length,1);assert.equal(data.items[0].done,true);
  checkbox=byId('completed').children[0].children[0];checkbox.checked=false;await checkbox.listeners.change();await byId('upload').listeners.click();assert.equal(data.items[0].done,false);
  byId('pending').children[0].children[3].listeners.click();await flush();await byId('upload').listeners.click();assert.equal(data.items.length,0);
});
