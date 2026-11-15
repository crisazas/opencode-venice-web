#!/usr/bin/env node
// Reads the Chrome Safe Storage secret out of kdewallet over D-Bus.
// `kwallet-query` is broken on some builds (always answers "folder X does not
// exist"), so the wallet is opened and read through org.kde.kwalletd5.
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

// folderList mixes folder and entry names. Entries live in the folders it names.
for (const folder of folders.out.split(/\s+/).filter(Boolean)) {
  const entries = run(svc, obj, `${iface}.entryList`, handle, folder, app)
  console.log(`folder ${folder} entries ->`, JSON.stringify(entries.out), entries.err)
  for (const entry of entries.out.split(/\s+/).filter(Boolean)) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, app)
    const ok = value.out && !/^The folder|does not exist|not found/i.test(value.out)
    console.log(`  ${folder}/${entry} -> ${ok ? `${value.out.length} chars` : `none (${value.out || value.err})`}`)
  }
}

run(svc, obj, `${iface}.close`, handle, 'false', app)
