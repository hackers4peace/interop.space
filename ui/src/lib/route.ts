// Group ids are full URLs. The router may hand the param back decoded or still
// percent-encoded, so normalize only when it has not already been decoded.
export const routeParam = (value: string): string =>
  value.includes('://') ? value : decodeURIComponent(value)
