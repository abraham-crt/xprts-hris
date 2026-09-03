// US Federal Holidays — computed dynamically for any year

export type Holiday = { date: string; name: string }

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  // weekday: 0=Sun, 1=Mon ... 6=Sat; n: 1=first, 2=second, etc.
  const first = new Date(year, month - 1, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0) // last day of month
  const offset = (last.getDay() - weekday + 7) % 7
  return new Date(year, month - 1, last.getDate() - offset)
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function usFederalHolidays(year: number): Holiday[] {
  return [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: fmt(nthWeekday(year, 1, 1, 3)), name: 'Martin Luther King Jr. Day' },
    { date: fmt(nthWeekday(year, 2, 1, 3)), name: "Presidents' Day" },
    { date: fmt(lastWeekday(year, 5, 1)), name: 'Memorial Day' },
    { date: `${year}-06-19`, name: 'Juneteenth' },
    { date: `${year}-07-04`, name: 'Independence Day' },
    { date: fmt(nthWeekday(year, 9, 1, 1)), name: 'Labor Day' },
    { date: fmt(nthWeekday(year, 10, 1, 2)), name: 'Columbus Day' },
    { date: `${year}-11-11`, name: 'Veterans Day' },
    { date: fmt(nthWeekday(year, 11, 4, 4)), name: 'Thanksgiving Day' },
    { date: `${year}-12-25`, name: 'Christmas Day' },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export function holidayMap(year: number): Record<string, string> {
  return Object.fromEntries(usFederalHolidays(year).map(h => [h.date, h.name]))
}
