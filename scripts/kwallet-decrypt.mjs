#!/usr/bin/env node
// Prueba la clave de KWallet contra la fila __client y dice si abre.
import { execFileSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const source = `${process.env.HOME}/.config/google-chrome/Default/Cookies`
const copy = path.join(mkdtempSync(path.join(tmpdir(), 'kw-')), 'Cookies')
copyFileSync(source, copy)
const hex = execFileSync('sqlite3', [copy, "select hex(encrypted_value) from cookies where name='__client' limit 1;"], { encoding: 'utf8' }).trim()
const raw = Buffer.from(hex, 'hex')
console.log('prefix', raw.subarray(0, 3).toString(), 'bytes', raw.length)

const key = execFileSync('kwallet-query', ['-r', 'Chrome', '-f', 'Chrome', 'kdewallet'], { encoding: 'utf8' }).trim()
console.log('kwallet key length', key.length, 'starts', JSON.stringify(key.slice(0, 6)))

for (const [name, password] of [['kwallet', key], ['peanuts', 'peanuts']]) {
  for (const iterations of [1, 1003]) {
    try {
      const derived = pbkdf2Sync(password, 'saltysalt', iterations, 16, 'sha1')
      const decipher = createDecipheriv('aes-128-cbc', derived, Buffer.alloc(16, 0x20))
      let out = Buffer.concat([decipher.update(raw.subarray(3)), decipher.final()])
      const pad = out[out.length - 1]
      if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad)
      console.log(`${name} iterations=${iterations} -> OK plaintext ${out.length}`)
    } catch (error) {
      console.log(`${name} iterations=${iterations} -> FAIL ${error.code ?? error.message}`)
    }
  }
}
