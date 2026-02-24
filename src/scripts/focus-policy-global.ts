import { canAutoFocusTextInput, focusElement, focusTextInput } from './focus-policy'
import type { FocusElementOptions, FocusTextInputOptions } from './focus-policy'

interface FocusPolicyWindow extends Window {
  __siteFocusPolicy?: {
    canAutoFocusTextInput: () => boolean
    focusElement: (target: HTMLElement | null | undefined, options?: Omit<FocusElementOptions, 'win'>) => boolean
    focusTextInput: (target: HTMLElement | null | undefined, options?: Omit<FocusTextInputOptions, 'win'>) => boolean
  }
}

const focusPolicyWindow = window as FocusPolicyWindow
focusPolicyWindow.__siteFocusPolicy ??= {
  canAutoFocusTextInput: () => canAutoFocusTextInput(focusPolicyWindow),
  focusElement: (target, options = {}) => focusElement(target, { ...options, win: focusPolicyWindow }),
  focusTextInput: (target, options = {}) => focusTextInput(target, { ...options, win: focusPolicyWindow }),
}
