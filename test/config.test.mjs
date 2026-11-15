/**
 * `VENICE_WEB_DELEGATE` is the only knob over which tools the proxy hands to
 * Venice. `grep` is deliberately out of the default: its server counterpart
 * searches the conversation, not the file tree (docs/ADAPTING.md).
 */
import test from 'node:test'
import assert from 'node:assert/strict'

const list = async (value) => {
  if (value === undefined) delete process.env.VENICE_WEB_DELEGATE
  else process.env.VENICE_WEB_DELEGATE = value
  // the module reads the variable at import time, so each case needs a fresh one
  return (await import(`../src/lib/config.mjs?${value ?? 'unset'}-${Math.random()}`)).delegateTools
}

test('by default webfetch, read and bash are delegated, grep is not', async () => {
  assert.deepEqual(await list(undefined), ['webfetch', 'read', 'bash'])
  assert.deepEqual(await list(''), ['webfetch', 'read', 'bash'])
})

test('an explicit list replaces the default, grep included when asked for', async () => {
  assert.deepEqual(await list('grep'), ['grep'])
  assert.deepEqual(await list('webfetch,grep,read'), ['webfetch', 'grep', 'read'])
  assert.deepEqual(await list(' webfetch , grep '), ['webfetch', 'grep'])
})

test('0 and none turn delegation off', async () => {
  assert.deepEqual(await list('0'), [])
  assert.deepEqual(await list('none'), [])
})

test.after(() => delete process.env.VENICE_WEB_DELEGATE)
