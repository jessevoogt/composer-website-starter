export default function backgroundSwitcherDevToolbar() {
  return {
    name: 'jv-background-switcher-dev-toolbar',
    hooks: {
      'astro:config:setup': ({ command, addDevToolbarApp }) => {
        if (command !== 'dev') return

        addDevToolbarApp({
          id: 'jv:background-switcher',
          name: 'Background Switcher',
          icon: 'star',
          entrypoint: new URL('../dev-toolbar/background-switcher-toolbar.ts', import.meta.url),
        })
      },
    },
  }
}
