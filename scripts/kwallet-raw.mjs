#!/usr/bin/env node
// Salida cruda de kwallet-query, línea a línea con JSON, para ver el orden real.
import { spawnSync } from 'node:child_process'
const r = spawnSync('kwallet-query', ['-r', 'Chrome', '-f', 'Chrome', 'kdewallet'], { encoding: 'utf8' })
console.log('status', r.status)
console.log('STDOUT lines:', JSON.stringify((r.stdout ?? '').split('\n')))
console.log('STDERR lines:', JSON.stringify((r.stderr ?? '').split('\n')))
const v = (r.stdout ?? '').trim()
console.log('trimmed length', v.length, 'starts', JSON.stringify(v.slice(0, 10)))
