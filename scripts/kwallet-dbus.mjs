#!/usr/bin/env node
// Reads the Chrome Safe Storage secret out of kdewallet over D-Bus.
//
// Everything about this wallet is awkward: `kwallet-query` and `entryList` are
// broken on some builds, `readEntryList` wants extra arguments, and folderList
// returns folders glued to entries. So the signature is discovered from the
// introspection data and the entries are tried by known names.
import { spawnSync } from 'node:child_process'

const run = (...args) => {
  const r = spawnSync('qdbus', args, { encoding: 'utf8' })
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), code: r.status }
}

const svc = 'org.kde.kwalletd5'
const obj = '/modules/kwalletd5'
const iface = 'org.kde.KWallet'
const app = 'venice-web-probe'

const introspect = run(svc, obj, 'org.freedesktop.DBus.Introspectable.Introspect')
const signature = (name) => {
  const match = new RegExp(`<method name="${name}">([\\s\\S]*?)</method>`).exec(introspect.out)
  return match ? match[1].replace(/\s+/g, ' ').trim() : 'missing'
}
for (const name of ['readEntryList', 'readPassword', 'entryList', 'folderList', 'open']) {
  console.log(`signature ${name}: ${signature(name)}`)
}

const open = run(svc, obj, `${iface}.open`, 'kdewallet', '0', app)
const handle = open.out
console.log('open ->', JSON.stringify(handle))
if (!handle || handle === '-1') process.exit(0)

for (const folder of ['Chrome', 'Keys']) {
  const list = run(svc, obj, `${iface}.readEntryList`, handle, folder, app)
  console.log(`readEntryList ${folder} ->`, JSON.stringify(list.out), list.err)
}

for (const folder of ['Chrome', 'Keys', '']) {
  for (const entry of ['Chrome Safe Storage', 'Chrome', 'Chromium']) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, app)
    console.log(`  ${JSON.stringify(folder)}/${entry} -> ${value.out ? `${value.out.length} chars ${JSON.stringify(value.out.slice(0, 6))}` : 'none'}`)
  }
}

run(svc, obj, `${iface}.close`, handle, 'false', app)
