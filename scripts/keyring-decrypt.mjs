#!/usr/bin/env node
/**
 * Tries every plausible keyring lookup against one `__client` row and reports
 * which one opens it. Lengths and labels only, never key or cookie values.
 */
import { execFileSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'

const db = process.argv[2]
const hex = execFileSync('sqlite3', [db, "select hex(encrypted_value) from cookies where name='__client' limit 1;"], {
  encoding: 'utf8',
}).trim()
if (!hex) {
  console.log('no __client row')
  process.exit(0)
}
const raw = Buffer.from(hex, 'hex')
console.log('prefix:', raw.subarray(0, 3).toString(), 'bytes:', raw.length)

const lookups = [
  ['application', 'chrome'],
  ['application', 'brave'],
  ['application', 'chromium'],
]
const keys = []
for (const args of lookups) {
  try {
    const value = execFileSync('secret-tool', ['lookup', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (value) keys.push([args.join('='), value])
  } catch {
    /* no such item */
  }
}
keys.push(['literal:peanuts', 'peanuts'])
keys.push(['literal:empty', ''])

for (const [label, password] of keys) {
  try {
    const key = pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1')
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
    let out = Buffer.concat([decipher.update(raw.subarray(3)), decipher.final()])
    const pad = out[out.length - 1]
    if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad)
    const text = out.toString('utf8')
    console.log(`${label} (len ${password.length}) -> OK, plaintext ${text.length}, starts ${JSON.stringify(text.slice(0, 10))}`)
  } catch (error) {
    console.log(`${label} (len ${password.length}) -> FAIL ${error.code || error.message}`)
  }
}
