// Integration: cms-live-editor-dev-toolbar.mjs
// Adds a "CMS Live Editor" button to the Astro dev toolbar.
// Navigates to the /__studio/ route for split-panel editing.
// Also registers a "Dev Tools" toolbar app for Build/Preview/Publish/Search actions.

export default function cmsLiveEditorDevToolbar() {
  return {
    name: 'jv-cms-live-editor-dev-toolbar',
    hooks: {
      'astro:config:setup': ({ command, addDevToolbarApp, injectRoute, updateConfig }) => {
        if (command !== 'dev') return

        // Inject the studio shell route explicitly because Astro's routing
        // excludes directories starting with `_` (the __studio prefix is used
        // to signal "internal route" and prevent accidental auto-registration).
        injectRoute({
          pattern: '/__studio/[...path]',
          entrypoint: new URL('../pages/__studio/[...path].astro', import.meta.url),
        })

        addDevToolbarApp({
          id: 'jv:cms-live-editor',
          name: 'CMS Live Editor',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/></svg>',
          entrypoint: new URL('../dev-toolbar/cms-live-editor-toolbar.ts', import.meta.url),
        })

        addDevToolbarApp({
          id: 'jv:dev-tools',
          name: 'Dev Tools',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
          entrypoint: new URL('../dev-toolbar/dev-tools-toolbar.ts', import.meta.url),
        })

        // Astro's dev toolbar hard-codes `customAppsToShow = 3`, which pushes
        // the 4th custom app into a "More" overflow menu. We have 4 custom apps
        // (background-switcher, theme-presets, cms-live-editor, dev-tools), so
        // patch the toolbar module to show 4 slots instead.
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'jv-patch-toolbar-slots',
                transform(code, id) {
                  if (
                    id.includes('dev-toolbar/toolbar.js') ||
                    id.includes('dev-toolbar\\toolbar.js')
                  ) {
                    return code.replace('customAppsToShow = 3', 'customAppsToShow = 4')
                  }
                },
              },
            ],
          },
        })
      },
    },
  }
}
