export type PublicationStage = 'creating' | 'attaching' | 'removing' | 'complete'
export type PublicationAttachment<R, A> =
  | { kind: 'none' }
  | { kind: 'upload' | 'remove'; checkpoint(): void | Promise<void>; update(record: R): Promise<A> }

/** Invoked only after app consent/auth/locking. An uncertain create is resolved
 * by the app's account-scoped idempotent endpoint or a durable receipt. */
export async function runPublication<R, A = never>(options: {
  resolveRecord(): Promise<R>
  attachment: PublicationAttachment<R, A>
  onStage?(stage: PublicationStage): void
}): Promise<{ record: R; attachment: A | undefined }> {
  options.onStage?.('creating')
  const record = await options.resolveRecord()
  let result: A | undefined
  if (options.attachment.kind !== 'none') {
    // Persist uncertainty BEFORE network access. A later explicit omission must
    // remove a possibly committed photo instead of silently leaving it attached.
    await options.attachment.checkpoint()
    options.onStage?.(options.attachment.kind === 'upload' ? 'attaching' : 'removing')
    result = await options.attachment.update(record)
  }
  options.onStage?.('complete')
  return { record, attachment: result }
}
