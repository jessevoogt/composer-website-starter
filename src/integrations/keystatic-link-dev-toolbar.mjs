// Integration: keystatic-link-dev-toolbar.mjs
// Adds a one-click "Keystatic CMS" button to the Astro dev toolbar.
// Clicking it opens Keystatic on port 4322, routed to the matching singleton/item when possible.

export default function keystaticlinkDevToolbar() {
  return {
    name: 'jv-keystatic-link-dev-toolbar',
    hooks: {
      'astro:config:setup': ({ command, addDevToolbarApp }) => {
        if (command !== 'dev') return
        addDevToolbarApp({
          id: 'jv:keystatic-link',
          name: 'Keystatic CMS',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
          entrypoint: new URL('../dev-toolbar/keystatic-link-toolbar.ts', import.meta.url),
        })
      },
    },
  }
}
