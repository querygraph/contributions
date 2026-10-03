import { createHash } from 'node:crypto'

/** The app supplies its historical fixed-order material. Sorting keys here would
 * invalidate existing persisted fingerprints and break retry compatibility. */
export function fingerprintMaterial(material: unknown): string {
  const serialized = JSON.stringify(material)
  if (serialized === undefined) throw new TypeError('Creation intent must be JSON serializable.')
  return createHash('sha256').update(serialized).digest('hex')
}
export function assertReplayFingerprint(actual: unknown, expected: string, conflict: () => Error): void {
  if (typeof actual !== 'string' || actual !== expected) throw conflict()
}
