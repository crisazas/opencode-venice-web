#!/usr/bin/env node
// Lista las carpetas reales de cada wallet y sus entradas.
import { spawnSync } from 'node:child_process'
const run = (...args) => {
  const r = spawnSync('kwallet-query', args, { encoding: 'utf8' })
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status }
}
for (const wallet of ['kdewallet', 'kdewallet5']) {
  const all = run('-l', wallet)
  console.log(`wallet ${wallet} code ${all.code} stdout ${JSON.stringify(all.out)}`)
  for (const folder of ['Passwords', 'Chrome', 'chrome', 'Form Data', 'Cookies', 'kdewallet', '']) {
    const r = run('-l', ...(folder ? ['-f', folder] : []), wallet)
    console.log(`  folder ${JSON.stringify(folder)} -> code ${r.code} ${JSON.stringify(r.out)}`)
  }
}
