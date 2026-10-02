(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let token = '', saved = '', busy = false;
  const status = text => { $('status').textContent = text; };
  const count = () => {
    const length = Array.from($('note').value).length;
    $('count').textContent = `${length} / 800`;
    $('save').disabled = busy || length > 800;
  };
  async function call(method, body) {
    const response = await fetch('/v1/note', {method, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (response.status === 401) throw new Error('管理钥匙不正确，请重新打开专属入口。');
    if (!response.ok) throw new Error('暂时无法保存或读取，请稍后重试。文字仍保留在输入框中。');
    return response.json();
  }
  async function unlock(value) {
    token = value.trim(); $('unlock').disabled = true; status('正在读取……');
    try {
      const note = await call('GET'); saved = note.text; $('note').value = saved;
      $('key').value = ''; $('login').hidden = true; $('editor').hidden = false; count(); status('已打开你的便签。');
    } catch (error) { token = ''; status(error.message); }
    finally { $('unlock').disabled = false; }
  }
  $('loginForm').addEventListener('submit', event => { event.preventDefault(); unlock($('key').value); });
  $('note').addEventListener('input', count);
  $('noteForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || Array.from($('note').value).length > 800) return;
    const text = $('note').value; busy = true; count(); $('logout').disabled = true; status('正在保存……');
    try { const note = await call('PUT',{text}); saved = note.text; status('已保存。等待 Kindle 下一次联网更新。'); }
    catch (error) { status(error.message); }
    finally { busy = false; $('logout').disabled = false; count(); }
  });
  $('logout').addEventListener('click', () => {
    if ($('note').value !== saved && !confirm('还有未保存的修改，确定退出吗？')) return;
    token = ''; saved = ''; $('note').value = ''; $('editor').hidden = true; $('login').hidden = false; status('已退出。');
  });
  window.addEventListener('beforeunload', event => { if (token && $('note').value !== saved) { event.preventDefault(); event.returnValue = ''; } });
  const fragment = new URLSearchParams(location.hash.slice(1));
  const incoming = fragment.get('key');
  if (location.hash) history.replaceState(null,'',location.pathname);
  if (incoming) unlock(incoming);
})();
