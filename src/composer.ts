type Disableable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement

/** Reversible busy state: intentionally disabled inputs stay disabled afterward. */
export function createComposerControls(options: { root: HTMLElement; inert?: HTMLElement[] }) {
  let busy = false
  let disabled: Array<[Disableable, boolean]> = []
  let inert: Array<[HTMLElement, boolean]> = []
  let aria: string | null = null
  const setBusy = (value: boolean): void => {
    if (value === busy) return
    busy = value
    if (value) {
      aria = options.root.getAttribute('aria-busy')
      options.root.setAttribute('aria-busy', 'true')
      disabled = Array.from(options.root.querySelectorAll<Disableable>('input,button,textarea,select'), (control) => [control, control.disabled])
      inert = (options.inert ?? []).map((element) => [element, element.inert])
      disabled.forEach(([control]) => { control.disabled = true })
      inert.forEach(([element]) => { element.inert = true })
    } else {
      disabled.forEach(([control, previous]) => { control.disabled = previous })
      inert.forEach(([element, previous]) => { element.inert = previous })
      if (aria === null) options.root.removeAttribute('aria-busy')
      else options.root.setAttribute('aria-busy', aria)
      disabled = []; inert = []
    }
  }
  return { setBusy, isBusy: () => busy, dispose: () => setBusy(false) }
}
