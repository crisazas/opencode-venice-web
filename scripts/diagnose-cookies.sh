#!/usr/bin/env bash
# Cookie-store diagnosis for a machine where the login says "no venice.ai cookie".
# Read-only: prints where browsers keep profiles, whether a __client cookie exists,
# and which key it is encrypted with. Nothing is decrypted here.
#
#   bash scripts/diagnose-cookies.sh
#
# Share the output; it contains host names and cookie *names*, not values.
set -u

say() { printf '\n== %s\n' "$*"; }

say "who / where"
id -un; echo "HOME=$HOME"; echo "TMPDIR=${TMPDIR:-unset}"; echo "XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-unset}"
uname -sr

say "binaries"
for bin in sqlite3 secret-tool google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
  printf '%-22s %s\n' "$bin" "$(command -v "$bin" 2>/dev/null || echo MISSING)"
done

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

say "cookie DBs and their __client row"
find "$HOME/.config" "$HOME/.var/app" "${TMPDIR:-/tmp}" -maxdepth 4 -name Cookies -path '*/Default/*' 2>/dev/null | while read -r db; do
  printf '\n%s\n' "$db"
  sqlite3 "$db" "select host_key, name, substr(hex(encrypted_value),1,6), length(encrypted_value) from cookies where name='__client';" 2>&1 | sed 's/^/  /'
done

say "keyring"
if command -v secret-tool >/dev/null 2>&1; then
  for app in chrome brave chromium; do
    value=$(secret-tool lookup application "$app" 2>/dev/null)
    if [ -n "$value" ]; then echo "secret-tool application=$app -> found (${#value} chars)"; else echo "secret-tool application=$app -> none"; fi
  done
else
  echo 'secret-tool MISSING (no gnome-keyring lookup; the peanuts fallback only works if the browser itself had no keyring)'
fi

say "versions"
node -v 2>/dev/null || echo 'node MISSING'
cd "$(dirname "$0")/.." 2>/dev/null && git log --oneline -1 2>/dev/null
