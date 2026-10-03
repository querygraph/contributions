export type PhotoSnapshot = { imageUrl: string | null; imageAlt: string | null }
export type PhotoMetadata = { sha256: string; contentType: string; width: number; height: number; bytes: number }

/** Exact digest path replay only; credentials, foreign hosts and query aliases
 * cannot impersonate the immutable object produced by this application. */
export function existingStoredPhotoUrl(value: string | null, pathname: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)
      && url.pathname === `/${pathname}` && !url.search && !url.hash && !url.username && !url.password ? value : null
  } catch { return null }
}

/** App callbacks own authorization, Verdun normalization, quota, storage and
 * atomic compare-and-swap. The final commit must recheck lifecycle/ownership. */
export async function updatePhoto<S extends PhotoSnapshot, P extends PhotoMetadata>(options: {
  payload: { remove?: unknown; imageDataUrl?: unknown }
  load(): Promise<S>
  normalize(): Promise<{ photo: P; alt: string | null }>
  pathname(photo: P, snapshot: S): string
  charge(): Promise<void>
  upload(pathname: string, photo: P): Promise<string>
  commit(snapshot: S, next: PhotoSnapshot): Promise<void>
  invalid(): Error
}): Promise<PhotoSnapshot & { photo: (P & { url: string; alt: string }) | null }> {
  const snapshot = await options.load()
  if ((options.payload.remove !== undefined && options.payload.remove !== true)
    || (options.payload.remove === true && options.payload.imageDataUrl !== undefined)) throw options.invalid()
  if (options.payload.remove === true) {
    const next = { imageUrl: null, imageAlt: null }
    await options.commit(snapshot, next)
    return { ...next, photo: null }
  }
  const { photo, alt } = await options.normalize()
  const pathname = options.pathname(photo, snapshot)
  let imageUrl = existingStoredPhotoUrl(snapshot.imageUrl, pathname)
  if (!imageUrl) {
    await options.charge()
    imageUrl = await options.upload(pathname, photo)
  }
  const next = { imageUrl, imageAlt: alt }
  await options.commit(snapshot, next)
  return { ...next, photo: { ...photo, url: imageUrl, alt: alt ?? '' } }
}
