#!/usr/bin/env bash
# Cookie-store diagnosis for a machine where the login says "no venice.ai cookie".
# Read-only: prints where browsers keep profiles, whether a __client cookie exists,
# and which key it is encrypted with. Prints lengths, never cookie values.
#
#   bash scripts/diagnose-cookies.sh
#
# Share the output; it contains host names and cookie *names*, not values.
set -u

say() { printf '\n== %s\n' "$*"; }

say "who / where"
id -un
printf 'HOME=%s\n' "$HOME"
printf 'TMPDIR=%s\n' "${TMPDIR:-unset}"
printf 'XDG_CONFIG_HOME=%s\n' "${XDG_CONFIG_HOME:-unset}"
uname -sr

say "binaries"
for bin in sqlite3 secret-tool google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge gnome-keyring-daemon; do
  printf '%-22s %s\n' "$bin" "$(command -v "$bin" 2>/dev/null || echo MISSING)"
done

say "chrome version"
google-chrome --version 2>/dev/null || echo 'n/a'

say "desktop / keyring"
printf 'XDG_CURRENT_DESKTOP=%s XDG_SESSION_TYPE=%s\n' "${XDG_CURRENT_DESKTOP:-unset}" "${XDG_SESSION_TYPE:-unset}"
pgrep -a gnome-keyring-daemon 2>/dev/null | head -2 || echo 'gnome-keyring-daemon not running'
if [ -d "$HOME/.local/share/keyrings" ]; then
  ls -la "$HOME/.local/share/keyrings" 2>/dev/null | head -5
fi

say "browser processes (shows a custom --user-data-dir, if any)"
pgrep -a -f 'chrome|chromium|brave|msedge' 2>/dev/null | grep -o -- '--user-data-dir=[^ ]*' | sort -u || echo 'none running'

say "candidate profile roots"
for root in "$HOME/.config" "$HOME/.var/app" "${TMPDIR:-/tmp}" "${TMPDIR:-/tmp}/opencode"; do
  [ -d "$root" ] || continue
  for entry in "$root"/*; do
    [ -d "$entry" ] || continue
    if [ -f "$entry/Default/Cookies" ] || [ -f "$entry/Local State" ]; then
      echo "$entry"
    fi
  done
done

say "os_crypt in Local State (keyring flag)"
for state in "$HOME/.config/google-chrome/Local State" "$HOME/.config/chromium/Local State"; do
  [ -f "$state" ] || continue
  echo "$state"
  node -e 'const s=require(process.argv[1]);const c=s.os_crypt||{};console.log(JSON.stringify({encrypted_key_len:(c.encrypted_key||"").length,use_keyring:c.use_keyring}))' "$state" 2>&1 | sed 's/^/  /'
done

say "cookie DBs and their __client row (prefix shows the key format)"
find "$HOME/.config" "$HOME/.var/app" "${TMPDIR:-/tmp}" -maxdepth 4 -name Cookies -path '*/Default/*' 2>/dev/null | while read -r db; do
  printf '\n%s\n' "$db"
  sqlite3 "$db" "select host_key, name, substr(hex(encrypted_value),1,6), length(encrypted_value) from cookies where name='__client';" 2>&1 | sed 's/^/  /'
done

say "decrypt attempt with candidate keys (v10/v11, peanuts / empty)"
DB="$HOME/.config/google-chrome/Default/Cookies"
if [ -f "$DB" ]; then
  node "$(dirname "$0")/decrypt-probe.mjs" "$DB" 2>&1 | sed 's/^/ /'
else
  echo "  $DB not found"
fi

say "keyring"
if command -v secret-tool >/dev/null 2>&1; then
  for app in chrome brave chromium; do
    value=$(secret-tool lookup application "$app" 2>/dev/null)
    length=${#value}
    if [ "$length" -gt 0 ]; then
      echo "secret-tool application=$app -> found, $length chars"
    else
      echo "secret-tool application=$app -> none"
    fi
  done
else
  echo 'secret-tool MISSING'
fi

say "versions"
node -v 2>/dev/null || echo 'node MISSING'
cd "$(dirname "$0")/.." 2>/dev/null && git log --oneline -1 2>/dev/null
