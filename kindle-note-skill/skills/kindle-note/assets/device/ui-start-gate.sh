# Sourced helper: observing stable process/app identity is a prerequisite,
# not proof that all native rendering has stopped.
ui_fingerprint() {
    [ "$(lipc-get-prop com.lab126.powerd isCharging)" = 0 ] || return 1
    [ "$(lipc-get-prop com.lab126.powerd state)" = active ] || return 1
    [ "$(lipc-get-prop com.lab126.appmgrd activeApp)" = com.lab126.KPPMainApp ] || return 1
    for process in awesome KPPMainAppV2; do
        pid=$(pidof "$process")
        case "$pid" in ''|*[!0-9]*) return 1;; esac
        state=$(awk '/^State:/ {print $2}' "/proc/$pid/status")
        case "$state" in R|S) :;; *) return 1;; esac
        birth=$(awk '{print $22}' "/proc/$pid/stat")
        case "$birth" in ''|*[!0-9]*) return 1;; esac
        printf '%s:%s:%s;' "$process" "$pid" "$birth"
    done
}
wait_ui_settled() {
    stable=0
    previous=
    checks=0
    while [ "$checks" -lt 10 ]; do
        checks=$((checks+1))
        if fingerprint=$(ui_fingerprint); then
            if [ "$fingerprint" = "$previous" ]; then stable=$((stable+1)); else stable=1; fi
            previous=$fingerprint
        else
            stable=0
            previous=
        fi
        printf 'UI_GATE check=%s consecutive=%s\n' "$checks" "$stable"
        if [ "$stable" -ge 4 ]; then return 0; fi
        sleep 2
    done
    printf 'UI_GATE NOT READY: no display takeover\n'
    return 1
}
