#!/usr/bin/env node
// ¿Devuelve KWallet la clave ya desbloqueado? Y ¿abre la fila?
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

for (const wallet of ['kdewallet', 'Chrome Keys']) {
  const handle = run(svc, obj, `${iface}.open`, wallet, '0', 'check')
  console.log(`wallet ${JSON.stringify(wallet)} open -> ${JSON.stringify(handle)}`)
  if (!handle || handle === '-1') continue
  const folders = run(svc, obj, `${iface}.folderList`, handle, 'check')
  console.log('  folderList ->', JSON.stringify(folders))
  for (const folder of ['Chrome', 'Keys', '']) {
    for (const entry of ['Chrome', 'Chrome Safe Storage']) {
      const value = run(svc, obj, `${iface}.readPassword`, handle, folder, entry, 'check')
      const ok = value && !/^The folder|does not exist|not found|^Invalid/i.test(value)
      console.log(`  ${JSON.stringify(folder)}/${entry} -> ${ok ? `${value.length} chars` : 'none'}`)
      if (ok) {
        const source = `${process.env.HOME}/.config/google-chrome/Default/Cookies`
        const copy = path.join(mkdtempSync(path.join(tmpdir(), 'kc-')), 'Cookies')
        copyFileSync(source, copy)
        const hex = spawnSync('sqlite3', [copy, "select hex(encrypted_value) from cookies where name='__client' limit 1;"], { encoding: 'utf8' }).stdout.trim()
        const raw = Buffer.from(hex, 'hex')
        try {
          const key = pbkdf2Sync(value, 'saltysalt', 1, 16, 'sha1')
          const d = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
          let out = Buffer.concat([d.update(raw.subarray(3)), d.final()])
          const pad = out[out.length - 1]
          if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad)
          console.log(`  -> DECRYPT OK, plaintext ${out.length}`)
        } catch (e) {
          console.log('  -> decrypt FAIL', e.code)
        }
      }
    }
  }
  run(svc, obj, `${iface}.close`, handle, 'false', 'check')
}
