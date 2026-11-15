/**
 * An image turn has to reach a model that reads images, whatever the client
 * picked. The choice lives in `IMAGE_MODEL` and `VENICE_WEB_IMAGE_MODEL`
 * overrides it (0 keeps the client's own model).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { MODELS, IMAGE_MODEL } from '../src/lib/models.mjs'

const imageModel = async (value) => {
  if (value === undefined) delete process.env.VENICE_WEB_IMAGE_MODEL
  else process.env.VENICE_WEB_IMAGE_MODEL = value
  return (await import(`../src/lib/config.mjs?img=${value ?? 'unset'}-${Math.random()}`)).imageModel
}

test('the default image model is a catalogue model', () => {
  assert.ok(MODELS[IMAGE_MODEL], `${IMAGE_MODEL} is not in the catalogue`)
})

test('it defaults to the image model, not to the client choice', async () => {
  assert.equal(await imageModel(undefined), IMAGE_MODEL)
  assert.equal(await imageModel(''), IMAGE_MODEL)
})

test('the variable overrides it and 0 keeps the client model', async () => {
  assert.equal(await imageModel('qwen-3-8-27b'), 'qwen-3-8-27b')
  assert.equal(await imageModel('0'), null)
})

test.after(() => delete process.env.VENICE_WEB_IMAGE_MODEL)
