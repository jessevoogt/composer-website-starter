type FocusTarget = HTMLElement | null | undefined

export interface FocusElementOptions {
  preventScroll?: boolean
  win?: Window
}

export interface FocusTextInputOptions extends FocusElementOptions {
  requireReliableAutofocus?: boolean
}

function isTextInputElement(target: FocusTarget): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

export function canAutoFocusTextInput(win: Window = window): boolean {
  return !win.matchMedia('(pointer: coarse)').matches && !win.matchMedia('(hover: none)').matches
}

export function focusElement(target: FocusTarget, options: FocusElementOptions = {}): boolean {
  if (!(target instanceof HTMLElement)) return false

  const { preventScroll = true, win = window } = options

  try {
    target.focus({ preventScroll })
  } catch {
    return false
  }

  return win.document.activeElement === target
}

export function focusTextInput(target: FocusTarget, options: FocusTextInputOptions = {}): boolean {
  if (!isTextInputElement(target)) return false

  const { requireReliableAutofocus = false, win = window, preventScroll = true } = options
  if (requireReliableAutofocus && !canAutoFocusTextInput(win)) return false

  return focusElement(target, { win, preventScroll })
}
