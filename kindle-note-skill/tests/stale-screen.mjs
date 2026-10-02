import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=mkdtempSync(`${tmpdir()}/note-stale-`);
try {
 const source=readFileSync('skills/kindle-note/assets/device/touch-actions.sh','utf8');
 const r=spawnSync('/bin/sh',[],{encoding:'utf8',env:{...process.env,DATA:dir,RUN:dir},timeout:3000,input:`
${source}
printf image > "$RUN/base.png"
printf 'X-Task-Revision: 11\r\nX-Task-Hits: task-one,32,471,132,551\r\n' > "$RUN/headers"
save_task_meta || exit 10
printf '{"id":"task-one","done":true}' > "$DATA/pending-action.json"
curl() { printf '{"ok":true}' > "$RUN/action-response"; printf 200; }
flush_action || exit 11
load_task_meta && exit 12
draw() { echo "$1"; }
sleep() { :; }
touch_session || exit 13
[ "$touch_prompt_shown" = stale ] || exit 14
[ -e "$DATA/screen-stale" ] || exit 15
printf 'X-Task-Revision: 12\r\nX-Task-Hits: none\r\n' > "$RUN/headers"
save_task_meta || exit 16
load_task_meta || exit 17
[ "$revision" = 12 ] || exit 18
[ ! -e "$DATA/screen-stale" ] || exit 19
`});
 assert.equal(r.status,0,r.stderr+r.stdout);
 assert.match(r.stdout,/UPDATING - PLEASE WAIT/);
 console.log('Confirmed action + failed image: stale taps blocked until fresh metadata arrives: passed');
} finally {rmSync(dir,{recursive:true});}
