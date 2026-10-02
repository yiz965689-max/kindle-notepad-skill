# Power button owns foreground state. RTC work returns to existing sleep only.
stop_live() {
    for child in "$clock_pid" "$version_pid" "$touch_pid"; do
        [ -z "$child" ] || kill "$child" 2>/dev/null
    done
    for child in "$clock_pid" "$version_pid" "$touch_pid"; do
        [ -z "$child" ] || wait "$child" 2>/dev/null
    done
    clock_pid=; version_pid=; touch_pid=
}
manual_wake() {
    lipc-set-prop com.lab126.powerd preventScreenSaver 0 || return 1
    lipc-set-prop com.lab126.powerd touchScreenSaverTimeout 1 || return 1
    [ -z "$saved_light" ] || lipc-set-prop com.lab126.powerd flIntensity "$saved_light" || return 1
    saved_light=
    printf '%s MANUAL_WAKE no forced network refresh\n' "$(date +%s)"
    return 0
}
manual_sleep() {
    stop_live
    saved_light=$(lipc-get-prop com.lab126.powerd flIntensity)
    case "$saved_light" in ''|*[!0-9]*) return 1;; esac
    [ "$saved_light" -le 24 ] || return 1
    lipc-set-prop com.lab126.powerd preventScreenSaver 0 || return 1
    # Mask frontlight before scripted full wakes; restore only on manual wake.
    lipc-set-prop com.lab126.powerd flIntensity 0 || return 1
    draw 'SLEEP - TIMED UPDATE' || return 1
    rtc_armed=0
    while check_usb; do
        date +%s > "$RUN/progress"
        if [ "$(lipc-get-prop com.lab126.powerd state)" = active ]; then manual_wake; return $?; fi
        IFS= read -r event <&3 || return 1
        printf '%s SLEEP_EVENT %s\n' "$(date +%s)" "$event"
        check_usb || return 1
        # Events may be queued from before sleep; current power state wins.
        if [ "$(lipc-get-prop com.lab126.powerd state)" = active ]; then manual_wake; return $?; fi
        case "$event" in
            readyToSuspend*)
                battery=$(lipc-get-prop com.lab126.powerd battLevel)
                case "$battery" in ''|*[!0-9]*) return 1;; esac
                [ "$battery" -gt 15 ] || return 1
                lipc-set-prop com.lab126.powerd rtcWakeup 300 || return 1
                rtc_armed=1
                ;;
            wakeupFromSuspend*)
                [ "$rtc_armed" = 1 ] || continue
                rtc_armed=0
                lipc-set-prop com.lab126.powerd preventScreenSaver 0 || return 1
                lipc-set-prop com.lab126.powerd wakeUp 1 || return 1
                wait_state active || return 1
                sync_in_place auto || return 1
                check_usb || return 1
                if [ "$(lipc-get-prop com.lab126.powerd state)" = active ]; then
                    lipc-set-prop com.lab126.powerd powerButton 1 || return 1
                fi
                lipc-set-prop com.lab126.powerd preventScreenSaver 0 || return 1
                wait_state screenSaver || return 1
                draw "SLEEP - $result" || return 1
                ;;
        esac
    done
    return 1
}
