export default function Logo({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="9" width="40" height="49" rx="5" />
      <path d="M20 9V7a3 3 0 0 1 3-3h2a4 4 0 0 1 8 0h2a3 3 0 0 1 3 3v2z" fill="currentColor" stroke="none" />
      <path d="M20 4h16a3 3 0 0 1 3 3v2H17V7a3 3 0 0 1 3-3z" />
      <path d="M16 21.5l2.6 2.6 4.4-4.6" /><path d="M29 22h11" />
      <path d="M16 32.5l2.6 2.6 4.4-4.6" /><path d="M29 33h11" />
      <path d="M16 43.5l2.6 2.6 4.4-4.6" /><path d="M29 44h8" />
      <circle cx="47" cy="46" r="13" fill="var(--color-bg)" />
      <circle cx="47" cy="46" r="13" />
      <path d="M41 46.2l4 4 8-8.4" />
    </svg>
  )
}
