import assert from 'node:assert/strict'
import test from 'node:test'
import { createDraftStore, shouldPromptDraft } from '../lib/drafts.js'
import { runPublication } from '../lib/publication.js'
import { updatePhoto, existingStoredPhotoUrl } from '../lib/attachments.js'
import { fingerprintMaterial, assertReplayFingerprint } from '../lib/idempotency.js'
import { createComposerControls } from '../lib/composer.js'
import { escapeHtml, renderPhoto, renderAuthor, renderReactionCount } from '../lib/presentation.js'

function memory(limit = Infinity) {
  const data = new Map()
  return {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (value.length > limit) throw new Error('quota'); data.set(key, value) },
    removeItem: key => data.delete(key),
  }
}
const decode = value => value?.version === 1 && typeof value.id === 'string' ? value : null
const store = createDraftStore({ key: 'one', decode, fallback: draft => draft.photo ? { ...draft, photo: null, omitted: true } : null })
const draft = { version: 1, id: 'draft-1', createdAt: 100, text: 'An experience', photo: null }

test('namespaces, old envelopes and quota fallback preserve recovery intent', () => {
  const storage = memory(250)
  const other = createDraftStore({ key: 'two', decode })
  assert.deepEqual(store.save(storage, { ...draft, photo: 'x'.repeat(400) }), { saved: true, fallbackUsed: true })
  assert.equal(store.read(storage).text, draft.text)
  assert.equal(store.read(storage).omitted, true)
  assert.equal(other.read(storage), null)
  assert.equal(store.clear(storage, 'different-draft'), false)
  assert.equal(store.read(storage).id, draft.id)
  assert.equal(store.clear(storage, draft.id), true)
  assert.equal(store.read(storage), null)
})

test('corrupt/private storage is recoverable and leases never replace server idempotency', () => {
  const storage = memory()
  storage.setItem('one', '{broken')
  assert.equal(store.read(storage), null)
  store.save(storage, draft)
  assert.ok(store.claim(storage, draft.id, 'tab-a', 100, 30))
  assert.equal(store.claim(storage, draft.id, 'tab-b', 120, 30), null)
  store.release(storage, draft.id, 'tab-b')
  assert.equal(store.read(storage).claim.owner, 'tab-a')
  assert.ok(store.claim(storage, draft.id, 'tab-b', 131, 30))
  store.release(storage, draft.id, 'tab-b')
  assert.equal(store.read(storage).claim, undefined)
  assert.equal(store.claim(storage, draft.id, 'tab-a', 100, -1), null)
  const blocked = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
  assert.equal(store.read(blocked), null)
  assert.equal(store.save(blocked, draft).saved, false)
})

test('storage notifications re-read current state and never publish', () => {
  const storage = memory()
  let listener
  const target = { localStorage: storage, addEventListener: (_, fn) => { listener = fn }, removeEventListener: (_, fn) => { assert.equal(listener, fn); listener = null } }
  const seen = []
  const stop = store.watch(value => seen.push(value), target)
  store.save(storage, { ...draft, id: 'newer' })
  listener({ key: 'two', storageArea: storage, newValue: null })
  listener({ key: 'one', storageArea: memory(), newValue: null })
  assert.equal(seen.length, 0)
  listener({ key: 'one', storageArea: storage, newValue: null })
  assert.equal(seen[0].id, 'newer')
  stop()
  assert.equal(listener, null)
  assert.equal(shouldPromptDraft(true, false, false), true)
  assert.equal(shouldPromptDraft(true, false, true), false)
})

test('publication checkpoints receipt and upload uncertainty before sending a photo', async () => {
  const order = []
  const state = { accountId: 'one', receipt: null, attempted: false }
  let creations = 0
  const resolveRecord = async () => {
    if (!state.receipt) { creations++; state.receipt = { id: 'record' }; order.push('receipt') }
    return state.receipt
  }
  await assert.rejects(runPublication({ resolveRecord, attachment: {
    kind: 'upload', checkpoint: () => { state.attempted = true; order.push('checkpoint') },
    update: async record => { assert.equal(record.id, 'record'); order.push('upload'); throw new Error('response lost') },
  } }), /response lost/)
  assert.deepEqual(order, ['receipt', 'checkpoint', 'upload'])
  const result = await runPublication({ resolveRecord, attachment: {
    kind: 'remove', checkpoint: () => assert.equal(state.attempted, true), update: async record => ({ id: record.id, removed: true }),
  } })
  assert.equal(result.attachment.removed, true)
  assert.equal(creations, 1)
})

test('failed creation/checkpoint cannot attach or report completion', async () => {
  let touched = false
  const attachment = { kind: 'upload', checkpoint() { throw new Error('checkpoint') }, update: async () => { touched = true } }
  await assert.rejects(runPublication({ resolveRecord: async () => { throw new Error('create') }, attachment }), /create/)
  await assert.rejects(runPublication({ resolveRecord: async () => ({}), attachment }), /checkpoint/)
  assert.equal(touched, false)
})

const photo = { sha256: 'a'.repeat(64), contentType: 'image/webp', width: 10, height: 10, bytes: 7 }
const path = `photos/test/one/${photo.sha256}.webp`
const photoUrl = `https://test.public.blob.vercel-storage.com/${path}`
function photoHarness() {
  let current = { imageUrl: null, imageAlt: null }
  let visible = true
  const events = []
  const options = {
    payload: { imageDataUrl: 'photo' },
    load: async () => { events.push('load'); if (!visible) throw new Error('unavailable'); return { ...current } },
    normalize: async () => { events.push('normalize'); return { photo, alt: 'description' } },
    pathname: () => path,
    charge: async () => { events.push('charge') },
    upload: async () => { events.push('upload'); return photoUrl },
    commit: async (snapshot, next) => {
      events.push('commit')
      if (!visible) throw new Error('unavailable')
      if (current.imageUrl !== snapshot.imageUrl || current.imageAlt !== snapshot.imageAlt) throw new Error('conflict')
      current = next
    },
    invalid: () => new Error('invalid'),
  }
  return { options, events, current: () => current, change: value => { current = value }, hide: () => { visible = false } }
}

test('photo upload/replay/removal share an ordered lifecycle', async () => {
  const h = photoHarness()
  const result = await updatePhoto(h.options)
  assert.deepEqual(h.events, ['load', 'normalize', 'charge', 'upload', 'commit'])
  assert.equal(result.photo.url, photoUrl)
  h.events.length = 0
  await updatePhoto(h.options)
  assert.deepEqual(h.events, ['load', 'normalize', 'commit'])
  h.events.length = 0
  await updatePhoto({ ...h.options, payload: { remove: true } })
  assert.deepEqual(h.events, ['load', 'commit'])
  assert.deepEqual(h.current(), { imageUrl: null, imageAlt: null })
})

test('authorization precedes decoding/quota and final lifecycle checks prevent revival', async () => {
  const denied = photoHarness(); denied.hide()
  await assert.rejects(updatePhoto(denied.options), /unavailable/)
  assert.deepEqual(denied.events, ['load'])
  const removed = photoHarness()
  await assert.rejects(updatePhoto({ ...removed.options, upload: async () => { removed.hide(); return photoUrl } }), /unavailable/)
  assert.equal(removed.current().imageUrl, null)
})

test('simultaneous photo and description edits conflict without erasing newer state', async () => {
  for (const replacement of [{ imageUrl: 'https://example.org/new.webp', imageAlt: 'new' }, { imageUrl: null, imageAlt: 'changed' }]) {
    const h = photoHarness()
    await assert.rejects(updatePhoto({ ...h.options, upload: async () => { h.change(replacement); return photoUrl } }), /conflict/)
    assert.deepEqual(h.current(), replacement)
  }
})

test('invalid removal and external replay URLs cannot bypass processing', async () => {
  for (const payload of [{ remove: false }, { remove: true, imageDataUrl: 'photo' }]) {
    const h = photoHarness()
    await assert.rejects(updatePhoto({ ...h.options, payload }), /invalid/)
    assert.deepEqual(h.events, ['load'])
  }
  assert.equal(existingStoredPhotoUrl(photoUrl, path), photoUrl)
  for (const value of [photoUrl + '?x=1', photoUrl + '#x', photoUrl.replace('https:', 'http:'), photoUrl.replace('test.public', 'evil.test.public'), photoUrl.replace('https://', 'https://user:pass@')]) {
    assert.equal(existingStoredPhotoUrl(value, path), null)
  }
})

test('historical fingerprint bytes and conflict errors are preserved', () => {
  const hash = fingerprintMaterial(['activity', 'concept', 'hello', '', '', true])
  assert.equal(hash, '09cd69c80d26af7966fba5ad7af18ad7094c8a829ff216e6960aa4125fded981')
  assertReplayFingerprint(hash, hash, () => new Error('conflict'))
  assert.throws(() => assertReplayFingerprint('different', hash, () => new Error('conflict')), /conflict/)
  assert.notEqual(fingerprintMaterial({ a: 1, b: 2 }), fingerprintMaterial({ b: 2, a: 1 }))
})

test('busy controls restore disabled/inert state and accessible status', () => {
  const controls = [{ disabled: false }, { disabled: true }]
  const inert = [{ inert: true }, { inert: false }]
  const attrs = new Map()
  const root = { querySelectorAll: () => controls, getAttribute: key => attrs.get(key) ?? null, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) }
  const ui = createComposerControls({ root, inert })
  ui.setBusy(true); ui.setBusy(true)
  assert.equal(attrs.get('aria-busy'), 'true')
  assert.deepEqual(controls.map(c => c.disabled), [true, true])
  ui.dispose()
  assert.deepEqual(controls.map(c => c.disabled), [false, true])
  assert.deepEqual(inert.map(c => c.inert), [true, false])
  assert.equal(attrs.has('aria-busy'), false)
})

test('presentation escapes authors/attributes and labels editorial counts separately', () => {
  assert.equal(escapeHtml('<a>"'), '&lt;a&gt;&quot;')
  assert.equal(renderPhoto({ imageUrl: 'javascript:alert(1)' }, { className: 'photo', defaultAlt: 'Photo' }), '')
  const html = renderPhoto({ imageUrl: 'https://example.com/p.webp', imageAlt: '"><script>' }, { className: 'photo', defaultAlt: 'Photo' })
  assert.ok(!html.includes('<script>'))
  assert.match(renderAuthor({ name: '<Alice>', avatar: true }), /&lt;Alice&gt;/)
  assert.equal(renderReactionCount({ members: 3, editorial: 8 }, { members: 'members', editorial: 'editorial' }), '3 members · 8 editorial')
})
