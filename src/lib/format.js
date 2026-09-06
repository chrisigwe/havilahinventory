export const naira = (n) =>
  '₦' + Number(n ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })

// business date in Africa/Lagos regardless of device timezone
export const lagosToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())

export const tierLabel = { general: 'Standard', lounge: 'Lounge', staff: 'Staff' }
export const methodLabel = { pos: 'POS', cash: 'Cash', credit: 'Credit', transfer: 'Transfer' }
