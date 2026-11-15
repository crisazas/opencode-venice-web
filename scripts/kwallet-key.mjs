#!/usr/bin/env node
/**
 * Reads the Chrome cookie key out of KWallet over D-Bus.
 *
 * KDE keeps it in `kwalletd5`, not in gnome-keyring, so `secret-tool` finds
 * nothing even with the wallet unlocked. Prints the key length only unless
 * `--print` is passed.
 *
 *   node scripts/kwallet-key.mjs           # probe
 *   node scripts/kwallet-key.mjs --print   # show the key
 */
import { execFileSync } from 'node:child_process'

const print = process.argv.includes('--print')
const wallets = ['kdewallet', 'kdewallet5', 'Chrome Safe Storage', 'Chromium Safe Storage']
const folders = ['', 'Passwords', 'chrome', 'Chrome']
const entries = ['Chrome Safe Storage', 'Chromium Safe Storage', 'Chrome']

const run = (bin, args) => {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    return ''
  }
}

for (const wallet of wallets) {
  for (const folder of folders) {
    const listing = run('kwallet-query', ['-l', ...(folder ? ['-f', folder] : []), wallet])
    if (!listing) continue
    console.log(`wallet ${JSON.stringify(wallet)} folder ${JSON.stringify(folder)}: ${listing.split('\n').filter(Boolean).length} entries`)
    for (const entry of entries) {
      if (!listing.includes(entry)) continue
      const value = run('kwallet-query', ['-r', entry, ...(folder ? ['-f', folder] : []), wallet])
      if (!value) continue
      console.log(`  ${entry} -> ${value.length} chars`)
      if (print) console.log(`  value: ${JSON.stringify(value)}`)
    }
  }
}

const objects = run('qdbus', [])
if (objects.includes('kwallet')) console.log('kwalletd present on the session bus')
else console.log('kwalletd NOT on the session bus')
