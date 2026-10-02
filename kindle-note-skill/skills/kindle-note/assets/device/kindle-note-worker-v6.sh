#!/bin/sh
# Runtime v5: awake desktop mode, independent minute clock, renewed touch.
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH LC_ALL=C
umask 077
DATA=/mnt/us/kindle-note
NOTE_ORIGIN=$(cat "$DATA/base-url" 2>/dev/null)
case "$NOTE_ORIGIN" in https://*) :;; *) printf 'Missing HTTPS base-url\n'; exit 1;; esac
case "$NOTE_ORIGIN" in *[!A-Za-z0-9.:/-]*) exit 1;; esac
RUN=/var/tmp/kindle-note-runtime-v6
DESKTOP=1
ACTION_CONNECT_TIMEOUT=4
ACTION_MAX_TIME=8
FB=/mnt/us/libkh/bin/fbink
mkdir "$RUN" 2>/dev/null || exit 1
watchdog=
clock_pid=
version_pid=
sleep_owned=0
touch_pid=
listener=
armed=0
restored=0
completed=0
wm_stopped=0
pillow_disabled=0
bar_stopped=0
wm_identity() {
    # Process start time distinguishes an original PID from a reused PID.
    [ "$(cat "/proc/$wm/comm" 2>/dev/null)" = awesome ] || return 1
    awk '{print $22}' "/proc/$wm/stat" 2>/dev/null
}
release_ui() {
    [ "$sleep_owned" = 0 ] || lipc-set-prop com.lab126.powerd preventScreenSaver "$original_prevent"
    if [ "$wm_stopped" = 1 ] && [ "$(wm_identity)" = "$wm_start" ]; then
        kill -CONT "$wm" 2>/dev/null
    fi
    [ "$pillow_disabled" = 0 ] || lipc-set-prop com.lab126.pillow disableEnablePillow enable
    [ "$bar_stopped" = 0 ] || start statusbar
}
restore() {
    [ "$armed" = 1 ] || return 0
    [ "$restored" = 0 ] || return 0
    restored=1
    printf '%s RESTORE native interface\n' "$(date +%s)"
    release_ui
    # Aborts and USB transitions must not start an app or draw over USB UI.
    if [ "$completed" != 1 ] || ! check_usb; then
        printf 'RESTORE released components only; no app launch on abort/USB\n'
        return 0
    fi
    if [ "$(lipc-get-prop com.lab126.powerd state)" != active ]; then
        lipc-set-prop com.lab126.powerd wakeUp 1
    fi
    check_usb || return 0
    lipc-set-prop com.lab126.appmgrd start app://com.lab126.booklet.home
    sleep 3
    check_usb || return 0
    "$FB" -f --refresh
}
cleanup() {
    trap '' HUP INT TERM
    [ -z "$watchdog" ] || kill "$watchdog" 2>/dev/null
    if [ -n "$version_pid" ]; then kill "$version_pid" 2>/dev/null; wait "$version_pid" 2>/dev/null; fi
    rm -f "$RUN/remote-version" "$RUN/remote-version.new"
    if [ -n "$clock_pid" ]; then kill "$clock_pid" 2>/dev/null; wait "$clock_pid" 2>/dev/null; fi
    if [ -n "$touch_pid" ]; then kill "$touch_pid" 2>/dev/null; wait "$touch_pid" 2>/dev/null; fi
    [ -z "$watchdog" ] || kill "$watchdog" 2>/dev/null
    [ -z "$listener" ] || kill "$listener" 2>/dev/null
    rm -f "$RUN/manual-power.sh"
    [ -z "${saved_light:-}" ] || lipc-set-prop com.lab126.powerd flIntensity "$saved_light"
    restore
    rm -f "$RUN/base.png" "$RUN/new.png" "$RUN/headers" "$RUN/events" "$RUN/fbink" "$RUN/start-gate.sh" "$RUN/device-curl.conf" "$RUN/progress" "$RUN/touch" "$RUN/touch-actions.sh" "$RUN/taps" "$RUN/task-meta" "$RUN/action-response"
    rmdir "$RUN/drawing" 2>/dev/null
    rmdir "$RUN"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
check_usb() { [ "$(lipc-get-prop com.lab126.powerd isCharging)" = 0 ]; }
wait_state() {
    attempts=0
    while [ "$attempts" -lt 6 ]; do
        check_usb || return 1
        state=$(lipc-get-prop com.lab126.powerd state)
        printf '%s STATE %s expected=%s\n' "$(date +%s)" "$state" "$1"
        [ "$state" != "$1" ] || return 0
        attempts=$((attempts+1))
        sleep 1
    done
    return 1
}
draw() (
    while ! mkdir "$RUN/drawing" 2>/dev/null; do "$RUN/touch" --delay-ms 100; done
    trap 'rmdir "$RUN/drawing" 2>/dev/null' EXIT
    trap 'exit 1' HUP INT TERM
    "$FB" -b --image "file=$RUN/base.png" || return 1
    "$FB" -b -S 16 -X 64 -Y 116 "$(date +%H:%M)" || return 1
    "$FB" -b -S 3 -X 68 -Y 286 "$(date '+%a %d %b %Y')" || return 1
    "$FB" -b -S 3 -X 864 -Y 60 "$(battery_text)" || return 1
    "$FB" -b -S 3 -X 64 -Y 1352 "$1" || return 1
    if [ -s "$DATA/undo-id" ]; then "$FB" -b -S 3 -X 760 -Y 1352 'UNDO LAST' || return 1; fi
    if [ -s "$DATA/pending-action.json" ]; then "$FB" -b -S 3 -X 64 -Y 1352 'PENDING SYNC' || return 1; fi
    if [ -s "$DATA/touch-conflict" ]; then "$FB" -b -S 3 -X 64 -Y 1352 'CONFLICT - RETRY TAP' || return 1; fi
    if [ -e "$DATA/screen-stale" ]; then "$FB" -b -S 3 -X 64 -Y 1352 'UPDATING - PLEASE WAIT' || return 1; fi
    "$FB" -f --refresh || return 1
    printf '%s DRAW %s\n' "$(date +%s)" "$1"
)
battery_text() {
    level=$(lipc-get-prop com.lab126.powerd battLevel)
    case "$level" in ''|*[!0-9]*) printf '%s' ' --%'; return;; esac
    if [ "$level" -le 100 ]; then printf '%3d%%' "$level"; else printf '%s' ' --%'; fi
}
version_loop() {
    while check_usb; do
        [ "$(lipc-get-prop com.lab126.powerd state)" = active ] || return 0
        version=$(curl -fsS --config "$RUN/device-curl.conf" --connect-timeout 3 --max-time 5 --max-filesize 128 "$NOTE_ORIGIN/v1/task-version")
        if [ "$?" = 0 ]; then
            case "$version" in ''|*[!0-9]*) :;; *)
                printf '%s\n' "$version" > "$RUN/remote-version.new"
                mv "$RUN/remote-version.new" "$RUN/remote-version"
                ;;
            esac
        fi
        sleep 5
    done
}
clock_loop() {
    previous=
    while :; do
        check_usb || return 0
        [ "$(lipc-get-prop com.lab126.powerd state)" = active ] || return 0
        apply_timezone
        minute=$(date '+%Y%m%d%H%M')
        # Reset idle countdown only while active; never block physical sleep.
        if [ "$minute" != "$previous" ]; then
            lipc-set-prop com.lab126.powerd touchScreenSaverTimeout 1 || return 1
        fi
        if [ "$minute" != "$previous" ] && mkdir "$RUN/drawing" 2>/dev/null; then
            clock_owns_lock=1
            clock_rc=0
            "$FB" -S 16 -X 64 -Y 116 "$(date +%H:%M)" || clock_rc=1
            "$FB" -S 3 -X 68 -Y 286 "$(date '+%a %d %b %Y')" || clock_rc=1
            "$FB" -S 3 -X 864 -Y 60 "$(battery_text)" || clock_rc=1
            rmdir "$RUN/drawing"
            clock_owns_lock=0
            [ "$clock_rc" = 0 ] || return 1
            previous=$minute
        fi
        sleep 1
    done
}
apply_timezone() {
    if [ -f "$DATA/utc-offset" ]; then
        offset=$(cat "$DATA/utc-offset")
        case "$offset" in ''|*[!0-9-]*) return 0;; esac
        [ "$offset" -ge -50400 ] 2>/dev/null && [ "$offset" -le 50400 ] 2>/dev/null || return 0
        sign=+
        if [ "$offset" -ge 0 ]; then sign=-; else offset=$((-offset)); fi
        TZ="KNT${sign}$((offset / 3600)):$(((offset % 3600) / 60))"
        export TZ
    fi
}
sync_in_place() {
    # Manual wake must accept input before any network work. The cached image
    # is safe only with its matching revision/checksum (checked by the helper).
    if [ "${1:-auto}" = interactive ]; then
        check_usb || return 1
        apply_timezone
        touch_session || return 1
        [ "${touch_handled:-0}" != 1 ] || return 0
    fi
    lipc-set-prop com.lab126.cmd wirelessEnable 1 || return 1
    lipc-set-prop com.lab126.wifid enable 1 || return 1
    attempts=0
    connected=0
    while [ "$attempts" -lt 3 ]; do
        check_usb || return 1
        wifi=$(lipc-get-prop com.lab126.wifid cmState)
        printf '%s WIFI %s\n' "$(date +%s)" "$wifi"
        if [ "$wifi" = CONNECTED ]; then connected=1; break; fi
        attempts=$((attempts+1))
        sleep 2
    done
    check_usb || return 1
    result=CACHED
    if [ "$connected" = 1 ]; then
        flush_action || :
        fetch_attempt=1
        while [ "$fetch_attempt" -le 1 ]; do
            check_usb || return 1
            code=$(curl -sS --config "$RUN/device-curl.conf" --connect-timeout 6 --max-time 25 --max-filesize 2097152 -D "$RUN/headers" -o "$RUN/new.png" -w '%{http_code}' "$NOTE_ORIGIN/v1/screen")
            rc=$?
            printf '%s FETCH attempt=%s rc=%s http=%s\n' "$(date +%s)" "$fetch_attempt" "$rc" "$code"
            if [ "$rc" = 0 ] && [ "$code" = 200 ]; then
                signature=$(dd if="$RUN/new.png" bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')
                if [ "$signature" = 89504e470d0a1a0a ]; then
                    cp "$RUN/new.png" "$RUN/base.png" || return 1
                    cp "$RUN/base.png" "$DATA/cached-screen.png" || return 1
                    offset=$(awk 'tolower($1)=="x-utc-offset:" {gsub("\r", "", $2); print $2}' "$RUN/headers")
                    case "$offset" in ''|*[!0-9-]*) offset=invalid;; esac
                    if [ "$offset" -ge -50400 ] 2>/dev/null && [ "$offset" -le 50400 ] 2>/dev/null; then printf '%s\n' "$offset" > "$DATA/utc-offset"; fi
                    save_task_meta || rm -f "$RUN/task-meta"
                    result=ONLINE
                    break
                fi
            fi
            # Do not retry authorization errors or other permanent 4xx.
            case "$code" in 4*) break;; esac
            fetch_attempt=$((fetch_attempt+1))
        done
    fi
    check_usb || return 1

    apply_timezone
    draw "AUTO UPDATE - $result" || return 1
    touch_prompt_shown=0
    date +%s > "$RUN/progress"
    return 0
}
printf '\n=== Note runtime v6 - desktop clock and touch ===\n'
date
[ ! -d /var/tmp/kindle-note-runtime ] || exit 1
[ ! -d /var/tmp/kindle-note-runtime-v3 ] || exit 1
[ ! -d /var/tmp/kindle-note-runtime-v4 ] || exit 1
[ ! -d /var/tmp/kindle-note-runtime-v5 ] || { printf "START BLOCKED: old V5 runtime directory remains\n"; exit 1; }
check_usb || exit 1
[ "$(lipc-get-prop com.lab126.powerd state)" = active ] || exit 1
[ -x "$FB" ] && [ -s "$DATA/cached-screen.png" ] || exit 1
cp "$DATA/cached-screen.png" "$RUN/base.png" || exit 1
cp "$DATA/device-curl.conf" "$RUN/device-curl.conf" || exit 1
cp "$FB" "$RUN/fbink" || exit 1
chmod 700 "$RUN/fbink" || exit 1
FB="$RUN/fbink"
cp "$DATA/kindle-touch-v6" "$RUN/touch" || exit 1
chmod 700 "$RUN/touch" || exit 1
cp "$DATA/touch-actions-v6.sh" "$RUN/touch-actions.sh" || exit 1
. "$RUN/touch-actions.sh"
cp "$DATA/manual-power-v6.sh" "$RUN/manual-power.sh" || exit 1
. "$RUN/manual-power.sh"
if [ -s "$DATA/touch-conflict" ]; then printf 'conflict\n' > "$DATA/screen-stale"; fi
[ ! -s "$DATA/task-meta" ] || cp "$DATA/task-meta" "$RUN/task-meta"
cp "$DATA/ui-start-gate.sh" "$RUN/start-gate.sh" || exit 1
. "$RUN/start-gate.sh"
wait_ui_settled || exit 1
kpp=$(pidof KPPMainAppV2)
wm=$(pidof awesome)
case "$wm" in ''|*[!0-9]*) exit 1;; esac
bar_running=0
status statusbar | grep -q 'start/running' && bar_running=1
[ ! -d /var/tmp/kindle-note-inplace-test ] || exit 1
[ ! -d /var/tmp/kindle-note-deep-inplace-test ] || exit 1
[ ! -d /var/tmp/kindle-note-ui-guard-test ] || exit 1
[ ! -d /var/tmp/kindle-note-guarded-deep-test ] || exit 1
[ ! -d /var/tmp/kindle-note-inplace-cycles-test ] || exit 1
[ ! -d /var/tmp/kindle-note-guarded-cycles-test ] || exit 1
if [ -f "$DATA/utc-offset" ]; then
    offset=$(cat "$DATA/utc-offset")
    case "$offset" in ''|*[!0-9-]*) exit 1;; esac
    [ "$offset" -ge -50400 ] 2>/dev/null && [ "$offset" -le 50400 ] 2>/dev/null || exit 1
    sign=+
    if [ "$offset" -ge 0 ]; then sign=-; else offset=$((-offset)); fi
    TZ="KNT${sign}$((offset / 3600)):$(((offset % 3600) / 60))"
    export TZ
fi
mkfifo "$RUN/events" || exit 1
exec 3<> "$RUN/events"
lipc-wait-event -m -s 0 com.lab126.powerd readyToSuspend,wakeupFromSuspend,outOfScreenSaver > "$RUN/events" &
listener=$!
# Recheck the process selected by the startup gate.
[ "$(pidof awesome)" = "$wm" ] || exit 1
wm_start=$(wm_identity)
case "$wm_start" in ''|*[!0-9]*) exit 1;; esac
armed=1
original_prevent=$(lipc-get-prop com.lab126.powerd preventScreenSaver)
case "$original_prevent" in 0|1) :;; *) exit 1;; esac
sleep_owned=1
lipc-set-prop com.lab126.powerd preventScreenSaver 0 || exit 1
lipc-set-prop com.lab126.powerd touchScreenSaverTimeout 1 || exit 1
parent=$$
date +%s > "$RUN/progress"
(
    trap - EXIT
    trap 'exit 0' TERM
    # Only a stalled cycle times out; successful events renew progress.
    while :; do
        sleep 5
        if ! check_usb; then reason=USB; break; fi
        last=$(cat "$RUN/progress" 2>/dev/null)
        case "$last" in ''|*[!0-9]*) reason=BAD_PROGRESS; break;; esac
        if [ "$(($(date +%s)-last))" -ge 600 ]; then reason=STALLED; break; fi
    done
    printf 'WATCHDOG recovery reason=%s\n' "${reason:-AWAKE_TIMEOUT}"
    kill -TERM "$parent" 2>/dev/null
    # The parent owns normal restoration. Only release a still-identical WM
    # if its exit trap is delayed; never launch home from this second process.
    sleep 10
    if [ "$(wm_identity)" = "$wm_start" ]; then
        kill -CONT "$wm" 2>/dev/null
        lipc-set-prop com.lab126.pillow disableEnablePillow enable
        lipc-set-prop com.lab126.powerd preventScreenSaver "$original_prevent"
        [ "$bar_running" = 0 ] || start statusbar
    fi
) </dev/null &
watchdog=$!
pillow_disabled=1
lipc-set-prop com.lab126.pillow disableEnablePillow disable || exit 1
if [ "$bar_running" = 1 ]; then
    bar_stopped=1
    stop statusbar || exit 1
fi
wm_stopped=1
kill -STOP "$wm" || exit 1
[ "$(awk '/^State:/ {print $2}' "/proc/$wm/status")" = T ] || exit 1
draw 'AUTO UPDATE - STARTING' || exit 1
start_live() {
(
    trap - EXIT
    clock_owns_lock=0
    trap '[ "$clock_owns_lock" = 0 ] || rmdir "$RUN/drawing" 2>/dev/null; exit 0' HUP INT TERM
    clock_loop
) </dev/null &
clock_pid=$!
(
    trap - EXIT
    trap 'exit 0' HUP INT TERM
    version_loop
) </dev/null &
version_pid=$!
}
start_live
next_sync=0
observed_version=
next_battery_log=0
while :; do
    check_usb || break
    if [ "$(lipc-get-prop com.lab126.powerd state)" != active ]; then
        manual_sleep || break
        start_live
        touch_prompt_shown=0
    fi
    date +%s > "$RUN/progress"
    [ "$(pidof KPPMainAppV2)" = "$kpp" ] || break
    [ "$(wm_identity)" = "$wm_start" ] || break
    kill -0 "$clock_pid" 2>/dev/null || break
    battery=$(lipc-get-prop com.lab126.powerd battLevel)
    case "$battery" in ''|*[!0-9]*) break;; esac
    [ "$battery" -gt 15 ] || break
    if [ "$(date +%s)" -ge "$next_battery_log" ]; then
        printf '%s BATTERY percent=%s mode=desktop\n' "$(date +%s)" "$battery"
        next_battery_log=$(($(date +%s)+300))
    fi
    # Renew the input window immediately, including after completing an item.
    # A short network operation temporarily pauses input; the clock is separate.
    touch_session || break
    check_usb || break
    [ "$(lipc-get-prop com.lab126.powerd state)" = active ] || continue
    if remote_update_available && [ "$remote_revision" != "$observed_version" ]; then
        observed_version=$remote_revision
        next_sync=0
    fi
    if [ "${touch_handled:-0}" = 1 ]; then
        retry_delay=300
        [ ! -e "$DATA/screen-stale" ] || retry_delay=10
        remote_update_available && retry_delay=10
        next_sync=$(($(date +%s)+retry_delay))
    fi
    if [ "$(date +%s)" -ge "$next_sync" ]; then
        sync_in_place auto || break
        retry_delay=300
        [ ! -e "$DATA/screen-stale" ] || retry_delay=10
        remote_update_available && retry_delay=10
        next_sync=$(($(date +%s)+retry_delay))
    fi
    log_size=$(wc -c < "$DATA/runtime-v6.log" 2>/dev/null)
    if [ "${log_size:-0}" -gt 1048576 ] 2>/dev/null; then : > "$DATA/runtime-v6.log"; fi
    "$RUN/touch" --delay-ms 100
done
printf 'Desktop stopped; releasing native interface and power policy\n'
exit 0
