/**
 * Setup Wizard — entry point.
 *
 * Imports all modules (which register event listeners as side effects)
 * and initializes the wizard by navigating to the restored step.
 */

import { state } from './state'
import './events' // registers all event listeners as side effects
import { goToStep } from './navigation'

// ─── Initialize: restore saved step ──────────────────────────────────────────

goToStep(state.currentStep)
