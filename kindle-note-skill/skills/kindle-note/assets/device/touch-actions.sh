# Sourced by runtime v4. One durable pending action; never overwrite it.
task_id_valid() { case "$1" in ''|*[!A-Za-z0-9_-]*) return 1;; esac; [ "${#1}" -le 64 ]; }
pending_id() { sed -n 's/.*"id":"\([A-Za-z0-9_-]*\)".*/\1/p' "$DATA/pending-action.json"; }
load_task_meta() {
    [ ! -e "$DATA/screen-stale" ] || return 1
    [ -s "$RUN/task-meta" ] || return 1
    revision=$(sed -n '1p' "$RUN/task-meta")
    hits=$(sed -n '2p' "$RUN/task-meta")
    expected_sum=$(sed -n '3p' "$RUN/task-meta")
    case "$revision" in ''|*[!0-9]*) return 1;; esac
    [ "$expected_sum" = "$(cksum "$RUN/base.png" | awk '{print $1 " " $2}')" ] || return 1
}
save_task_meta() {
    revision=$(awk 'tolower($1)=="x-task-revision:" {gsub("\r","",$2);print $2}' "$RUN/headers")
    hits=$(awk 'tolower($1)=="x-task-hits:" {gsub("\r","",$2);print $2}' "$RUN/headers")
    case "$revision" in ''|*[!0-9]*) return 1;; esac
    [ -n "$hits" ] || return 1
    { printf '%s\n%s\n' "$revision" "$hits"; cksum "$RUN/base.png" | awk '{print $1 " " $2}'; } > "$RUN/task-meta"
    cp "$RUN/task-meta" "$DATA/task-meta.new" && mv "$DATA/task-meta.new" "$DATA/task-meta" || return 1
    rm -f "$DATA/screen-stale" "$DATA/touch-conflict"
}
flush_action() {
    [ -s "$DATA/pending-action.json" ] || return 0
    action_id=$(pending_id)
    task_id_valid "$action_id" || return 1
    code=$(curl -sS --config "$RUN/device-curl.conf" --connect-timeout "${ACTION_CONNECT_TIMEOUT:-12}" --max-time "${ACTION_MAX_TIME:-30}" --max-filesize 8192 \
        -H 'Content-Type: application/json' --data-binary "@$DATA/pending-action.json" \
        -o "$RUN/action-response" -w '%{http_code}' "$NOTE_ORIGIN/v1/task-action")
    rc=$?
    printf 'TASK_ACTION rc=%s http=%s\n' "$rc" "$code"
    if [ "$rc" = 0 ] && [ "$code" = 200 ] && grep -q '"ok":true' "$RUN/action-response"; then
        printf 'confirmed\n' > "$DATA/screen-stale" || return 1
        if grep -q '"done":true' "$DATA/pending-action.json"; then
            printf '%s\n' "$action_id" > "$DATA/undo-id"
        else
            rm -f "$DATA/undo-id"
        fi
        rm -f "$DATA/pending-action.json" "$DATA/touch-conflict"
        return 0
    fi
    case "$code" in
        400|404|409)
            printf 'conflict\n' > "$DATA/screen-stale" || return 1
            mkdir -p "$DATA/action-conflicts" || return 1
            conflict_id=$(cat /proc/sys/kernel/random/uuid)
            task_id_valid "$conflict_id" || return 1
            mv "$DATA/pending-action.json" "$DATA/action-conflicts/$conflict_id.json" || return 1
            printf '%s\n' "$code" > "$DATA/touch-conflict"
            printf 'TASK_CONFLICT: retained action for review; not rebasing\n'
            ;;
    esac
    return 1
}
enqueue_action() {
    task_id_valid "$1" || return 1
    case "$2" in true|false) :;; *) return 1;; esac
    [ ! -s "$DATA/pending-action.json" ] || return 1
    load_task_meta || return 1
    operation=$(cat /proc/sys/kernel/random/uuid)
    task_id_valid "$operation" || return 1
    printf '{"id":"%s","done":%s,"expected_revision":%s,"operation_id":"%s"}\n' "$1" "$2" "$revision" "$operation" > "$DATA/pending-action.new" || return 1
    mv "$DATA/pending-action.new" "$DATA/pending-action.json" || return 1
    sync
}
remote_update_available() {
    [ -s "$RUN/remote-version" ] && [ -s "$RUN/task-meta" ] || return 1
    remote_revision=$(cat "$RUN/remote-version")
    local_revision=$(sed -n '1p' "$RUN/task-meta")
    case "$remote_revision:$local_revision" in *[!0-9:]*) return 1;; esac
    [ "$remote_revision" -gt "$local_revision" ] 2>/dev/null
}
touch_session() {
    touch_handled=0
    if remote_update_available; then sleep 1; return 0; fi
    if [ -e "$DATA/screen-stale" ]; then
        if [ "${touch_prompt_shown:-0}" != stale ]; then draw 'UPDATING - PLEASE WAIT' || return 1; fi
        touch_prompt_shown=stale
        sleep 1
        return 0
    fi
    load_task_meta || { printf 'TOUCH disabled: no matching screen metadata\n'; sleep 1; return 0; }
    if [ -s "$DATA/pending-action.json" ]; then
        if [ "${touch_prompt_shown:-0}" != pending ]; then draw 'PENDING - WILL RETRY'; fi
        touch_prompt_shown=pending
        sleep 1
        return 0
    fi
    "$RUN/touch" /dev/input/event2 30 > "$RUN/taps" 2>&1 &
    touch_pid=$!
    touch_ready=0
    check=0
    while [ "$check" -lt 30 ]; do
        if grep -q '^READY ' "$RUN/taps"; then touch_ready=1; break; fi
        kill -0 "$touch_pid" 2>/dev/null || break
        check=$((check+1))
        "$RUN/touch" --delay-ms 100
    done
    if [ "$touch_ready" != 1 ]; then
        kill "$touch_pid" 2>/dev/null; wait "$touch_pid" 2>/dev/null; touch_pid=
        sleep 1
        return 0
    fi
    if [ "${DESKTOP:-0}" != 1 ] || [ "${touch_prompt_shown:-0}" != ready ]; then
        draw 'TAP CIRCLE TO COMPLETE' || return 1
    fi
    touch_prompt_shown=ready
    seen=0
    while kill -0 "$touch_pid" 2>/dev/null; do
        check_usb || break
        remote_update_available && break
        [ "$(lipc-get-prop com.lab126.powerd state)" = active ] || break
        line=$(awk -v n="$seen" '$1=="TAP" && $2>n {print;exit}' "$RUN/taps")
        if [ -n "$line" ]; then
            set -- $line
            seen=$2; x=$3; y=$4
            case "$x:$y" in *[!0-9:]*) break;; esac
            # Widen the circle horizontally only; never overlap adjacent rows.
            id=$(printf '%s\n' "$hits" | tr ';' '\n' | awk -F, -v x="$x" -v y="$y" 'NF==5 && x>=($2-20) && x<=($4+20) && y>=$3 && y<=$5 {print $1;exit}')
            done_value=true
            if [ "$x" -ge 740 ] && [ "$x" -le 1020 ] && [ "$y" -ge 1320 ] && [ "$y" -le 1420 ] && [ -s "$DATA/undo-id" ]; then
                id=$(cat "$DATA/undo-id"); done_value=false
            fi
            if task_id_valid "$id"; then
                kill "$touch_pid" 2>/dev/null; wait "$touch_pid" 2>/dev/null; touch_pid=
                # Give feedback before the durable write and slow network call.
                "$FB" -S 3 -X 64 -Y 1352 'SAVING...' || return 1
                enqueue_action "$id" "$done_value" || return 0
                # The nested noninteractive sync flushes the queue and fetches the matching new image.
                sync_in_place auto || return 1
                touch_handled=1
                return 0
            fi
        fi
        "$RUN/touch" --delay-ms 100
    done
    [ -z "$touch_pid" ] || kill "$touch_pid" 2>/dev/null
    [ -z "$touch_pid" ] || wait "$touch_pid" 2>/dev/null
    touch_pid=
}
