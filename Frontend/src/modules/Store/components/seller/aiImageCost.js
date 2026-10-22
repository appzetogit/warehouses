/**
 * What making `count` AI images will cost the store this month, from the image
 * studio status (GET /seller/ai/images/status). Included images (if the plan has
 * any) are used first; the rest are added to the monthly subscription bill.
 *
 * Returns { text, blocked, extra, amount }: `blocked` when the store's monthly
 * cap would be passed.
 */
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const rupees = (n) => `₹${Math.round((Number(n) || 0) * 100) / 100}`

export function aiImageCost(status, count) {
  const n = Math.max(0, Number(count) || 0)
  const price = Math.max(0, Number(status?.extraImagePrice) || 0)
  const included = Math.max(0, Number(status?.includedThisMonth) || 0)
  const remainingIncluded = Math.max(0, Number(status?.remainingIncluded) || 0)
  const left = status?.remainingThisMonth

  if (left !== null && left !== undefined && Number(left) < n) {
    return {
      text: Number(left) > 0
        ? `Only ${plural(Number(left), "AI image")} left for your store this month.`
        : "Your store has used all its AI images for this month.",
      blocked: true,
      extra: 0,
      amount: 0,
    }
  }

  const fromIncluded = included > 0 ? Math.min(n, remainingIncluded) : 0
  const extra = n - fromIncluded
  const amount = extra * price
  let text
  if (fromIncluded > 0 && extra === 0) {
    text = `Uses ${fromIncluded} of your ${included} included images this month.`
  } else if (fromIncluded > 0) {
    text = `Uses your last ${plural(fromIncluded, "included image")}; ${plural(extra, "extra image")} — ${rupees(amount)} will be added to your monthly bill.`
  } else if (included > 0) {
    text = `${plural(extra, "extra image")} — ${rupees(amount)} will be added to your monthly bill.`
  } else if (price > 0) {
    text = `${plural(extra, "image")} — ${rupees(amount)} will be added to your monthly bill.`
  } else {
    text = `Uses ${plural(n, "AI image")}.`
  }
  return { text, blocked: false, extra, amount }
}

/** One-line month summary for the seller's AI usage card. */
export function aiUsageSummary(usage) {
  if (!usage) return ""
  const used = Number(usage.usedThisMonth) || 0
  const included = Number(usage.includedThisMonth) || 0
  const base = included > 0 ? `${used} images made · ${Math.min(used, included)} of ${included} included` : `${plural(used, "image")} made`
  return `${base} · ${rupees(usage.extraCostThisMonth)} on this month's bill`
}
