import { useSearchParams } from '@solidjs/router'

// Append the current standards-body filter to an internal path.
export const withSdo = (path: string, sdo: string | undefined): string => {
  if (!sdo) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}sdo=${encodeURIComponent(sdo)}`
}

// The selected sdo is carried in the query string, so every internal link
// keeps it while the visitor moves around the site.
export const useSdoNav = () => {
  const [searchParams] = useSearchParams<{ sdo?: string }>()
  const sdo = () => searchParams.sdo
  return { sdo, href: (path: string) => withSdo(path, sdo()) }
}
