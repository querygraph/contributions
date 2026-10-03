export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type DraftLease = { owner: string; expiresAt: number }
export type DraftEnvelope = { id: string; createdAt: number; claim?: DraftLease }
export type DraftSaveResult = { saved: boolean; fallbackUsed: boolean }
export type DraftStorageEvent = { key: string | null; newValue: string | null; storageArea: DraftStorage | null }
export type DraftEventTarget = {
  localStorage: DraftStorage
  addEventListener(type: 'storage', callback: (event: DraftStorageEvent) => void): void
  removeEventListener(type: 'storage', callback: (event: DraftStorageEvent) => void): void
}

export const DRAFT_CONFIRM_AFTER_MS = 24 * 60 * 60 * 1_000
export function needsDraftConfirmation(draft: Pick<DraftEnvelope, 'createdAt'>, now = Date.now(), afterMs = DRAFT_CONFIRM_AFTER_MS): boolean {
  return now - draft.createdAt >= afterMs
}
export function shouldPromptDraft(hasDraft: boolean, composerOpen: boolean, submissionActive: boolean): boolean {
  return hasDraft && !composerOpen && !submissionActive
}
export function bestEffortStorageWrite(storage: Pick<DraftStorage, 'setItem'> | null, key: string, value: string): boolean {
  try { if (!storage) return false; storage.setItem(key, value); return true } catch { return false }
}

/** Codecs and namespaces belong to the app so existing drafts survive upgrades. */
export function createDraftStore<D extends { id: string; claim?: DraftLease }>(options: {
  key: string
  decode(value: unknown): D | null
  fallback?(draft: D): D | null
  acceptClaimSave?(result: DraftSaveResult): boolean
}) {
  const parse = (raw: string): D | null => {
    try { return options.decode(JSON.parse(raw)) } catch { return null }
  }
  const read = (storage: DraftStorage): D | null => {
    try { const raw = storage.getItem(options.key); return raw ? parse(raw) : null } catch { return null }
  }
  const write = (storage: DraftStorage, draft: D): boolean => {
    try { return bestEffortStorageWrite(storage, options.key, JSON.stringify(draft)) } catch { return false }
  }
  const save = (storage: DraftStorage, draft: D): DraftSaveResult => {
    if (write(storage, draft)) return { saved: true, fallbackUsed: false }
    const fallback = options.fallback?.(draft)
    return { saved: fallback ? write(storage, fallback) : false, fallbackUsed: Boolean(fallback) }
  }
  const claim = (storage: DraftStorage, id: string, owner: string, now = Date.now(), leaseMs = 30_000): D | null => {
    if (!owner.trim() || !Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0) return null
    const current = read(storage)
    if (!current || current.id !== id || (current.claim && current.claim.owner !== owner && current.claim.expiresAt > now)) return null
    const result = save(storage, { ...current, claim: { owner, expiresAt: now + leaseMs } })
    if (!(options.acceptClaimSave?.(result) ?? result.saved)) return null
    const confirmed = read(storage)
    return confirmed?.id === id && confirmed.claim?.owner === owner ? confirmed : null
  }
  const release = (storage: DraftStorage, id: string, owner: string): void => {
    const current = read(storage)
    if (!current || current.id !== id || current.claim?.owner !== owner) return
    const { claim: _claim, ...released } = current
    save(storage, released as D)
  }
  const clear = (storage: DraftStorage, expectedId: string): boolean => {
    if (read(storage)?.id !== expectedId) return false
    try { storage.removeItem(options.key); return true } catch { return false }
  }
  const watch = (callback: (draft: D | null) => void, target: DraftEventTarget = globalThis as unknown as DraftEventTarget): (() => void) => {
    const listener = (event: DraftStorageEvent): void => {
      if (event.key !== options.key && event.key !== null) return
      try { if (event.storageArea && event.storageArea !== target.localStorage) return } catch { return }
      // A localStorage.clear() notification has no value. Always re-read to avoid
      // treating a queued stale event as current state or clearing a newer draft.
      try { callback(read(target.localStorage)) } catch { return }
    }
    target.addEventListener('storage', listener)
    return () => target.removeEventListener('storage', listener)
  }
  return { parse, read, save, claim, release, clear, watch }
}
