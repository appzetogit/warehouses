import React from "react"

/** Seller-side helpers for the Quick / Shop channels (see CHANNELS_CONTRACT.md). */
export const CHANNELS = ["quick", "shop"]

export const CHANNEL_INFO = {
  quick: {
    label: "Quick",
    blurb: "Delivered by riders in minutes from your store inside a service zone.",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  shop: {
    label: "Shop",
    blurb: "Shipped by courier to customers anywhere, from your pickup address.",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
}

export const CHANNEL_STATUS_LABEL = {
  none: "Not applied",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
}

/** Seller's channel status, defaulting to 'none'. */
export const channelStatus = (seller, channel) =>
  seller?.channels?.[channel]?.status || "none"

export const isChannelApproved = (seller, channel) =>
  channelStatus(seller, channel) === "approved"

/** Product channel flags, defaulting to true per the contract. */
export const productChannels = (p) => ({
  quick: p?.channels?.quick !== false,
  shop: p?.channels?.shop !== false,
})

const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))

export const channelStock = (entity, channel) => numOrNull(entity?.stock?.[channel])

/**
 * What a product has to sell on a channel. With variants the stock lives on
 * them, so add theirs up; a variant with no count draws on the product's, so
 * then the product's count (or "not counted") is what limits it.
 */
export const productChannelStock = (product, channel) => {
  const variants = (Array.isArray(product?.variants) ? product.variants : []).filter((v) => v?.isActive !== false)
  if (!variants.length) return channelStock(product, channel)
  const counts = variants.map((v) => channelStock(v, channel))
  if (counts.some((n) => n === null)) return channelStock(product, channel)
  return counts.reduce((sum, n) => sum + n, 0)
}
export const channelThreshold = (entity, channel) => numOrNull(entity?.lowStockThreshold?.[channel])

/** Form input value -> contract number|null (empty = null = not counted / inherit product stock). */
export const toStockValue = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const formatStock = (n) => (n === null || n === undefined ? "Not counted" : String(n))

export function ChannelBadges({ product, showStock = false, className = "" }) {
  const ch = productChannels(product)
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {CHANNELS.filter((c) => ch[c]).map((c) => {
        const s = productChannelStock(product, c)
        return (
          <span
            key={c}
            className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CHANNEL_INFO[c].badge}`}
          >
            {CHANNEL_INFO[c].label}
            {showStock ? `: ${s === null ? "∞" : s}` : ""}
          </span>
        )
      })}
    </span>
  )
}
