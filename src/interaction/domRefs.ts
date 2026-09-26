/**
 * DOM nodes driven straight from the render loop (transform/opacity only),
 * so per-frame UI never goes through React.
 */
export const cursorEl: { current: HTMLDivElement | null } = { current: null }
export const hotspotEls: (HTMLDivElement | null)[] = [null, null, null]
