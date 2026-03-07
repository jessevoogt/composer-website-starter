/**
 * Source Config — Newsletter
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

const newsletterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  checkboxLabel: z.string().default('Keep me updated on new music and performances'),
  checkboxDefaultChecked: z.boolean().default(false),
  showCheckboxInfo: z.boolean().default(true),
  checkboxInfoText: z
    .string()
    .default(
      'We respect your privacy. Your email is only used for occasional updates about new music, performances, and recordings\u2009\u2014\u2009never shared or sold. You can unsubscribe at any time.'
    ),
})

export type NewsletterConfig = z.infer<typeof newsletterConfigSchema>

export function getNewsletterConfig(): NewsletterConfig {
  return readYaml(path.join(SITE_DIR, 'newsletter.yaml'), newsletterConfigSchema, newsletterConfigSchema.parse({}))
}
