#!/usr/bin/env bash
# KDE/KWallet probe: does the wallet expose the Chrome Safe Storage key, and can
# it be read? Prints item names and lengths, never key or cookie values.
set -u

say() { printf '\n== %s\n' "$*"; }

say "environment"
printf 'XDG_CURRENT_DESKTOP=%s XDG_SESSION_TYPE=%s DBUS_SESSION_BUS_ADDRESS=%s\n' \
  "${XDG_CURRENT_DESKTOP:-unset}" "${XDG_SESSION_TYPE:-unset}" "${DBUS_SESSION_BUS_ADDRESS:-unset}"

say "binaries"
for bin in kwallet-query qdbus qdbus6 dbus-send busctl; do
  printf '%-14s %s\n' "$bin" "$(command -v "$bin" 2>/dev/null || echo MISSING)"
done

say "wallets"
if command -v kwallet-query >/dev/null 2>&1; then
  for wallet in kdewallet Chrome\ Safe\ Storage "$HOME/.local/share/kwalletd/kdewallet.kwl"; do
    echo "-- $wallet"
    kwallet-query -l "$wallet" 2>&1 | head -20
  done
else
  echo 'kwallet-query MISSING (apt install kwalletmanager / kf5-config)'
fi

say "secret-tool search (all attributes)"
secret-tool search --all xdg:schema chrome_libsecret_os_crypt_password_v2 2>&1 | head -20 || true
secret-tool search --all application chrome 2>&1 | head -20 || true

say "dbus wallet objects"
if command -v qdbus >/dev/null 2>&1; then
  qdbus 2>/dev/null | grep -i kwallet || echo 'no kwallet service on the session bus'
fi
