/**
 * Tiny logger. Requests are logged in a compact, greppable form so users can
 * see exactly which tools the model asked for, and when a retry kicked in.
 */
import { appendFileSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import { configDir, debug, debugLogMaxBytes } from './config.mjs'

const stamp = () => new Date().toISOString()

export function log(...parts) {
  console.log(stamp(), ...parts)
}

export function warn(...parts) {
  console.warn(stamp(), ...parts)
}

export function fail(...parts) {
  console.error(stamp(), ...parts)
}

const debugLog = () => path.join(configDir, 'debug.log')

/**
 * One rotation step: `debug.log` becomes `debug.log.1` once it passes the cap,
 * and the previous `.1` is replaced. One generation is enough - the point is
 * keeping the file readable and bounded, not keeping history.
 */
function rotate() {
  try {
    if (statSync(debugLog()).size < debugLogMaxBytes) return
    renameSync(debugLog(), `${debugLog()}.1`)
  } catch {
    /* no file yet, or the rename lost a race: keep appending */
  }
}

/** Full raw model output, only when VENICE_WEB_DEBUG=1. */
export function debugRaw(label, text) {
  if (!debug) return
  try {
    rotate()
    appendFileSync(debugLog(), `\n===== ${stamp()} ${label}\n${text}\n`)
  } catch {
    /* logging must never break a request */
  }
}

export const preview = (value, length = 140) => JSON.stringify(String(value ?? '').slice(0, length))
