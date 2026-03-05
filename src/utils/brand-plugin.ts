import type { BrandConfig, BrandPluginId } from './source-config'

export function getBrandPluginId(brandConfig: Pick<BrandConfig, 'mode' | 'pluginId'>): BrandPluginId | null {
  if (brandConfig.mode === 'plugin') {
    return brandConfig.pluginId
  }
  return null
}
