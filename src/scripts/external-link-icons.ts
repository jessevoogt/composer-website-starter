interface ExternalLinkIconsWindow extends Window {
  __externalLinkIconsBound?: boolean
}

function hasButtonClass(link: HTMLAnchorElement): boolean {
  return Array.from(link.classList).some((className) => /btn|button/i.test(className))
}

function decorateExternalLinks(): void {
  const contentRoot = document.querySelector<HTMLElement>('.page-content')
  if (!contentRoot) return

  const links = contentRoot.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')
  links.forEach((link) => {
    if (hasButtonClass(link)) return
    if (link.closest('.recording-youtube-link')) return
    if (link.dataset.externalLinkDecorated === 'true') return
    if (link.childNodes.length === 0) return

    link.dataset.externalLinkDecorated = 'true'
    link.classList.add('external-link-with-icon')

    const label = document.createElement('span')
    label.className = 'external-link-label'

    while (link.firstChild) {
      label.appendChild(link.firstChild)
    }

    const icon = document.createElement('span')
    icon.className = 'external-link-icon'
    icon.setAttribute('aria-hidden', 'true')

    link.appendChild(label)
    link.appendChild(icon)
  })
}

const externalLinkIconsWindow = window as ExternalLinkIconsWindow
if (!externalLinkIconsWindow.__externalLinkIconsBound) {
  externalLinkIconsWindow.__externalLinkIconsBound = true
  document.addEventListener('astro:page-load', decorateExternalLinks)
}

