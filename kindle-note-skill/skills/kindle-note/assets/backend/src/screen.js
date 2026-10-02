import {Resvg} from '@resvg/resvg-js';
import {fileURLToPath} from 'node:url';
const font = fileURLToPath(new URL('../fonts/NotoSansCJKsc-Regular.otf', import.meta.url));
export const escapeXML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function wrap(text, maxUnits = 18, maxLines = 11) {
  const lines = []; let line = '', units = 0;
  for (const ch of String(text).replace(/\r/g,'')) {
    const width = ch.charCodeAt(0) > 127 ? 1 : 0.62;
    if (ch === '\n' || units + width > maxUnits) {
      lines.push(line); line = ''; units = 0;
      if (lines.length === maxLines) { lines[maxLines-1] = lines[maxLines-1].slice(0,-1) + '…'; return lines; }
      if (ch === '\n') continue;
    }
    line += ch; units += width;
  }
  lines.push(line); return lines;
}
export function taskLayout(state) {
  let y=525;
  const visible=[];
  for(const item of state.tasks?.items.filter(x=>!x.done) || []) {
    const rows=wrap(item.text,20,2),height=rows.length*58+60;
    if(y+height>1210)break;
    visible.push({item,rows,y,separatorY:y+(rows.length-1)*58+36,hit:[32,y-54,132,y+26]});
    y+=height;
  }
  return visible;
}
export function taskHitHeader(state) {
  return taskLayout(state).map(({item,hit})=>[item.id,...hit].join(',')).join(';') || 'none';
}
export function screenSVG(state) {
  const text = (x,y,value,size=28) => `<text x="${x}" y="${y}" font-size="${size}">${escapeXML(value)}</text>`;
  const w = state.weather;
  const note = state.note?.text || 'Make room\nfor what matters.';
  const size = [...note].length > 150 ? 42 : 58;
  const lines = wrap(note, 920 / size, Math.floor(740 / (size * 1.45)));
  const city = state.location.city.length > 19 ? state.location.city.slice(0,18)+'…' : state.location.city;
  let body = lines.map((line,i)=>text(64,550+i*size*1.45,line,size)).join('');
  let heading = 'A NOTE TO SELF';
  if (state.tasks) {
    const pending = state.tasks.items.filter(item=>!item.done);
    heading = `提醒事项 · ${pending.length} 项未完成`;
    body = ''; let shown = 0;
    const layout=taskLayout(state);
    for (const {rows,y,separatorY} of layout) {
      body += `<circle cx="82" cy="${y-14}" r="15" fill="none" stroke="black" stroke-width="2"/>`;
      body += rows.map((row,i)=>text(122,y+i*58,row,42)).join('');
      shown++;
      if(shown<layout.length)body+=`<path d="M122 ${separatorY}H562" fill="none" stroke="black" stroke-width="2"/>`;
    }
    if (!pending.length) body = text(64,555,state.tasks.items.length?'全部完成，享受今天。':'在手机上添加第一条事项。',40);
    if (shown < pending.length) body += text(64,1220,`另有 ${pending.length-shown} 项，请在手机查看`,24);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1072" height="1448" viewBox="0 0 1072 1448">
  <rect width="1072" height="1448" fill="white"/>
  <g fill="black" font-family="Noto Sans CJK SC">
  ${text(64,84,'K I N D L E   N O T E',24)}
  ${text(750,205,w ? `${w.temperature}°` : '--°',76)}
  ${text(752,251,w?.condition || 'Unavailable',24)}
  ${text(752,294,city,23)}
  ${text(752,332,w ? `H ${w.high}° / L ${w.low}°` : '',22)}
  <path d="M64 366H1008 M64 1310H1008" stroke="black" stroke-width="2"/>
  ${text(64,441,heading,24)}
  ${body}
  ${text(64,1272,w?.stale ? 'Weather cached · waiting for network' : 'Weather: Open-Meteo · location: network',20)}
  </g></svg>`;
}
export function renderScreen(state) {
  return new Resvg(screenSVG(state), {font:{fontFiles:[font],loadSystemFonts:false,defaultFontFamily:'Noto Sans CJK SC'}}).render().asPng();
}
