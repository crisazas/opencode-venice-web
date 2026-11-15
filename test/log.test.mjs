/**
 * The debug log must stay bounded: it is written on every turn and nothing else
 * trims it. See src/lib/log.mjs for the rotation.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'venice-log-'))
process.env.VENICE_WEB_CONFIG_DIR = dir
process.env.VENICE_WEB_DEBUG = '1'
process.env.VENICE_WEB_DEBUG_MAX_BYTES = '200'

const { debugRaw } = await import('../src/lib/log.mjs')
const logFile = path.join(dir, 'debug.log')
const rotated = `${logFile}.1`

test.after(() => rmSync(dir, { recursive: true, force: true }))

test('a small log is appended to, not rotated', () => {
  writeFileSync(logFile, 'x'.repeat(50))
  debugRaw('pequeno', 'y')
  assert.ok(statSync(logFile).size > 50)
  assert.equal(existsSync(rotated), false)
})

test('a log past the cap is renamed to .1 and a fresh one is started', () => {
  writeFileSync(logFile, 'x'.repeat(300))
  debugRaw('grande', 'y')
  assert.equal(readFileSync(rotated, 'utf8').length, 300)
  assert.match(readFileSync(logFile, 'utf8'), /grande/)
  assert.ok(statSync(logFile).size < 300)
})

test('the previous .1 is replaced, so only one generation is kept', () => {
  // after the previous test the live file holds the `grande` entry and .1 the old
  // filler; pushing the live file over the cap must move `grande` to .1
  const before = readFileSync(logFile, 'utf8')
  assert.match(before, /grande/)
  writeFileSync(logFile, before + 'x'.repeat(300))
  debugRaw('otra', 'z')
  assert.match(readFileSync(rotated, 'utf8'), /grande/)
  assert.match(readFileSync(logFile, 'utf8'), /otra/)
  assert.doesNotMatch(readFileSync(logFile, 'utf8'), /grande/)
})
