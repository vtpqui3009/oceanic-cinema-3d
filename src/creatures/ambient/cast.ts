/** `?cast=0` hides the supporting cast (A/B performance checks). */
export const SHOW_CAST = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('cast') !== '0'
