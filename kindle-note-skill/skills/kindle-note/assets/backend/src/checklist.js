(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let token='',items=[],revision=0,busy=false,dirty=false;
  const say=(text,error=false)=>{$('status').textContent=text;$('status').className=error?'error':'';};
  const setBusy=value=>{busy=value;document.querySelectorAll('button,input').forEach(el=>{el.disabled=value;});};
  async function api(method,body) {
    const r=await fetch('/v1/tasks',{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(r.status===401){$('login').hidden=false;$('editor').hidden=true;throw new Error('请用你的私密链接打开一次，即可记住登录，无需输入管理钥匙。');}
    if(r.status===409)throw new Error('其他页面已更新清单。本次修改未保存，请点“重新读取”后再操作。');
    if(!r.ok)throw new Error('未能保存或读取，请检查网络后重试。');
    return r.json();
  }
  function render() {
    $('pending').replaceChildren();$('completed').replaceChildren();
    for(const item of items){
      const li=document.createElement('li');if(item.done)li.className='done';
      const check=document.createElement('input');check.type='checkbox';check.checked=item.done;check.setAttribute('aria-label',`${item.done?'恢复':'完成'}：${item.text}`);
      check.addEventListener('change',()=>save(items.map(x=>x.id===item.id?{...x,done:check.checked}:x)));
      const text=document.createElement('span');text.className='task-text';text.textContent=item.text;
      const edit=document.createElement('button');edit.type='button';edit.className='icon';edit.textContent='编辑';edit.setAttribute('aria-label',`编辑：${item.text}`);
      edit.addEventListener('click',()=>{const value=prompt('修改事项',item.text);if(value!==null){const text=value.trim();if(!text||Array.from(text).length>120){say('事项需要 1–120 个字。',true);return;}save(items.map(x=>x.id===item.id?{...x,text}:x));}});
      const remove=document.createElement('button');remove.type='button';remove.className='icon';remove.textContent='删除';remove.setAttribute('aria-label',`删除：${item.text}`);
      remove.addEventListener('click',()=>{if(confirm(`删除“${item.text}”？此操作不能撤销。`))save(items.filter(x=>x.id!==item.id));});
      li.append(check,text,edit,remove);$(item.done?'completed':'pending').append(li);
    }
    const n=items.filter(x=>!x.done).length;$('heading').textContent=`未完成 · ${n}`;$('empty').hidden=n>0;$('completedLabel').textContent=`已完成 · ${items.length-n}`;
  }
  async function save(next){
    if(busy)return false;
    items=next;dirty=true;render();say('待上传：编辑完成后点击“上传到 Kindle”。');return true;
  }
  async function upload(){
    if(busy)return false;setBusy(true);say('正在保存……');
    try{const d=await api('PUT',{items,revision});items=d.items;revision=d.revision;dirty=false;render();say('已上传。在线桌面版将自动获取；这不代表屏幕已经更新，无需按电源键。');return true;}
    catch(e){render();say(e.message,true);return false;}finally{setBusy(false);}
  }
  async function load(){
    if(dirty&&!confirm('有未上传的修改，重新读取会丢弃这些修改。继续吗？'))return;
    if(busy)return;setBusy(true);say('正在读取……');
    try{const d=await api('GET');items=d.items;revision=d.revision;dirty=false;render();$('legacyText').textContent=d.legacy_note||'';$('legacy').hidden=!d.legacy_note;$('login').hidden=true;$('editor').hidden=false;$('key').value='';say('已读取服务器清单。');}
    catch(e){say(e.message,true);}finally{setBusy(false);}
  }
  async function login(){
    try {
      const r=await fetch('/v1/session',{method:'POST',credentials:'same-origin',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error('私密链接无效或暂时无法登录，请重试。');
      token='';await load();
    }catch(e){$('login').hidden=false;say(e.message,true);}
  }
  $('loginForm').addEventListener('submit',e=>{e.preventDefault();token=$('key').value.trim();login();});
  $('addForm').addEventListener('submit',async e=>{e.preventDefault();const text=$('newTask').value.trim();if(!text||Array.from(text).length>120){say('事项需要 1–120 个字。',true);return;}if(items.length>=50){say('最多保留 50 项，请先删除不需要的已完成事项。',true);return;}if(await save([...items,{id:crypto.randomUUID(),text,done:false}]))$('newTask').value='';});
  $('reload').addEventListener('click',load);
  $('upload').addEventListener('click',upload);
  if(typeof addEventListener==='function')addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  $('logout').addEventListener('click',async()=>{try{const r=await fetch('/v1/session',{method:'DELETE',credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error();token='';items=[];revision=0;render();$('newTask').value='';$('legacyText').textContent='';$('editor').hidden=true;$('login').hidden=false;say('已退出并清除本机登录。');}catch{say('退出失败，请检查网络后重试。',true);}});
  const key=new URLSearchParams(location.hash.slice(1)).get('key');if(location.hash)history.replaceState(null,'',location.pathname);if(key){token=key;login();}else load();
})();
