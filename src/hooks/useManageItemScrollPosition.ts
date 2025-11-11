import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type IdLike = number | string

type Options<T extends IdLike> = {
  /** Height to keep above target (sticky header etc.) */
  topOffset?: number
  /** Default scroll behavior */
  behavior?: ScrollBehavior // 'auto' | 'smooth'
  /** Show back-to-top by watching a sentinel */
  trackBackToTop?: boolean
  /** If scrolling happens in a container, pass its ref. Otherwise window is used. */
  rootRef?: RefObject<HTMLElement>
  /** Optional: run after we scroll to an item (for highlight/analytics/etc.) */
  onAfterScrollToItem?: (el: HTMLElement, id: T) => void
}

type UseManageItemScrollPositionReturn<T extends IdLike> = {
  /** Put this on a tiny, non-sticky element at the very top of the scroll area */
  topRef: RefObject<HTMLDivElement>
  /** Use like: ref={createScrollItemRef(item.id)} on each row */
  createScrollItemRef: (id: T) => (el: HTMLElement | null) => void
  /** Programmatically scroll to an item by id */
  scrollToItem: (id: T, behavior?: ScrollBehavior) => void
  /** Scroll to the top sentinel */
  scrollToTop: (behavior?: ScrollBehavior) => void
  /** True once we’ve scrolled past the sentinel */
  showBackToTop: boolean
}

export function useManageItemScrollPosition<T extends IdLike>(
  opts: Options<T> = {}
): UseManageItemScrollPositionReturn<T> {
  const {
    topOffset = 0,
    behavior = 'smooth',
    trackBackToTop = true,
    rootRef,
    onAfterScrollToItem,
  } = opts

  const topRef = useRef<HTMLDivElement>(null)
  const elMapRef = useRef<Map<T, HTMLElement>>(new Map())
  const pendingIdRef = useRef<T | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const getRoot = useCallback(() => rootRef?.current ?? null, [rootRef])

  const scrollToY = useCallback(
    (y: number, b?: ScrollBehavior) => {
      const root = getRoot()
      if (root) root.scrollTo({ top: y, behavior: b ?? behavior })
      else window.scrollTo({ top: y, behavior: b ?? behavior })
    },
    [behavior, getRoot]
  )

  const scrollToEl = useCallback(
    (el: HTMLElement, b?: ScrollBehavior) => {
      const root = getRoot()
      const rect = el.getBoundingClientRect()

      if (root) {
        const rootRect = root.getBoundingClientRect()
        const y = root.scrollTop + (rect.top - rootRect.top) - topOffset
        scrollToY(Math.max(y, 0), b)
      } else {
        const y = window.scrollY + rect.top - topOffset
        scrollToY(Math.max(y, 0), b)
      }
    },
    [scrollToY, topOffset, getRoot]
  )

  const scrollToTop = useCallback(
    (b?: ScrollBehavior) => {
      const anchor = topRef.current
      if (anchor) scrollToEl(anchor, b)
      else scrollToY(0, b)
    },
    [scrollToEl, scrollToY]
  )

  const scrollToItem = useCallback(
    (id: T, b?: ScrollBehavior) => {
      // Mark intent to scroll to this id, regardless of whether an element exists now.
      pendingIdRef.current = id

      const tryScroll = () => {
        const el = elMapRef.current.get(id)
        if (!el) return // if it's remounting into a new group, wait for the ref to attach
        // double-rAF so layout is fully settled (sticky headers, etc.)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToEl(el, b)
            if (onAfterScrollToItem) {
              requestAnimationFrame(() => onAfterScrollToItem(el, id))
            }
            // done
            if (pendingIdRef.current === id) pendingIdRef.current = null
          })
        })
      }

      // Try after React commits the update
      requestAnimationFrame(tryScroll)
    },
    [scrollToEl, onAfterScrollToItem]
  )

  const createScrollItemRef = useCallback(
    (id: T) => (node: HTMLElement | null) => {
      if (node) {
        elMapRef.current.set(id, node)
        // If we were waiting to scroll to this id (e.g., after a status change),
        // do it now that the *new* node has mounted.
        if (pendingIdRef.current === id) {
          requestAnimationFrame(() => scrollToItem(id))
        }
      } else {
        elMapRef.current.delete(id)
      }
    },
    [scrollToItem]
  )

  // Reliable IntersectionObserver setup (wait a frame so the ref exists)
  useEffect(() => {
    if (!trackBackToTop) return

    let io: IntersectionObserver | null = null
    let observed: Element | null = null
    let rafId = 0

    const setup = () => {
      const anchor = topRef.current
      // Wait until the sentinel is actually in the DOM (handles "Loading..." early-returns)
      if (!anchor) {
        rafId = requestAnimationFrame(setup)
        return
      }

      const root = rootRef?.current ?? null // if you use a scroll container, the sentinel MUST be inside it
      io = new IntersectionObserver(
        (entries) => setShowBackToTop(!entries[0].isIntersecting),
        { root, threshold: 0, rootMargin: `-${topOffset}px 0px 0px 0px` }
      )

      io.observe(anchor)
      observed = anchor
    }

    setup()

    return () => {
      if (observed && io) io.unobserve(observed)
      io?.disconnect()
      cancelAnimationFrame(rafId)
    }
  }, [trackBackToTop, topOffset, rootRef])

  return {
    topRef,
    createScrollItemRef,
    scrollToItem,
    scrollToTop,
    showBackToTop,
  }
}
