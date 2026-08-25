export type AccrualEvent = {
  type: string
  days: number
  date: string
  note: string
}

// First-year grant days by month (1=Jan … 12=Dec) of the 6-month completion date
const FIRST_YEAR_GRANT: Record<number, number> = {
  1: 9, 2: 8, 3: 8, 4: 7, 5: 6, 6: 5,
  7: 4, 8: 3, 9: 3, 10: 2, 11: 1, 12: 0,
}

/** Add N calendar months to a YYYY-MM-DD string */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

export function computeAccrualUpdates(params: {
  employmentStartDate: string   // 'YYYY-MM-DD'
  currentBalance: number
  lastAccrualDate: string | null // 'YYYY-MM-DD'
  accrualHistory: AccrualEvent[]
}): {
  newBalance: number
  newLastAccrualDate: string | null
  newAccrualHistory: AccrualEvent[]
  hasChanges: boolean
} {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const { employmentStartDate, currentBalance, lastAccrualDate, accrualHistory } = params

  const sixMonthDate = addMonths(employmentStartDate, 6)
  const oneYearDate = addMonths(employmentStartDate, 12)

  let newBalance = currentBalance
  const newLastAccrualDate: string | null = lastAccrualDate
  const newEvents: AccrualEvent[] = []

  // Not yet at the 6-month mark — no accrual yet
  if (today < sixMonthDate) {
    return {
      newBalance,
      newLastAccrualDate,
      newAccrualHistory: accrualHistory,
      hasChanges: false,
    }
  }

  // ── Step 1: One-time first-year grant (tracked by presence in accrual_history) ──
  const alreadyGranted = accrualHistory.some(e => e.type === 'first_year_grant')
  if (!alreadyGranted) {
    const completionMonth = parseInt(sixMonthDate.split('-')[1], 10)
    const grantDays = FIRST_YEAR_GRANT[completionMonth] ?? 0
    newBalance += grantDays
    newEvents.push({
      type: 'first_year_grant',
      days: grantDays,
      date: sixMonthDate,
      note: `First-year PTO grant (${grantDays} days, 6-month mark in month ${completionMonth})`,
    })
  }

  // ── Step 2: Monthly accruals after 1-year anniversary (1.25 days/month on the 1st) ──
  if (today >= oneYearDate) {
    // Find the first 1st-of-month that is >= oneYearDate
    const [oyYear, oyMonth, oyDay] = oneYearDate.split('-').map(Number)
    let accrualYear = oyYear
    let accrualMonth = oyMonth
    if (oyDay > 1) {
      // The anniversary falls mid-month; start crediting from the following month
      accrualMonth++
      if (accrualMonth > 12) { accrualMonth = 1; accrualYear++ }
    }

    // Walk through each 1st-of-month up to today
    while (true) {
      const firstOfMonth = `${accrualYear}-${String(accrualMonth).padStart(2, '0')}-01`
      if (firstOfMonth > today) break

      // Only credit months we haven't already credited (tracked by lastAccrualDate)
      if (!newLastAccrualDate || firstOfMonth > newLastAccrualDate) {
        newBalance += 1.25
        newEvents.push({
          type: 'monthly_accrual',
          days: 1.25,
          date: firstOfMonth,
          note: 'Monthly PTO accrual (1.25 days)',
        })
        // newLastAccrualDate is a const reference; track the latest via newEvents
      }

      accrualMonth++
      if (accrualMonth > 12) { accrualMonth = 1; accrualYear++ }
    }
  }

  if (newEvents.length === 0) {
    return {
      newBalance,
      newLastAccrualDate,
      newAccrualHistory: accrualHistory,
      hasChanges: false,
    }
  }

  // The last monthly_accrual event's date becomes the new lastAccrualDate
  const lastMonthlyEvent = [...newEvents].reverse().find(e => e.type === 'monthly_accrual')
  const updatedLastAccrualDate = lastMonthlyEvent
    ? lastMonthlyEvent.date
    : newLastAccrualDate

  return {
    newBalance,
    newLastAccrualDate: updatedLastAccrualDate,
    newAccrualHistory: [...accrualHistory, ...newEvents],
    hasChanges: true,
  }
}
