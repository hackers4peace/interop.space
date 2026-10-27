// Case-insensitive substring match over the one field a listing shows as its
// card title. An empty query matches everything.
export const matchesQuery = (name: string, query: string): boolean => {
  const normalized = query.trim().toLowerCase()
  return normalized.length === 0 || name.toLowerCase().includes(normalized)
}
