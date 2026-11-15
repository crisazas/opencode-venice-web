import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BROWSERS, findCookies, clientFromString } from '../src/lib/cookies.mjs'

test('every supported browser has the fields readFromBrowser needs', () => {
  for (const browser of Object.values(BROWSERS)) {
    assert.ok(browser.linux && browser.label)
  }
})

test('a profile without a cookie DB is reported as a missing cookie, not a crash', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'venice-home-'))
  const previous = process.env.HOME
  process.env.HOME = home
  try {
    // An empty Chrome profile dir: no Cookies file at all.
    mkdirSync(path.join(home, '.config', 'google-chrome', 'Default'), { recursive: true })
    assert.throws(() => findCookies({ browser: 'chrome' }), /no venice.ai cookie/)
    assert.throws(() => findCookies({ browser: 'chrome' }), (error) => !/ENOENT/.test(error.message))
  } finally {
    if (previous === undefined) delete process.env.HOME
    else process.env.HOME = previous
  }
})

test('an unreadable cookie DB names the browser and keeps trying the rest', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'venice-home-'))
  const previous = process.env.HOME
  process.env.HOME = home
  try {
    // A Cookies file that is not SQLite: sqlite3 must be invoked and fail cleanly.
    const dir = path.join(home, '.config', 'google-chrome', 'Default')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'Cookies'), 'not a database')
    assert.throws(() => findCookies(), (error) => {
      assert.match(error.message, /Chrome: /)
      return true
    })
  } finally {
    if (previous === undefined) delete process.env.HOME
    else process.env.HOME = previous
  }
})

test('clientFromString accepts a raw value, a Cookie header and a JSON export', () => {
  assert.equal(clientFromString('abc123'), 'abc123')
  assert.equal(clientFromString('foo=1; __client=abc123; bar=2'), 'abc123')
  assert.equal(clientFromString('Cookie: __client=abc123'), 'abc123')
  assert.equal(clientFromString(JSON.stringify([{ name: '__client', value: 'abc123' }])), 'abc123')
  assert.throws(() => clientFromString('foo=1'), /no __client cookie/)
})
