export type PageScrollTarget = Window | HTMLElement

export function getPageScrollTarget(): PageScrollTarget {
  const main = document.querySelector<HTMLElement>('.app-main')
  if (main) {
    const overflowY = window.getComputedStyle(main).overflowY
    const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && main.scrollHeight > main.clientHeight
    if (canScroll) return main
  }
  return window
}

export function getPageScrollTop(target: PageScrollTarget): number {
  return target === window ? window.scrollY : (target as HTMLElement).scrollTop
}

export function getPageScrollHeight(target: PageScrollTarget): number {
  return target === window ? document.documentElement.scrollHeight : (target as HTMLElement).scrollHeight
}

export function getPageScrollClientHeight(target: PageScrollTarget): number {
  return target === window ? window.innerHeight : (target as HTMLElement).clientHeight
}

export function scrollPageToTop(target: PageScrollTarget, behavior: ScrollBehavior = 'smooth') {
  target.scrollTo({ top: 0, behavior })
}
