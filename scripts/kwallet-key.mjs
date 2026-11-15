#!/usr/bin/env node
/**
 * Reads the Chrome cookie key out of KWallet.
 *
 * KDE keeps it in kwalletd, not in gnome-keyring, so `secret-tool` finds
 * nothing even with the wallet unlocked. This also tries the argument orders
 * `kwallet-query` accepts, because `-f` before or after the entry is not
 * interchangeable across versions.
 *
 *   node scripts/kwallet-key.mjs           # probe
 *   node scripts/kwallet-key.mjs --print   # show the key
 */
import { spawnSync } from 'node:child_process'

const print = process.argv.includes('--print')
const wallets = ['kdewallet', 'kdewallet5']
const folders = ['', 'Passwords', 'chrome', 'Chrome']
const entries = ['Chrome Safe Storage', 'Chrome', 'Chromium Safe Storage', 'Chromium']

const run = (...args) => {
  const result = spawnSync('kwallet-query', args, { encoding: 'utf8' })
  return { out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim(), code: result.error?.code ?? result.status }
}

for (const wallet of wallets) {
  for (const folder of folders) {
    const list = run('-l', ...(folder ? ['-f', folder] : []), wallet)
    if (list.code === 'ENOENT') {
      console.log('kwallet-query MISSING (apt install kwalletmanager)')
      process.exit(0)
    }
    if (!list.out) {
      if (list.err) console.log(`wallet ${wallet} folder ${JSON.stringify(folder)}: ${list.err.split('\n')[0]}`)
      continue
    }
    console.log(`wallet ${wallet} folder ${JSON.stringify(folder)}: ${list.out.split('\n').filter(Boolean).length} entries`)
    for (const entry of entries) {
      if (!list.out.includes(entry)) continue
      const variants = [
        ['-r', entry, ...(folder ? ['-f', folder] : []), wallet],
        ['-r', entry, wallet, ...(folder ? ['-f', folder] : [])],
        [...(folder ? ['-f', folder] : []), '-r', entry, wallet],
      ]
      for (const args of variants) {
        const read = run(...args)
        console.log(`  read ${JSON.stringify(entry)} via ${args.join(' ')} -> ${read.out ? `${read.out.length} chars` : `none (${read.err.split('\n')[0] || read.code})`}`)
        if (read.out) {
          if (print) console.log(`  value: ${JSON.stringify(read.out)}`)
          break
        }
      }
    }
  }
}
