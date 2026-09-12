import { avatarColorFor, initialsOf } from '../lib/ui'

export function Avatar({ email, size = 'md' }: { email: string; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-xs'
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ${dimension}`}
      style={{ backgroundColor: avatarColorFor(email) }}
      title={email}
    >
      {initialsOf(email)}
    </span>
  )
}
