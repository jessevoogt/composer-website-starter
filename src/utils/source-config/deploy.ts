/**
 * Source Config — Deploy
 */

import { z } from 'astro/zod'
import { readYaml, SITE_DIR, path } from './core'

const deployConfigSchema = z.object({
  sftpHost: z.string().default(''),
  sftpUser: z.string().default(''),
  sftpRemotePath: z.string().default(''),
  sftpPrivateRemotePath: z.string().default(''),
  sftpPort: z.number().default(22),
})

export type DeployConfig = z.infer<typeof deployConfigSchema>

export function getDeployConfig(): DeployConfig {
  return readYaml(path.join(SITE_DIR, 'deploy.yaml'), deployConfigSchema, deployConfigSchema.parse({}))
}

/** Returns true if SFTP deployment is configured. */
export function isDeployConfigured(): boolean {
  const config = getDeployConfig()
  return Boolean(config.sftpHost && config.sftpUser)
}
