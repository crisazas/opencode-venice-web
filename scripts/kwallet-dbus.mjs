#!/usr/bin/env node
// Reads the Chrome Safe Storage secret out of kdewallet over D-Bus.
// `kwallet-query` and `entryList` are unreliable on some builds, so known
// entry names are tried directly in each folder the wallet reports.
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

const folders = run(svc, obj, `${iface}.folderList`, handle, app)
console.log('folderList ->', JSON.stringify(folders.out))

const names = ['Chrome Safe Storage', 'Chrome', 'Chromium', 'Chrome Keys']
for (const folder of folders.out.split(/\s+/).filter(Boolean)) {
  for (const entry of names) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, app)
    const ok = value.out && !/^The folder|does not exist|not found/i.test(value.out)
    console.log(`  ${folder}/${entry} -> ${ok ? `${value.out.length} chars, starts ${JSON.stringify(value.out.slice(0, 6))}` : 'none'}`)
  }
}

run(svc, obj, `${iface}.close`, handle, 'false', app)
