// Shared class-name tokens so buttons, inputs and cards read the same everywhere —
// GitHub's palette (canvas/border/fg tokens), not a design system, just consistency.
const focusRing = 'focus:outline-none focus:ring-2 focus:ring-[#0969da]/40 focus:border-[#0969da]'

export const card = 'rounded-md border border-[#d0d7de] bg-white shadow-[0_1px_0_rgba(27,31,36,0.04)]'

const btnBase =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export const btnPrimary = `${btnBase} border-[#1a7f37] bg-[#1f883d] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-[#1a7f37]`
export const btnDefault = `${btnBase} border-[#d0d7de] bg-[#f6f8fa] text-[#24292f] shadow-[0_1px_0_rgba(27,31,36,0.04)] hover:bg-[#f3f4f6] hover:border-[#afb8c1]`
export const btnDanger = `${btnBase} border-[#d0d7de] bg-[#f6f8fa] text-[#d1242f] hover:bg-[#ffebe9] hover:border-[#ff8182]`
export const btnWarning = `${btnBase} border-[#d4a72c] bg-[#fff8c5] text-[#7d4e00] hover:bg-[#fae17d]`
export const btnLink = 'text-sm font-medium text-[#0969da] hover:underline'

export const input = `w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm text-[#1f2328] placeholder:text-[#6e7781] ${focusRing}`
export const select = input
export const textarea = input

export const label = 'block text-sm font-medium text-[#24292f]'

export const pageHeading = 'text-2xl font-semibold text-[#1f2328]'
export const sectionHeading = 'text-base font-semibold text-[#1f2328]'
export const mutedText = 'text-sm text-[#59636e]'
export const fainterText = 'text-xs text-[#6e7781]'

export function initialsOf(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

const AVATAR_PALETTE = ['#0969da', '#8250df', '#1a7f37', '#bf3989', '#9a6700', '#cf222e', '#0a7ea6']

export function avatarColorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!
}
