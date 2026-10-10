// Where to send a customer after they sign in.
//
// Callers hand the sign-in page `state.from` (a path string, or a location-like
// { pathname, search, hash }) or a `?next=` query. Only same-site paths are kept:
// they must start with a single "/" — "//evil.com" and "http://..." are dropped —
// and must not point back into the sign-in screens themselves.

const AUTH_PATH = /^\/(quick\/|shop\/)?auth(\/|$)/

export function safeRedirectPath(value) {
  let path = value
  if (path && typeof path === "object") {
    path = `${path.pathname || ""}${path.search || ""}${path.hash || ""}`
  }
  if (typeof path !== "string") return null
  path = path.trim()
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null
  // Control characters (and backslashes, which some browsers read as "/") never belong here.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(path)) return null
  if (AUTH_PATH.test(path)) return null
  return path
}

/** First usable target among the given candidates, else null. */
export function pickRedirectPath(...candidates) {
  for (const candidate of candidates) {
    const safe = safeRedirectPath(candidate)
    if (safe) return safe
  }
  return null
}
