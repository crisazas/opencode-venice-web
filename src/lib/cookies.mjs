/**
 * Browser cookie extraction.
 *
 * Venice web auth is a long-lived Clerk `__client` cookie. Chromium based
 * browsers encrypt cookies with a key stored in the OS keychain, so we read the
 * key, decrypt the cookie, and stop there - nothing is written back to the
 * browser and no password is stored.
 *
 * Supported automatically: Brave, Chrome, Edge, Chromium on macOS (Keychain) and
 * Linux (secret-tool / gnome-keyring, falling back to the well-known "peanuts"
 * password used when no keyring is available). Anything else can be passed with
 * `--cookie` + `--ua`.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

export const BROWSERS = {
  brave: { mac: 'BraveSoftware/Brave-Browser', linux: 'BraveSoftware/Brave-Browser', app: '/Applications/Brave Browser.app', keychain: 'Brave Safe Storage', secret: ['application', 'brave'], label: 'Brave' },
  chrome: { mac: 'Google/Chrome', linux: 'google-chrome', app: '/Applications/Google Chrome.app', keychain: 'Chrome Safe Storage', secret: ['application', 'chrome'], label: 'Chrome' },
  edge: { mac: 'Microsoft Edge', linux: 'microsoft-edge', app: '/Applications/Microsoft Edge.app', keychain: 'Microsoft Edge Safe Storage', secret: ['application', 'chrome'], label: 'Edge' },
  chromium: { mac: 'Chromium', linux: 'chromium', app: '/Applications/Chromium.app', keychain: 'Chromium Safe Storage', secret: ['application', 'chromium'], label: 'Chromium' },
}

const COOKIE_HOSTS = ['.clerk.venice.ai', 'clerk.venice.ai', '.venice.ai', 'venice.ai']

const NO_SECRET_TOOL =
  'secret-tool is missing, so the keyring key cannot be read (install libsecret-tools), or pass --cookie/--ua'

const NO_KEYRING_ITEM =
  'the cookie is keyring-encrypted but no keyring key was found (unlock the keyring in your desktop session; on KDE also try `kwallet-query -l kdewallet`), or pass --cookie/--ua'

const profiles = (name) => (name ? [name] : ['Default', 'Profile 1', 'Profile 2', 'Profile 3'])

/**
 * True when the profile DB was encrypted by this browser family. Every Chromium
 * build writes `v10`/`v11` there, and the family is settled by whether the
 * cookie actually decrypts, so a loose match is fine.
 */
function sameProduct(dir, browser) {
  try {
    const db = path.join(dir, 'Default', 'Cookies')
    if (!existsSync(db)) return false
    const hex = execFileSync(
      'sqlite3',
      [db, "select hex(encrypted_value) from cookies where name='__client' limit 1;"],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (!hex) return false
    return /^(763130|763131)/.test(hex) // "v10" / "v11"
  } catch {
    return false
  }
}

/**
 * Profile dirs that sit outside the usual `~/.config/<browser>`: a Chrome
 * launched headless or with `--user-data-dir` keeps its profile elsewhere
 * (often under the temp dir), and those still hold a usable cookie.
 */
export function strayProfileDirs(browser) {
  const dirs = []
  // Only dirs that look like a profile of this browser: a matching name, or a
  // `__client` cookie encrypted in the Chromium `v10`/`v11` format. The label is
  // cosmetic; whether the cookie decrypts is what decides.
  const wanted = browser.linux.split('/').pop().toLowerCase().replace(/-stable$/, '')
  // Loose alias so a temp `chrome-perfil` matches Chrome without matching every family.
  const alias = wanted.replace(/^google-/, '').replace(/-browser$/, '')
  const roots = [path.join(homedir(), '.config'), tmpdir(), path.join(tmpdir(), 'opencode')]
  const isProfile = (dir) =>
    existsSync(path.join(dir, 'Default', 'Cookies')) || existsSync(path.join(dir, 'Local State'))
  for (const root of roots) {
    let entries = []
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, entry.name)
      if (!isProfile(dir)) continue
      const named = entry.name.toLowerCase()
      // `~/.config/<exact browser dir>` is already covered by the caller; only
      // keep same-family strays here (e.g. `google-chrome-headless`, a temp
      // `chrome-perfil`, or a Brave profile under /tmp/opencode).
      if (named.includes(alias) || sameProduct(dir, browser)) dirs.push(dir)
    }
  }
  return dirs
}

/**
 * Profile roots a browser may use, in the order they are tried. `userDataDir`
 * (from `--user-data-dir`) wins outright: headless and portable Chrome installs
 * keep the cookie DB somewhere else entirely, and guessing around it is useless.
 */
export function candidatePaths(browser, profile, userDataDir) {
  const home = homedir()
  const base = userDataDir ? [path.resolve(userDataDir.replace(/^~(?=$|\/)/, home))] : null
  if (process.platform === 'darwin') {
    const root = path.join(home, 'Library', 'Application Support', browser.mac)
    const dirs = base ?? [root]
    return dirs.flatMap((dir) => profiles(profile).map((name) => path.join(dir, name, 'Cookies')))
  }
  // `userDataDir` is already the profile root; without it, the browser dir sits under ~/.config.
  const dirs = base ?? [path.join(home, '.config', browser.linux), path.join(home, '.var', 'app', browser.linux)]
  // Chrome started headless (`--headless=new`) keeps a separate profile dir, and
  // a custom `--user-data-dir` may be anywhere (temp dir, /tmp/opencode, ...).
  if (!base) dirs.push(path.join(home, '.config', `${browser.linux}-headless`), ...strayProfileDirs(browser))
  const out = []
  for (const dir of dirs) for (const prof of profiles(profile === 'Default' ? undefined : profile)) {
    out.push(path.join(dir, prof, 'Cookies'))
    out.push(path.join(dir, `${prof}-Cookies`))
  }
  return out
}

/**
 * Every key worth trying for a cookie DB, in order: the macOS Keychain, the
 * Linux keyring under each plausible label, KWallet on KDE, then the
 * no-keyring default.
 *
 * Labels differ per desktop and browser build, KDE keeps the key in kwalletd
 * rather than in gnome-keyring, and a closed wallet makes every lookup return
 * nothing at all, so all of them are attempted and the caller keeps whichever
 * one actually decrypts.
 */
function candidateKeys(browser) {
  if (process.platform === 'darwin') {
    return [execFileSync('security', ['find-generic-password', '-s', browser.keychain, '-w'], { encoding: 'utf8' }).trim()]
  }
  const keys = []
  const labels = [browser.secret, ['application', 'chrome'], ['application', 'chromium'], ['application', browser.keychain], ['xdg:schema', 'chrome_libsecret_os_crypt_password_v2']]
  let tool = true
  for (const label of labels) {
    try {
      const value = execFileSync('secret-tool', ['lookup', ...label], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (value) keys.push(value)
    } catch (error) {
      if (error?.code === 'ENOENT') tool = false
    }
  }
  keys.push(...kwalletKeys(browser))
  keys.push('peanuts')
  return { keys, tool }
}

/**
 * Keys held by KWallet, which is where KDE sessions keep the browser secret.
 * `kwallet-query -l` names the entries of a folder, so the folders worth
 * looking at are the ones that list a browser entry. Reading takes the entry
 * and its folder before the wallet (`-r <entry> -f <folder> <wallet>`); the
 * other orders are tried too because they differ between versions.
 */
function kwalletKeys(browser) {
  const keys = []
  const entries = [`${browser.label} Safe Storage`, browser.label, 'Chrome', 'Chromium']
  const read = (args) => {
    try {
      const value = execFileSync('kwallet-query', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (value) keys.push(value)
    } catch {
      /* keep trying */
    }
  }
  for (const wallet of ['kdewallet', 'kdewallet5']) {
    for (const folder of ['', 'Passwords', 'chrome', 'Chrome']) {
      const folderArgs = folder ? ['-f', folder] : []
      let listing = ''
      try {
        listing = execFileSync('kwallet-query', ['-l', ...folderArgs, wallet], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!listing.includes(entry)) continue
        read(['-r', entry, ...folderArgs, wallet])
        if (!folder) continue
        read(['-r', entry, wallet, ...folderArgs])
        read([...folderArgs, '-r', entry, wallet])
      }
    }
  }
  return keys
}

function decrypt(value, key) {
  let payload = value
  const prefix = payload.subarray(0, 3).toString()
  if (prefix === 'v10' || prefix === 'v11') payload = payload.subarray(3)
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  let out = Buffer.concat([decipher.update(payload), decipher.final()])
  const pad = out[out.length - 1]
  if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad)
  // Chromium >= 130 prefixes the plaintext with a SHA256 of the host key.
  if (out.length > 32) {
    try {
      new TextDecoder('utf8', { fatal: true }).decode(out)
    } catch {
      out = out.subarray(32)
    }
  }
  return out.toString('utf8')
}

function browserUserAgent(browser) {
  if (process.platform === 'darwin') {
    const plist = path.join(browser.app, 'Contents', 'Info.plist')
    if (existsSync(plist)) {
      const version = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
      const major = version.split('.')[0] || '131'
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
    }
  }
  return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
}

/** True when a `sqlite3` binary is reachable; the cookie DB is SQLite. */
function hasSqlite() {
  try {
    execFileSync('sqlite3', ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] })
    return true
  } catch {
    return false
  }
}

function readFromBrowser(name, profile, userDataDir) {
  const browser = BROWSERS[name]
  const db = candidatePaths(browser, profile, userDataDir).find(existsSync)
  if (!db) return null
  // A profile can exist without ever having stored cookies; do not shell out for nothing.
  if (!hasSqlite()) throw new Error('sqlite3 not found; install it (e.g. `apt install sqlite3`) or pass --cookie/--ua')

  const { keys, tool } = candidateKeys(browser)
  const copy = path.join(mkdtempSync(path.join(tmpdir(), 'venice-cookie-')), 'Cookies')
  copyFileSync(db, copy)

  const rows = execFileSync(
    'sqlite3',
    [copy, '-json', `select host_key,name,hex(encrypted_value) as hex from cookies where host_key in (${COOKIE_HOSTS.map((h) => `'${h}'`).join(',')})`],
    { encoding: 'utf8' },
  )
  const parsed = rows.trim() ? JSON.parse(rows) : []
  let client = null
  let failure = null
  for (const row of parsed) {
    if (row.name !== '__client') continue
    const raw = Buffer.from(row.hex, 'hex')
    const prefix = raw.subarray(0, 3).toString()
    for (const password of keys) {
      const key = pbkdf2Sync(password, 'saltysalt', process.platform === 'darwin' ? 1003 : 1, 16, 'sha1')
      try {
        client = decrypt(raw, key)
        break
      } catch (error) {
        failure = error
        // `v11` is keyring-encrypted, so `peanuts` alone will never open it.
        if (prefix === 'v11' && password === 'peanuts') failure = new Error(tool ? NO_KEYRING_ITEM : NO_SECRET_TOOL)
      }
    }
    if (client) break
  }
  if (!client) {
    if (failure) throw failure
    return null
  }
  return { client, userAgent: browserUserAgent(browser), source: browser.label }
}

/** Tries the requested browsers (or all of them) in order. */
export function findCookies({ browser, profile, userDataDir } = {}) {
  const order = browser ? [browser] : ['brave', 'chrome', 'edge', 'chromium']
  const notes = []
  for (const name of order) {
    if (!BROWSERS[name]) throw new Error(`unknown browser: ${name} (expected ${Object.keys(BROWSERS).join(', ')})`)
    try {
      const found = readFromBrowser(name, profile, userDataDir)
      if (found) return found
      notes.push(`${BROWSERS[name].label}: no venice.ai cookie`)
    } catch (error) {
      notes.push(`${BROWSERS[name].label}: ${String(error.message).split('\n')[0]}`)
    }
  }
  throw new Error(
    `could not read browser cookies:\n  ${notes.join('\n  ')}\n` +
      'Sign in to venice.ai in a supported browser, or pass --cookie/--ua manually (see README, troubleshooting).',
  )
}

/** Parses a Cookie header or JSON export into a raw `__client` value. */
export function clientFromString(input) {
  const text = input.replace(/^cookie:\s*/i, '').trim()
  const match = /(?:^|;\s*)__client=([^;]+)/.exec(text)
  if (match) return match[1]
  // A bare value (no `=`, no `;`, not JSON) is already the cookie itself.
  if (text && !text.includes('=') && !/^[[{]/.test(text)) return text
  try {
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : parsed?.cookies
    const found = (list ?? []).find((cookie) => cookie?.name === '__client')
    if (found?.value) return found.value
  } catch {
    /* not JSON */
  }
  throw new Error('no __client cookie found in the given value (copy it from a clerk.venice.ai request)')
}
