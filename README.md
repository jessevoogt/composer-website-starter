# Accessible Astro Starter

[![Built with Astro](https://astro.badg.es/v2/built-with-astro/small.svg)](https://astro.build)

<img width="1200" height="627" alt="social-preview" src="https://github.com/user-attachments/assets/fa1a8b50-3aab-4bd3-8f50-1d43586fbd84" />

A ready-to-use, SEO and accessibility-focused Astro starter template. Built with modern web standards, WCAG 2.2 AA guidelines, and European Accessibility Act (EAA) compliance in mind, it provides a solid foundation for creating inclusive websites. Features Tailwind CSS 4 integration, comprehensive component library with enhanced form validation, color contrast checker, and typography with Atkinson Hyperlegible font for improved readability. Includes dynamic blog/works pages with social sharing, contact forms, and full MDX support.

[![LIVE DEMO](https://img.shields.io/badge/LIVE_DEMO-4ECCA3?style=for-the-badge&logo=astro&logoColor=black)](https://accessible-astro-starter.incluud.dev/) &nbsp;
[![DOCUMENTATION](https://img.shields.io/badge/DOCUMENTATION-A682FF?style=for-the-badge&logo=astro&logoColor=black)](https://accessible-astro.incluud.dev/) &nbsp;
[![Sponsor on Open Collective](https://img.shields.io/badge/Open%20Collective-7FADF2?style=for-the-badge&logo=opencollective&logoColor=white)](https://opencollective.com/incluud) &nbsp;

## Our mission

> Provide developers with accessible, easy-to-use components that make building inclusive web applications simpler and faster, without compromising on customization or performance.

## (Accessibility) Features

- Astro 5.13.0+
- Tailwind CSS 4.1+ support
- TypeScript integration with path aliases for easier imports and content collections support
- Prettier integration with `prettier-plugin-astro` and `prettier-plugin-tailwind`
- ESLint integration with strict accessibility settings for `eslint-plugin-jsx-a11y`
- Markdown and MDX support with comprehensive examples and components
- Modern OKLCH color system with automatic palette generation from primary/secondary colors
- Atkinson Hyperlegible font for improved readability and accessibility
- Lucide icon set via `astro-icon` for consistent, friendly icons
- Semantic HTML structure with `Button`, `Link` and `Heading` components
- Excellent Lighthouse/PageSpeed scores
- Accessible landmarks such as `header`, `main`, `footer`, `section` and `nav`
- Outline focus indicator which works on dark and light backgrounds
- Several `aria` attributes which provide a better experience for screen reader users
- `[...page].astro` and `[post].astro` demonstrate the use of dynamic routes and provide a basic blog with breadcrumbs and pagination
- `404.astro` provides a custom 404 error page which you can adjust to your needs
- `Header.astro` component with optimized accessibility and design
- `Footer.astro` component with informative content and links
- `SkipLinks.astro` component to skip to either the main menu or the main content
- `Navigation.astro` component with keyboard accessible (dropdown) navigation and highlighted menu item option
- `ResponsiveToggle.astro` component with accessible responsive toggle functionality
- `DarkMode.astro` component toggle with accessible button and a user system preferred color scheme setting
- `SiteMeta.astro` SEO component for setting custom metadata on different pages
- `.sr-only` utility class for screen reader only text content (hides text visually)
- `prefers-reduced-motion` disables animations for users that have this preference turned on
- Components including `ColorContrast.astro`, `BlockQuote.astro`, `BreakoutImage.astro`, `Logo.astro`, `SocialShares.astro`, `PageHeader.astro`, `FeaturedPosts.astro`, and `FeaturedWorks.astro`
- Enhanced form components with comprehensive validation: `Form`, `Input`, `Textarea`, `Checkbox`, `Radio`, and `Fieldset` with WCAG 2.2 compliance
- Automatic form validation with custom patterns, error handling, and screen reader support
- Blog and works pages with featured images, author details, social sharing, and breakout images
- Contact page with comprehensive form validation showcase and accessibility demonstrations
- Thank-you page for form submissions with interactive feedback
- Accessibility Statement template page
- Color Contrast Checker interactive page
- Comprehensive sitemap page with organized navigation and automatic XML sitemap generation via `@astrojs/sitemap`
- Enhanced accessible-components showcase page with expanded component demonstrations
- Smooth micro-interactions and animations on hover, open and close states (respecting reduced motion preferences)
- Comprehensive SCSS utility classes
- CSS with logical properties and custom properties
- Accessible button and hyperlink styling with clear focus states
- Styled `<kbd>` element for keyboard shortcut documentation

## Getting started

**Requirements:** Node.js 22.x (see `.nvmrc`), npm 10+

Clone this theme locally and run any of the following commands in your terminal:

| Command                 | Action                                                         |
| :---------------------- | :------------------------------------------------------------- |
| `npm install`           | Installs dependencies                                          |
| `npm run init:source`   | Creates local `source/` from committed `source-template/`      |
| `npm run dev`           | Starts local dev server at `localhost:4321`                    |
| `npm run build`         | Build your production site to `./dist/`                        |
| `npm run preview`       | Preview your build locally, before deploying                   |
| `npm run init:source:reset` | Resets local `source/` back to the template defaults      |

`source-template/` is committed to Git as the starter baseline.
`source/` is local working content and is gitignored by default. `dev`, `build`, and ingest commands auto-run `init:source` when `source/` is missing.
If you want to track `source/` in your own repo, remove the `source/` rule from `.gitignore`.

See [`docs/SETUP.md`](docs/SETUP.md) for detailed configuration instructions.

## Accessible Astro projects

- [Accessible Astro Starter](https://github.com/incluud/accessible-astro-starter): Fully accessible starter for kickstarting Astro projects, with Tailwind.
- [Accessible Astro Components](https://github.com/incluud/accessible-astro-components/): Library of reusable, accessible components built for Astro.
- [Accessible Astro Dashboard](https://github.com/incluud/accessible-astro-dashboard/): User-friendly dashboard interface with a login screen and widgets.
- [Accessible Astro Docs](https://github.com/incluud/accessible-astro-docs): Comprehensive documentation for all Accessible Astro projects.
- [Color Contrast Checker](https://github.com/incluud/color-contrast-checker): WCAG-compliant color contrast checker with design system token generation.

Check out our [roadmap](https://github.com/orgs/incluud/projects/4/views/1) to see what's coming next!

## Contributing

We welcome contributions to improve the documentation! You can help by:

1. [Filing an issue](https://github.com/incluud/accessible-astro-starter/issues)
2. [Submitting a pull request](https://github.com/incluud/accessible-astro-starter/pulls)
3. [Starting a discussion](https://github.com/incluud/accessible-astro-starter/discussions)
4. [Supporting on Open Collective](https://opencollective.com/incluud)

## Support this project

Your support helps us cover basic costs and continue building accessible solutions for the Astro ecosystem. By becoming a sponsor, you're not just supporting code – you're helping create a more inclusive web for everyone. Every contribution, big or small, helps maintain and improve these accessibility-focused tools.

[![Sponsor on Open Collective](https://img.shields.io/badge/Open%20Collective-7FADF2?style=for-the-badge&logo=opencollective&logoColor=white)](https://opencollective.com/incluud)

## Together we make a difference

We want to express our heartfelt gratitude to everyone who contributes to making the web more accessible:

- **The Astro team** for creating an amazing static site generator and the wonderful Starlight theme
- **Our contributors** who dedicate their time and expertise to improve these tools
- [**Niek Derksen**](https://niekderksen.nl) for conducting comprehensive accessibility audits to ensure WCAG compliance
- **Our sponsors** who help make this project sustainable
- **The web community** for embracing and promoting web accessibility
- **You, the developer** for choosing to make your projects more accessible

<a href="https://github.com/incluud/accessible-astro-starter/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=incluud/accessible-astro-starter" />
</a><br /><br />

Together, we're not just building documentation or components – we're creating a more inclusive and accessible web for everyone. Every contribution, whether it's code, documentation, bug reports, or feedback, helps move us closer to this goal. ✨

Remember: Accessibility is not a feature, it's a fundamental right. Thank you for being part of this journey!

## Updating works images helper

If you add or remove images in `src/assets/images/works`, regenerate the helper file used by `src/utils/prepareWorks.ts` by running:

```
node ./scripts/generate-works-images.mjs
```

This writes `src/utils/works-images.ts` which exports an array of imported images used as fallbacks for works entries.

## Updating the social preview image

If you regenerate the Open Graph preview image, run:

```bash
npm run generate:social-image
```

This updates:

- `public/social-preview-image.svg`
- `public/social-preview-image.png`
- `src/data/social-image-version.ts`

`SiteMeta` appends `?v=<YYYYMMDDHHmmss>` to `/social-preview-image.png`, so the share image cache-busts only when you regenerate it.
