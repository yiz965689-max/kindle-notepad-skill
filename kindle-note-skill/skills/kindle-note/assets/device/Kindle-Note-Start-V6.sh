#!/bin/sh
umask 077
cp /mnt/us/kindle-note/kindle-note-worker-v6.sh /var/tmp/kindle-note-runtime-v6-worker.sh || exit 1
nohup /bin/sh /var/tmp/kindle-note-runtime-v6-worker.sh </dev/null >>/mnt/us/kindle-note/runtime-v6.log 2>&1 &
exit 0
