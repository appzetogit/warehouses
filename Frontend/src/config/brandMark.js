import { APP_CONFIG } from "./constants"

const escapeXml = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]))

/**
 * The brand name drawn as an image, for wherever a logo is expected and none
 * has been uploaded in Business Settings. An image rather than a text node so
 * every <img src={logoUrl || fallback}> and onError swap keeps working as is.
 */
export const brandMarkUrl = (name = APP_CONFIG.NAME) => {
  const text = escapeXml(name || APP_CONFIG.NAME)
  const width = Math.max(120, text.length * 22)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="48" viewBox="0 0 ${width} 48">` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" ` +
    `font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="30" font-weight="700" fill="#111827">${text}</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** The fallback for the configured name; pages that know the company name can call brandMarkUrl(name). */
const brandMark = brandMarkUrl()

export default brandMark
