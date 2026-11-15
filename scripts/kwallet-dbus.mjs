#!/usr/bin/env node
// Enumera carpetas y entradas de kdewallet por D-Bus. `kwallet-query -l` is
// broken on some builds (always answers "folder Passwords does not exist").
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
console.log('folderList ->', JSON.stringify(folders.out), folders.err)

for (const folder of folders.out.split(/\s+/).filter(Boolean)) {
  // folderList also returns entry names; ask per folder and filter the noise.
  for (const candidate of [folder, 'Chrome Safe Storage', 'Chrome', 'Chromium']) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, candidate, app)
    if (value.out && !/^The folder|does not exist|not found/i.test(value.out)) {
      console.log(`  ${folder}/${candidate} -> ${value.out.length} chars`)
    }
  }
}

run(svc, obj, `${iface}.close`, handle, 'false', app)
