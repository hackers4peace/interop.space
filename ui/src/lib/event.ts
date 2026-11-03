import type { Event } from '../worker/protocol'

// Dates are stored as xsd:dateTime in UTC, so format them in UTC too; the
// calendar date then matches the event's published date.
const dateFormat = new Intl.DateTimeFormat('en', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

export const eventDateRange = (
  event: Pick<Event, 'startDate' | 'endDate'>,
): string | undefined => {
  const { startDate, endDate } = event
  if (!startDate && !endDate) return undefined
  if (!startDate) return formatDate(endDate!)
  if (!endDate || startDate === endDate) return formatDate(startDate)
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}
