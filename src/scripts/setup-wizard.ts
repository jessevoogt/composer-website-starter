/**
 * Setup Wizard — client-side step navigation, validation, and API calls.
 *
 * Each step's "Next" button validates -> calls API -> advances on success.
 * Uses the existing dev server API endpoints for theme and hero,
 * plus endpoints for identity, social, homepage, about, work, forms, and deploy.
 *
 * Steps (0-indexed):
 *  0 = Identity, 1 = Theme, 2 = Branding, 3 = Homepage, 4 = About,
 *  5 = Work, 6 = Social, 7 = Forms, 8 = Deploy, 9 = Done
 *
 * This file delegates to the modular setup-wizard/ directory.
 */
import './setup-wizard/index'
