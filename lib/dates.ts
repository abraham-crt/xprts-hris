const LA_TZ = 'America/Los_Angeles'

export function laToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: LA_TZ })
}

export function laPeriodBounds(): { periodStart: string; periodEnd: string } {
  const [year, month] = laToday().split('-').map(Number)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return {
    periodStart: `${prevYear}-${String(prevMonth).padStart(2, '0')}-26`,
    periodEnd: `${year}-${String(month).padStart(2, '0')}-25`,
  }
}

export function isPayPeriodLocked(entryDateStr: string): boolean {
  const todayStr = laToday()
  const todayDay = parseInt(todayStr.split('-')[2])
  if (todayDay < 25) return false
  const { periodStart, periodEnd } = laPeriodBounds()
  return entryDateStr >= periodStart && entryDateStr <= periodEnd
}
