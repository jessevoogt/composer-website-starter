export default function heroSwitcherDevToolbar() {
  return {
    name: 'jv-hero-switcher-dev-toolbar',
    hooks: {
      'astro:config:setup': ({ command, addDevToolbarApp }) => {
        if (command !== 'dev') return

        addDevToolbarApp({
          id: 'jv:hero-switcher',
          name: 'Hero Switcher',
          icon: 'star',
          entrypoint: new URL('../dev-toolbar/hero-switcher-toolbar.ts', import.meta.url),
        })
      },
    },
  }
}
