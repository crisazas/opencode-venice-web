import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BROWSERS, findCookies, clientFromString } from '../src/lib/cookies.mjs'

const hasSecretTool = () => {
  try {
    execFileSync('secret-tool', ['--help'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Runs `fn` with HOME and TMPDIR pointed at an empty dir, so stray real profiles do not leak in. */
function sandboxed(fn) {
  const home = mkdtempSync(path.join(tmpdir(), 'venice-home-'))
  const previous = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }
  process.env.HOME = home
  process.env.TMPDIR = home
  try {
    return fn(home)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('every supported browser has the fields readFromBrowser needs', () => {
  for (const browser of Object.values(BROWSERS)) {
    assert.ok(browser.linux && browser.label)
  }
})

test('a profile without a cookie DB is reported as a missing cookie, not a crash', () => {
  sandboxed((home) => {
    // An empty Chrome profile dir: no Cookies file at all.
    mkdirSync(path.join(home, '.config', 'google-chrome', 'Default'), { recursive: true })
    assert.throws(() => findCookies({ browser: 'chrome' }), /no venice.ai cookie/)
    assert.throws(() => findCookies({ browser: 'chrome' }), (error) => !/ENOENT/.test(error.message))
  })
})

test('an unreadable cookie DB names the browser and keeps trying the rest', () => {
  sandboxed((home) => {
    // A Cookies file that is not SQLite: sqlite3 must be invoked and fail cleanly.
    const dir = path.join(home, '.config', 'google-chrome', 'Default')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'Cookies'), 'not a database')
    assert.throws(() => findCookies(), (error) => {
      assert.match(error.message, /Chrome: /)
      return true
    })
  })
})

test('--user-data-dir is used as the profile root, without the browser dir under it', () => {
  sandboxed((home) => {
    const dir = path.join(home, 'perfil-ajeno')
    mkdirSync(path.join(dir, 'Default'), { recursive: true })
    writeFileSync(path.join(dir, 'Default', 'Cookies'), 'not a database')
    // The DB is reached, so the failure is about SQLite, not "no cookie".
    assert.throws(() => findCookies({ browser: 'chrome', userDataDir: dir }), /Chrome: SQLITE_NOTADB|Chrome: /)
    assert.throws(() => findCookies({ browser: 'chrome', userDataDir: dir }), (error) => !/no venice.ai cookie/.test(error.message))
  })
})

test('a profile dir outside ~/.config is found by name', () => {
  sandboxed((home) => {
    const dir = path.join(home, 'chrome-perfil')
    mkdirSync(path.join(dir, 'Default'), { recursive: true })
    writeFileSync(path.join(dir, 'Default', 'Cookies'), 'not a database')
    assert.throws(() => findCookies({ browser: 'chrome' }), (error) => !/no venice.ai cookie/.test(error.message))
  })
})

test('a v11 cookie without secret-tool says so instead of "no cookie"', () => {
  sandboxed((home) => {
    // v11 rows are keyring-encrypted; without secret-tool `peanuts` cannot open them.
    const dir = path.join(home, '.config', 'google-chrome', 'Default')
    mkdirSync(dir, { recursive: true })
    const db = path.join(dir, 'Cookies')
    execFileSync('sqlite3', [db, 'create table cookies (host_key text, name text, encrypted_value blob);'])
    const payload = Buffer.concat([Buffer.from('v11'), Buffer.alloc(64, 7)])
    execFileSync('sqlite3', [db, `insert into cookies values ('.clerk.venice.ai', '__client', x'${payload.toString('hex')}');`])
    if (hasSecretTool()) return // a real keyring would decrypt it, so only assert the no-tool path
    assert.throws(() => findCookies({ browser: 'chrome' }), /secret-tool is missing/)
    assert.throws(() => findCookies({ browser: 'chrome' }), (error) => !/no venice.ai cookie/.test(error.message))
  })
})

test('clientFromString accepts a raw value, a Cookie header and a JSON export', () => {
  assert.equal(clientFromString('abc123'), 'abc123')
  assert.equal(clientFromString('foo=1; __client=abc123; bar=2'), 'abc123')
  assert.equal(clientFromString('Cookie: __client=abc123'), 'abc123')
  assert.equal(clientFromString(JSON.stringify([{ name: '__client', value: 'abc123' }])), 'abc123')
  assert.throws(() => clientFromString('foo=1'), /no __client cookie/)
})
