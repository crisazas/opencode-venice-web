#!/usr/bin/env node
// Replica exacta de kwalletKeys() del login, con trazas por paso.
import { execFileSync } from 'node:child_process'

const label = process.argv[2] ?? 'Chrome'
const entries = [`${label} Safe Storage`, label, 'Chrome', 'Chromium']
const keys = []
for (const wallet of ['kdewallet', 'kdewallet5']) {
  for (const folder of ['', 'Passwords', 'chrome', 'Chrome']) {
    const folderArgs = folder ? ['-f', folder] : []
    let listing = ''
    try {
      listing = execFileSync('kwallet-query', ['-l', ...folderArgs, wallet], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (error) {
      console.log(`${wallet}/${JSON.stringify(folder)} list FAIL ${error.code ?? error.status}`)
      continue
    }
    console.log(`${wallet}/${JSON.stringify(folder)} listing ${JSON.stringify(listing)}`)
    for (const entry of entries) {
      if (!listing.includes(entry)) { console.log(`  skip ${entry} (not in listing)`); continue }
      for (const args of [['-r', entry, ...folderArgs, wallet], ['-r', entry, wallet, ...folderArgs], [...folderArgs, '-r', entry, wallet]]) {
        try {
          const value = execFileSync('kwallet-query', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
          console.log(`  ${args.join(' ')} -> ${value.length} chars`)
          if (value) keys.push(value)
        } catch (error) {
          console.log(`  ${args.join(' ')} -> FAIL ${error.code ?? error.status}`)
        }
      }
    }
  }
}
console.log('total keys', keys.length, 'longitudes', keys.map((k) => k.length))
