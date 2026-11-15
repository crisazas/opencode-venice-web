#!/usr/bin/env node
// Cartera kdewallet, carpeta "Chrome Keys", entradas Chrome*.
import { spawnSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const run = (...args) => {
  const r = spawnSync('qdbus', args, { encoding: 'utf8', timeout: 8000 })
  return (r.stdout ?? '').trim()
}
const svc = 'org.kde.kwalletd5'
const obj = '/modules/kwalletd5'
const iface = 'org.kde.KWallet'
const app = 'venice-check'

const handle = run(svc, obj, `${iface}.open`, 'kdewallet', '0', app)
console.log('open ->', JSON.stringify(handle))
if (!handle || handle === '-1') process.exit(0)

const folders = run(svc, obj, `${iface}.folderList`, handle, app)
console.log('folderList ->', JSON.stringify(folders))

const source = `${process.env.HOME}/.config/google-chrome/Default/Cookies`
const copy = path.join(mkdtempSync(path.join(tmpdir(), 'kc-')), 'Cookies')
copyFileSync(source, copy)
const hex = spawnSync('sqlite3', [copy, "select hex(encrypted_value) from cookies where name='__client' limit 1;"], { encoding: 'utf8' }).stdout.trim()
const raw = Buffer.from(hex, 'hex')

for (const folder of ['Chrome Keys', 'Chrome', 'Keys', '']) {
  for (const entry of ['Chrome Safe Storage', 'Chrome', 'Chromium']) {
    const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, app)
    const ok = value && !/^The folder|does not exist|not found|^Invalid/i.test(value)
    console.log(`  ${JSON.stringify(folder)}/${entry} -> ${ok ? `${value.length} chars` : 'none'}`)
    if (!ok) continue
    try {
      const key = pbkdf2Sync(value, 'saltysalt', 1, 16, 'sha1')
      const d = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
      let out = Buffer.concat([d.update(raw.subarray(3)), d.final()])
      const pad = out[out.length - 1]
      if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad)
      console.log(`    -> DECRYPT OK, plaintext ${out.length}`)
    } catch (e) {
      console.log('    -> decrypt FAIL', e.code)
    }
  }
}

run(svc, obj, `${iface}.close`, handle, 'false', app)
