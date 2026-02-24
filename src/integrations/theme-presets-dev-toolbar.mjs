export default function themePresetsDevToolbar() {
  return {
    name: 'jv-theme-presets-dev-toolbar',
    hooks: {
      'astro:config:setup': ({ command, addDevToolbarApp }) => {
        if (command !== 'dev') return

        addDevToolbarApp({
          id: 'jv:theme-presets',
          name: 'Theme Presets',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"/><path d="M7.5 9.5h.01"/><path d="M11 7h.01"/><path d="M15 7h.01"/><path d="M16.5 10.5h.01"/><path d="M14 16.5a2.5 2.5 0 0 0 2.5-2.5V13a2 2 0 0 1 2-2h1.2"/></svg>',
          entrypoint: new URL('../dev-toolbar/theme-presets-toolbar.ts', import.meta.url),
        })
      },
    },
  }
}
