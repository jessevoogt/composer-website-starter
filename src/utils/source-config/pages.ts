/**
 * Source Config — Page Configs
 *
 * Readers for contact, about, music, browse, work-detail, not-found,
 * accessibility, sitemap, perusal access/thank-you, and contact thank-you pages.
 */

import { z } from 'astro/zod'
import { readYaml, PAGES_DIR, path, nullableString } from './core'
import { getSiteConfig } from './site'

// ─── Contact Page Content ───────────────────────────────────────────────────

const contactPageSchema = z.object({
  title: z.string().default('Contact'),
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  introText: z
    .string()
    .default(
      'Whether you are interested in a score, a performance, or something else, I would be glad to hear from you.',
    ),
  contactFormEnabled: z.boolean().default(false),
  contactWebhookUrl: z.string().default(''),
  autoReplySubject: z.string().default('Thank you for your message — {{composerName}}'),
  autoReplyMessage: z.string().default(''),
  preferredHeroId: nullableString,
  nameMaxLength: z.number().int().min(1).default(120),
  messageMaxLength: z.number().int().min(1).default(4000),
  showCharacterCount: z.boolean().default(true),
  characterCountThreshold: z.number().int().min(1).default(50),
})

export type ContactPageConfig = z.infer<typeof contactPageSchema>

export function getContactPage(): ContactPageConfig {
  const config = readYaml(path.join(PAGES_DIR, 'contact.yaml'), contactPageSchema, contactPageSchema.parse({}))
  // Derive metaTitle from composerName if not set
  if (!config.metaTitle) {
    const site = getSiteConfig()
    return { ...config, metaTitle: `Contact ${site.composerName}` }
  }
  return config
}

// ─── About Page Content ─────────────────────────────────────────────────────

const aboutPageSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  searchResultText: z.string().default(''),
  profileImageAlt: z.string().default(''),
  body: z.string().default(''),
  preferredHeroId: nullableString,
})

export type AboutPageConfig = z.infer<typeof aboutPageSchema>

export function getAboutPage(): AboutPageConfig {
  const config = readYaml(path.join(PAGES_DIR, 'about', 'about.yaml'), aboutPageSchema, aboutPageSchema.parse({}))
  if (!config.metaTitle) {
    const site = getSiteConfig()
    return { ...config, metaTitle: `About ${site.composerName}` }
  }
  return config
}

// ─── Music Page Config ──────────────────────────────────────────────────────

const sortOptionValues = ['title', 'newest', 'oldest'] as const
const defaultSortWithFilterValues = ['relevance', 'newest', 'oldest', 'title'] as const

const musicPageSchema = z.object({
  title: z.string().default('Music'),
  subtitle: z.string().default('A showcase of compositions by {composerName}'),
  filterNote: z.string().default(''),
  searchPlaceholder: z.string().default('Filter works...'),
  sortEnabled: z.boolean().default(true),
  sortOptions: z.array(z.enum(sortOptionValues)).default(['title', 'newest', 'oldest']),
  defaultSortNoFilter: z.enum(['newest', 'oldest', 'title']).default('newest'),
  defaultSortWithFilter: z.enum(defaultSortWithFilterValues).default('relevance'),
  scoreCheckboxEnabled: z.boolean().default(true),
  scoreCheckboxLabel: z.string().default(''),
  recordingCheckboxEnabled: z.boolean().default(true),
  recordingCheckboxLabel: z.string().default(''),
  premiereCheckboxEnabled: z.boolean().default(false),
  premiereCheckboxLabel: z.string().default(''),
  preferredHeroId: nullableString,
})

export type MusicPageConfig = z.infer<typeof musicPageSchema>

export function getMusicPage(): MusicPageConfig {
  return readYaml(path.join(PAGES_DIR, 'music.yaml'), musicPageSchema, musicPageSchema.parse({}))
}

// ─── Music Browse Page Config ───────────────────────────────────────────────

const musicBrowsePageSchema = z.object({
  preferredHeroId: nullableString,
})

export type MusicBrowsePageConfig = z.infer<typeof musicBrowsePageSchema>

export function getMusicBrowsePage(): MusicBrowsePageConfig {
  return readYaml(path.join(PAGES_DIR, 'music-browse.yaml'), musicBrowsePageSchema, musicBrowsePageSchema.parse({}))
}

// ─── Music Browse Tag Page Config ───────────────────────────────────────────

const musicBrowseTagPageSchema = z.object({
  preferredHeroId: nullableString,
})

export type MusicBrowseTagPageConfig = z.infer<typeof musicBrowseTagPageSchema>

export function getMusicBrowseTagPage(): MusicBrowseTagPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'music-browse-tag.yaml'),
    musicBrowseTagPageSchema,
    musicBrowseTagPageSchema.parse({}),
  )
}

// ─── Work Detail Page Config ────────────────────────────────────────────────

const workDetailPageSchema = z.object({
  preferredHeroId: nullableString,
})

export type WorkDetailPageConfig = z.infer<typeof workDetailPageSchema>

export function getWorkDetailPage(): WorkDetailPageConfig {
  return readYaml(path.join(PAGES_DIR, 'work-detail.yaml'), workDetailPageSchema, workDetailPageSchema.parse({}))
}

// ─── Not Found Page Config ──────────────────────────────────────────────────

const notFoundPageSchema = z.object({
  title: z.string().default('404'),
  message: z.string().default("The page you requested isn't in the score."),
  submessage: z.string().default("Don't worry, the music doesn't have to end."),
  buttonLabel: z.string().default('Da capo'),
  preferredHeroId: nullableString,
})

export type NotFoundPageConfig = z.infer<typeof notFoundPageSchema>

export function getNotFoundPage(): NotFoundPageConfig {
  return readYaml(path.join(PAGES_DIR, 'not-found.yaml'), notFoundPageSchema, notFoundPageSchema.parse({}))
}

// ─── Accessibility Statement Page Config ────────────────────────────────────

const accessibilityPageSchema = z.object({
  title: z.string().default('Accessibility statement'),
  subtitle: z
    .string()
    .default('This document outlines the accessibility features and support provided by our website.'),
  preferredHeroId: nullableString,
})

export type AccessibilityPageConfig = z.infer<typeof accessibilityPageSchema>

export function getAccessibilityPage(): AccessibilityPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'accessibility-statement.yaml'),
    accessibilityPageSchema,
    accessibilityPageSchema.parse({}),
  )
}

// ─── Sitemap Page Config ────────────────────────────────────────────────────

const sitemapPageSchema = z.object({
  title: z.string().default('Sitemap'),
  subtitle: z
    .string()
    .default(
      'A comprehensive overview of all pages and content available on this website, organized for easy navigation.',
    ),
  preferredHeroId: nullableString,
})

export type SitemapPageConfig = z.infer<typeof sitemapPageSchema>

export function getSitemapPage(): SitemapPageConfig {
  return readYaml(path.join(PAGES_DIR, 'sitemap.yaml'), sitemapPageSchema, sitemapPageSchema.parse({}))
}

// ─── Page: Perusal Access Granted ───────────────────────────────────────────

const perusalAccessGrantedPageSchema = z.object({
  heading: z.string().default('Access Granted!'),
  message: z.string().default('You can now view the perusal score for {{workTitle}}.'),
  buttonLabel: z.string().default('View Perusal Score'),
  preferredHeroId: nullableString,
})

export type PerusalAccessGrantedPageConfig = z.infer<typeof perusalAccessGrantedPageSchema>

export function getPerusalAccessGrantedPage(): PerusalAccessGrantedPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'perusal-access-granted.yaml'),
    perusalAccessGrantedPageSchema,
    perusalAccessGrantedPageSchema.parse({}),
  )
}

// ─── Page: Perusal Thank You ────────────────────────────────────────────────

const perusalThankYouPageSchema = z.object({
  heading: z.string().default('Thank You!'),
  message: z
    .string()
    .default('Check your inbox! A link to view the perusal score for {{workTitle}} has been sent to your email.'),
  buttonLabel: z.string().default('Back to {{workTitle}}'),
  preferredHeroId: nullableString,
})

export type PerusalThankYouPageConfig = z.infer<typeof perusalThankYouPageSchema>

export function getPerusalThankYouPage(): PerusalThankYouPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'perusal-thank-you.yaml'),
    perusalThankYouPageSchema,
    perusalThankYouPageSchema.parse({}),
  )
}

// ─── Page: Request Score Access ─────────────────────────────────────────────

const requestScoreAccessPageSchema = z.object({
  gateTitle: z.string().default('Request Perusal Score Access'),
  gateMessage: z
    .string()
    .default(
      'To view this perusal score, please enter your name and email. You will receive a link to access the score.',
    ),
  successMessage: z.string().default('Check your inbox! A link to view this score has been sent to your email.'),
  hideBackground: z.boolean().default(false),
})

export type RequestScoreAccessPageConfig = z.infer<typeof requestScoreAccessPageSchema>

export function getRequestScoreAccessPage(): RequestScoreAccessPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'request-score-access.yaml'),
    requestScoreAccessPageSchema,
    requestScoreAccessPageSchema.parse({}),
  )
}

// ─── Page: Contact Thank You ────────────────────────────────────────────────

const contactThankYouPageSchema = z.object({
  heading: z.string().default('Thank You!'),
  message: z.string().default('Message sent! We will get back to you soon.'),
  buttonLabel: z.string().default('Back Home'),
  preferredHeroId: nullableString,
})

export type ContactThankYouPageConfig = z.infer<typeof contactThankYouPageSchema>

export function getContactThankYouPage(): ContactThankYouPageConfig {
  return readYaml(
    path.join(PAGES_DIR, 'contact-thank-you.yaml'),
    contactThankYouPageSchema,
    contactThankYouPageSchema.parse({}),
  )
}
