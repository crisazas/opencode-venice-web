#!/usr/bin/env node
// Lista carpetas de kdewallet por D-Bus (kwallet-query falla con -l).
import { spawnSync } from 'node:child_process'
const run = (...args) => {
  const r = spawnSync('qdbus', args, { encoding: 'utf8' })
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), code: r.status }
}
const svc = 'org.kde.kwalletd5'
const obj = '/modules/kwalletd5'
const iface = 'org.kde.KWallet'
const open = run(svc, obj, `${iface}.open`, 'kdewallet', '0', 'probe')
console.log('open ->', JSON.stringify(open.out), open.err)
const handle = open.out
if (!handle || handle === '-1') process.exit(0)
const folders = run(svc, obj, `${iface}.folderList`, handle, 'probe')
console.log('folderList ->', folders.out, folders.err)
for (const folder of folders.out.split(/\s+/).filter(Boolean)) {
  const entries = run(svc, obj, `${iface}.entryList`, handle, folder, 'probe')
  console.log(`  folder ${folder}: ${entries.out} ${entries.err}`)
  for (const entry of entries.out.split(/\s+/).filter(Boolean)) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, 'probe')
    console.log(`    ${entry} -> ${value.out.length} chars`)
  }
}
run(svc, obj, `${iface}.close`, handle, 'false', 'probe')
