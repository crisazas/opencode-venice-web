#!/usr/bin/env node
/**
 * Tries the candidate Linux cookie keys against one `__client` row and reports
 * only whether each worked and how long the plaintext is - never the value.
 *
 *   node scripts/decrypt-probe.mjs ~/.config/google-chrome/Default/Cookies
 */
import { execFileSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'

const db = process.argv[2]
if (!db) {
  console.log('usage: node scripts/decrypt-probe.mjs <Cookies db>')
  process.exit(2)
}

const hex = execFileSync('sqlite3', [db, "select hex(encrypted_value) from cookies where name='__client' limit 1;"], {
  encoding: 'utf8',
}).trim()
if (!hex) {
  console.log('no __client row')
  process.exit(0)
}

const raw = Buffer.from(hex, 'hex')
const prefix = raw.subarray(0, 3).toString()
console.log('prefix:', prefix, 'bytes:', raw.length)
if (prefix !== 'v10' && prefix !== 'v11') {
  console.log('unexpected prefix; the key format may be different')
  process.exit(0)
}

for (const password of ['peanuts', '']) {
  try {
    const key = pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1')
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
    let out = Buffer.concat([decipher.update(raw.subarray(3)), decipher.final()])
    const pad = out[out.length - 1]
    if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad)
    const text = out.toString('utf8')
    console.log(`key ${JSON.stringify(password)} -> OK, plaintext ${text.length} chars, starts ${JSON.stringify(text.slice(0, 12))}`)
  } catch (error) {
    console.log(`key ${JSON.stringify(password)} -> FAIL ${error.message}`)
  }
}
