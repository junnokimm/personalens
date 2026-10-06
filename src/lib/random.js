export const clone = (x) => JSON.parse(JSON.stringify(x))
export const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
export function rng(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296 } }
export function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
