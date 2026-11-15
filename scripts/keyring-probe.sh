#!/usr/bin/env bash
# Keyring probe: which lookup labels return a key, and whether it opens the DB.
# Prints lengths and labels, never key or cookie values.
set -u

echo "== secret-tool present"
command -v secret-tool || echo MISSING

for label in chrome brave chromium "Chrome Safe Storage" "Chromium Safe Storage"; do
  value=$(secret-tool lookup application "$label" 2>&1)
  printf 'lookup application=%s -> len %s | %s\n' "$label" "${#value}" "$(printf '%s' "$value" | head -c 60)"
done

echo
echo "== keyring items mentioning chrome (search)"
secret-tool search --all application chrome 2>&1 | head -20 || true

DB="$HOME/.config/google-chrome/Default/Cookies"
echo
echo "== decrypt with each lookup result"
if [ -f "$DB" ]; then
  node "$(dirname "$0")/keyring-decrypt.mjs" "$DB" 2>&1
else
  echo "$DB missing"
fi
