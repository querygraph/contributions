export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function imageSource(value: string): boolean {
  try { return ['https:', 'http:'].includes(new URL(value, 'https://local.invalid').protocol) } catch { return false }
}
export function renderPhoto(photo: { imageUrl?: string | null; imageAlt?: string | null }, options: { className: string; defaultAlt: string }): string {
  if (!photo.imageUrl || !imageSource(photo.imageUrl)) return ''
  return `<figure class="${escapeHtml(options.className)}"><img src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.imageAlt || options.defaultAlt)}" loading="lazy" decoding="async"></figure>`
}
export function renderAuthor(author: { name: string; avatar?: boolean }, options: { className?: string } = {}): string {
  const avatar = author.avatar ? `<span class="avatar" aria-hidden="true">${escapeHtml(Array.from(author.name)[0]?.toUpperCase() ?? '')}</span>` : ''
  return `${avatar}<span${options.className ? ` class="${escapeHtml(options.className)}"` : ''}>${escapeHtml(author.name)}</span>`
}
export function relativeDate(value: string, options: { now?: number; locale?: string; recentLabel?: string } = {}): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const days = Math.max(0, Math.floor(((options.now ?? Date.now()) - date.getTime()) / 86_400_000))
  if (days === 0) return options.recentLabel ?? 'today'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(options.locale ?? 'en-US', { month: 'short', day: 'numeric' })
}

/** Render actual and editorial counts separately; apps choose their own labels. */
export function renderReactionCount(counts: { members: number; editorial?: number }, labels: { members: string; editorial: string }): string {
  const count = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const parts = [`${count(counts.members)} ${escapeHtml(labels.members)}`]
  if (counts.editorial) parts.push(`${count(counts.editorial)} ${escapeHtml(labels.editorial)}`)
  return parts.join(' · ')
}
