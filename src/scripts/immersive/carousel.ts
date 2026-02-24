/**
 * Horizontal scroll carousel with prev/next controls and keyboard navigation.
 */

import { trackAnalyticsEvent } from '../analytics-events'

export function initCarousel(prefersReducedMotion: boolean): () => void {
  const selectedCarousel = document.querySelector<HTMLElement>('[data-selected-carousel]')
  if (!selectedCarousel) return () => {}

  const carouselFrame = selectedCarousel.querySelector<HTMLElement>('[data-carousel-frame]')
  const carouselPrev = selectedCarousel.querySelector<HTMLButtonElement>('[data-carousel-prev]')
  const carouselNext = selectedCarousel.querySelector<HTMLButtonElement>('[data-carousel-next]')

  if (!carouselFrame || !carouselPrev || !carouselNext) return () => {}

  const scrollStep = (): number => Math.max(carouselFrame.clientWidth - 2, 1)

  function updateCarouselState(): void {
    const maxScrollLeft = Math.max(0, carouselFrame!.scrollWidth - carouselFrame!.clientWidth)
    const hasOverflow = maxScrollLeft > 2
    const atStart = carouselFrame!.scrollLeft <= 1
    const atEnd = carouselFrame!.scrollLeft >= maxScrollLeft - 1

    selectedCarousel!.classList.toggle('has-overflow', hasOverflow)
    selectedCarousel!.classList.toggle('at-end', hasOverflow && atEnd)
    carouselPrev!.disabled = !hasOverflow || atStart
    carouselNext!.disabled = !hasOverflow || atEnd
  }

  function scrollCarousel(direction: -1 | 1): void {
    carouselFrame!.scrollBy({
      left: scrollStep() * direction,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }

  const onCarouselPrev = (): void => {
    scrollCarousel(-1)
    trackAnalyticsEvent('home_carousel_interaction', {
      action: 'prev_click',
    })
  }

  const onCarouselNext = (): void => {
    scrollCarousel(1)
    trackAnalyticsEvent('home_carousel_interaction', {
      action: 'next_click',
    })
  }

  const onCarouselKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      scrollCarousel(-1)
      trackAnalyticsEvent('home_carousel_interaction', {
        action: 'arrow_left_key',
      })
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      scrollCarousel(1)
      trackAnalyticsEvent('home_carousel_interaction', {
        action: 'arrow_right_key',
      })
    }
  }

  const onCarouselFrameScroll = (): void => updateCarouselState()
  const onResize = (): void => updateCarouselState()

  carouselPrev.addEventListener('click', onCarouselPrev)
  carouselNext.addEventListener('click', onCarouselNext)
  carouselFrame.addEventListener('scroll', onCarouselFrameScroll, { passive: true })
  carouselFrame.addEventListener('keydown', onCarouselKeydown)
  window.addEventListener('resize', onResize)

  updateCarouselState()

  return () => {
    carouselPrev.removeEventListener('click', onCarouselPrev)
    carouselNext.removeEventListener('click', onCarouselNext)
    carouselFrame.removeEventListener('scroll', onCarouselFrameScroll)
    carouselFrame.removeEventListener('keydown', onCarouselKeydown)
    window.removeEventListener('resize', onResize)
  }
}
