import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const source=readFileSync('skills/kindle-note/assets/device/manual-power-v6.sh','utf8').replaceAll('lipc-set-prop','set_prop').replaceAll('lipc-get-prop','get_prop');
for(const mode of ['manual','rtc','low-battery']) {
 const dir=mkdtempSync(`${tmpdir()}/note-power-`);
 try {
  writeFileSync(`${dir}/events`,mode==='manual'?'outOfScreenSaver\n':mode==='rtc'?'readyToSuspend\nwakeupFromSuspend\noutOfScreenSaver\n':'readyToSuspend\n');
  const r=spawnSync('/bin/sh',[],{encoding:'utf8',timeout:3000,env:{...process.env,RUN:dir,MODE:mode},input:`
${source}
stop_live() { echo STOP_LIVE; }
check_usb() { return 0; }
state=screenSaver
get_prop() { case "$2" in state) echo "$state";; flIntensity) echo 18;; battLevel) if [ "$MODE" = low-battery ]; then echo 10; else echo 80; fi;; esac; }
set_prop() { echo "SET $2 $3"; case "$2" in wakeUp) state=active;; powerButton) state=screenSaver;; esac; }
read() { command read "$@" || return 1; [ "$event" != outOfScreenSaver ] || state=active; return 0; }
draw() { echo "DRAW $*"; }
wait_state() { [ "$state" = "$1" ]; }
sync_in_place() { echo SYNC; result=ONLINE; }
exec 3< "$RUN/events"
manual_sleep
`});
  assert.equal(r.status,mode==='low-battery'?1:0,r.stdout+r.stderr);
  assert.equal((r.stdout.match(/^SYNC$/gm)||[]).length,mode==='rtc'?1:0,r.stdout);
  assert.equal((r.stdout.match(/SET powerButton 1/g)||[]).length,mode==='rtc'?1:0);
  assert.ok(!r.stdout.includes('SET preventScreenSaver 1'),'must not block physical power button');
  if(mode!=='low-battery')assert.match(r.stdout,/SET touchScreenSaverTimeout 1/);
  if(mode!=='low-battery')assert.match(r.stdout,/SET flIntensity 18/);
  if(mode==='rtc')assert.match(r.stdout,/SET rtcWakeup 300/);
  console.log(`${mode}: passed`);
 }finally{rmSync(dir,{recursive:true});}
}
