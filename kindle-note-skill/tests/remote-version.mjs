import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const dir=mkdtempSync(`${tmpdir()}/note-version-`);
try {
const r=spawnSync('/bin/sh',[],{encoding:'utf8',timeout:3000,env:{...process.env,RUN:dir},input:`
${readFileSync('skills/kindle-note/assets/device/touch-actions.sh','utf8')}
printf '14\nnone\nchecksum\n' > "$RUN/task-meta"
printf '14\n' > "$RUN/remote-version"
remote_update_available && exit 10
printf '15\n' > "$RUN/remote-version"
remote_update_available || exit 11
sleep() { :; }
touch_session || exit 12
[ "$touch_handled" = 0 ] || exit 13
printf 'error\n' > "$RUN/remote-version"
remote_update_available && exit 14
exit 0
`});assert.equal(r.status,0,r.stderr);console.log('Version change interrupts idle touch; unchanged/invalid versions ignored: passed');
}finally{rmSync(dir,{recursive:true});}
