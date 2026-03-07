/**
 * Source Config — Barrel Export
 *
 * Re-exports all domain modules so that existing imports from
 * '@/utils/source-config' continue to work unchanged.
 */

export { clearConfigCache } from './core'
export { getSiteConfig, isPlaceholderConfig, getCopyrightConfig } from './site'
export type { SiteConfig, CopyrightConfig } from './site'
export { getNavigation, getPrimaryNavLinks } from './navigation'
export type { NavItem, NavigationConfig } from './navigation'
export {
  getHeaderConfigForBreakpoint,
  getResponsiveHeaderConfigs,
  findHeaderSlot,
  headerHasElement,
  anyHeaderHasElement,
} from './header'
export type { HeaderElement, HeaderBreakpoint, HeaderConfig, ResponsiveHeaderConfigs } from './header'
export { getFooterBlockConfig, getFooterMenuConfig } from './footer'
export type { FooterBlockConfig, FooterMenuConfig } from './footer'
export { getSocialLinks, getSharingConfig } from './social'
export type { SocialPlatform, SocialLink, ShareOption, SharingConfig } from './social'
export { getBrandConfig } from './brand'
export type { BrandMode, BrandPluginId, BrandConfig } from './brand'
export { getDeployConfig, isDeployConfigured } from './deploy'
export type { DeployConfig } from './deploy'
export {
  getContactPage,
  getAboutPage,
  getMusicPage,
  getMusicBrowsePage,
  getMusicBrowseTagPage,
  getWorkDetailPage,
  getNotFoundPage,
  getAccessibilityPage,
  getSitemapPage,
  getPerusalAccessGrantedPage,
  getPerusalThankYouPage,
  getRequestScoreAccessPage,
  getContactThankYouPage,
} from './pages'
export type {
  ContactPageConfig,
  AboutPageConfig,
  MusicPageConfig,
  MusicBrowsePageConfig,
  MusicBrowseTagPageConfig,
  WorkDetailPageConfig,
  NotFoundPageConfig,
  AccessibilityPageConfig,
  SitemapPageConfig,
  PerusalAccessGrantedPageConfig,
  PerusalThankYouPageConfig,
  RequestScoreAccessPageConfig,
  ContactThankYouPageConfig,
} from './pages'
export { getHomeHero, getHomeSeo, getHomeContact, getHomeFeaturedWork, getHomeSelectWorks, getHomeLayout } from './home'
export type {
  HomeHeroConfig,
  HomeSeoConfig,
  HomeContactConfig,
  HomeFeaturedWorkConfig,
  HomeSelectWorksConfig,
  HomeSelectWorksSortOrder,
  HomeLayoutConfig,
} from './home'
export { getThemeConfig } from './theme'
export type { ThemeConfig } from './theme'
export { getHeroConfig, getHeroVariants } from './hero'
export type { HeroVariant, HeroConfig } from './hero'
export { getPerusalAccessConfig, isPerusalGatingActive, getPerusalViewerConfig } from './perusal'
export type { PerusalAccessGatingMode, PerusalAccessConfig, PerusalViewerMode, WatermarkFont, PerusalViewerConfig } from './perusal'
export { getGlobalLayout, getRedirects, getBreadcrumbsConfig, getEmailLayoutConfig, getScorePdfConfig } from './misc'
export type {
  GlobalLayoutConfig,
  RedirectRule,
  RedirectsConfig,
  BreadcrumbsConfig,
  EmailLayoutConfig,
  ScorePdfConfig,
} from './misc'

// ─── Aliases (new names, old functions preserved for compatibility) ──────────

export { getPerusalAccessConfig as getScoreAccessConfig } from './perusal'
export type { PerusalAccessConfig as ScoreAccessConfig } from './perusal'
export { getPerusalViewerConfig as getScoreViewerConfig } from './perusal'
export type { PerusalViewerConfig as ScoreViewerConfig } from './perusal'
export { isPerusalGatingActive as isScoreGatingActive } from './perusal'
