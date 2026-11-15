#!/usr/bin/env node
// Reads the Chrome Safe Storage secret out of kdewallet over D-Bus.
//
// `kwallet-query` and `entryList` are broken on some builds, and folder names
// come back glued to entry names, so this enumerates folders with readEntryList
// and falls back to known names.
import { spawnSync } from 'node:child_process'

const run = (...args) => {
  const r = spawnSync('qdbus', args, { encoding: 'utf8' })
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), code: r.status }
}

const svc = 'org.kde.kwalletd5'
const obj = '/modules/kwalletd5'
const iface = 'org.kde.KWallet'
const app = 'venice-web-probe'

const open = run(svc, obj, `${iface}.open`, 'kdewallet', '0', app)
const handle = open.out
console.log('open ->', JSON.stringify(handle), open.err)
if (!handle || handle === '-1') process.exit(0)

for (const folder of ['Chrome', 'Keys', 'Passwords']) {
  const list = run(svc, obj, `${iface}.readEntryList`, handle, folder, app)
  console.log(`readEntryList ${folder} ->`, JSON.stringify(list.out), list.err)
}

for (const folder of ['Chrome', 'Keys']) {
  for (const entry of ['Chrome Safe Storage', 'Chrome', 'Chromium']) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, app)
    console.log(`  ${folder}/${entry} -> ${value.out ? `${value.out.length} chars ${JSON.stringify(value.out.slice(0, 6))}` : 'none'}`)
  }
}

run(svc, obj, `${iface}.close`, handle, 'false', app)
