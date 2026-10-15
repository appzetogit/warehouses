/**
 * Product page reviews: average + star histogram, sort (newest / most
 * helpful), filter by star, the list with photos and seller replies, one
 * "Helpful" vote per customer, and "Write a Review" when the server says the
 * signed-in customer received this product. Used by the mobile and desktop pages.
 */
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { BadgeCheck, Flag, Loader2, PenLine, Star, Store, ThumbsUp } from "lucide-react"
import { toast } from "sonner"
import { catalogAPI, userAPI } from "@store/api"
import { isModuleAuthenticated } from "@store/utils/auth"
import ReviewFormDialog from "./ReviewFormDialog"

const PAGE_SIZE = 10
const dateFmt = (d) => {
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d))
  } catch {
    return ""
  }
}

/*
 * Phone variant, styled after the customer app's reviews band
 * (product_details_screen.dart _Reviews): a green average box, one coloured
 * bar per grade, then up to three reviews with a grade pill.
 */
const GRADES = {
  5: ["Very Good", "#0F8A4F"],
  4: ["Good", "#3CC47C"],
  3: ["Ok-Ok", "#F5B223"],
  2: ["Bad", "#EF7A2B"],
  1: ["Very Bad", "#D32F2F"],
}
const gradeOf = (rating) => GRADES[Math.min(5, Math.max(1, Math.round(Number(rating) || 1)))]
const appRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"

const postedAgo = (d) => {
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return ""
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return "Posted today"
  if (days === 1) return "Posted 1 day ago"
  if (days < 30) return `Posted ${days} days ago`
  const m = Math.floor(days / 30)
  return `Posted ${m} ${m === 1 ? "month" : "months"} ago`
}

function AppReviewItem({ review, signedIn, onVote, onReport }) {
  const [busy, setBusy] = useState(false)
  const act = async (fn) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }
  const [grade, colour] = gradeOf(review.rating)
  return (
    <li className="pt-[18px]">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-0.5 rounded-2xl px-[9px] py-1 text-[13px] font-extrabold text-white" style={{ background: colour }}>
          {Math.round(Number(review.rating) || 0)} <Star className="h-[13px] w-[13px] fill-white" strokeWidth={0} aria-hidden="true" />
          <span className="sr-only"> out of 5</span>
        </span>
        <span className="text-[14.5px] font-bold text-app-ink">{grade}</span>
        <span className="min-w-0 truncate text-[12.5px] text-app-muted">{postedAgo(review.createdAt)}</span>
      </div>
      {review.title ? <p className="mt-2 text-[14px] font-bold text-app-ink">{review.title}</p> : null}
      {review.text ? <p className="mt-2 whitespace-pre-line text-[14px] text-app-ink">{review.text}</p> : null}
      {review.images?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {review.images.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={`block h-16 w-16 overflow-hidden rounded-lg border border-app-line ${appRing}`}>
              <img src={url} alt={`Photo from ${review.author?.name || "a customer"}`} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-[12.5px] text-app-muted">
        ~{review.author?.name || "Customer"}
        {review.variantName ? ` · ${review.variantName}` : ""}
        {review.edited ? " · edited" : ""}
        <span className="ml-1 inline-flex items-center gap-0.5 text-app-ok">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified purchase
        </span>
      </p>
      {review.reply ? (
        <div className="mt-2 rounded-lg border-l-4 border-app-brown bg-app-tint px-3 py-2">
          <p className="inline-flex items-center gap-1 text-[12px] font-bold text-app-ink">
            <Store className="h-3.5 w-3.5" aria-hidden="true" /> Response from the seller
          </p>
          <p className="mt-1 whitespace-pre-line text-[13px] text-app-ink">{review.reply.text}</p>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-app-muted">
        {review.helpfulCount > 0 ? <span>{review.helpfulCount} {review.helpfulCount === 1 ? "person" : "people"} found this helpful</span> : null}
        {signedIn && !review.isMine ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => onVote(review))}
              aria-pressed={Boolean(review.votedHelpful)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-medium ${appRing} ${
                review.votedHelpful ? "border-app-brown bg-app-tint text-app-brown" : "border-app-line bg-white text-app-ink"
              }`}
            >
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> Helpful
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => onReport(review))}
              className={`inline-flex items-center gap-1 rounded text-app-muted ${appRing}`}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report
            </button>
          </>
        ) : null}
        {review.isMine ? <span className="font-medium text-app-brown">Your Review</span> : null}
      </div>
    </li>
  )
}

function AppStyleReviews({
  productId, productName, summary, total, reviews, star, setStar, sort, setSort, loading, hasMore, onMore, onReload,
  signedIn, eligible, myReview, formOpen, setFormOpen, onVote, onReport,
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? reviews : reviews.slice(0, 3)
  const canExpand = !showAll && reviews.length > 3
  const histogram = summary.histogram || {}
  const headingId = `reviews-${productId}`

  return (
    <section aria-labelledby={headingId} className="mt-2 w-full bg-white px-[14px] pb-4 pt-[18px] font-app text-app-ink">
      <h2 id={headingId} className="text-[17px] font-extrabold text-app-ink">Customer Ratings &amp; Reviews</h2>

      {total > 0 ? (
        <div className="mt-4 flex items-start gap-[14px]">
          <div className="w-28 shrink-0 overflow-hidden rounded-[10px] border border-[#E2E2E2]">
            <p className="flex items-center justify-center gap-1 bg-[#1E9E5A] py-3 text-[26px] font-extrabold leading-none text-white">
              {Number(summary.averageRating).toFixed(1)}
              <Star className="h-6 w-6 fill-white" strokeWidth={0} aria-hidden="true" />
              <span className="sr-only"> out of 5</span>
            </p>
            <p className="py-2.5 text-center text-[12px] text-app-muted">{total.toLocaleString("en-IN")} rating{total === 1 ? "" : "s"}</p>
          </div>
          <ul className="min-w-0 flex-1">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = Number(histogram[s]) || 0
              const pct = total ? Math.round((n / total) * 100) : 0
              const [label, colour] = GRADES[s]
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setStar(star === s ? null : s)}
                    disabled={!n}
                    aria-pressed={star === s}
                    aria-label={`${label}: ${n} rating${n === 1 ? "" : "s"}${n ? (star === s ? ", showing only these" : ", show only these") : ""}`}
                    className={`flex w-full items-center gap-2 rounded py-1 text-left disabled:cursor-default ${appRing} ${star && star !== s ? "opacity-50" : ""}`}
                  >
                    <span className="w-[66px] shrink-0 text-[12.5px] text-[#4A423D]">{label}</span>
                    <span className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-[#E9E9E9]" aria-hidden="true">
                      <span className="block h-full rounded-[3px]" style={{ width: `${pct}%`, background: colour }} />
                    </span>
                    <span className="w-6 shrink-0 text-right text-[12.5px] text-app-muted">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {signedIn && (eligible || myReview) ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className={`mt-[14px] inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-app-brown bg-white px-4 text-[13.5px] font-semibold text-app-brown active:bg-app-tint ${appRing}`}
        >
          <PenLine className="h-[18px] w-[18px]" aria-hidden="true" />
          {myReview ? "Edit your review" : "Write a review"}
        </button>
      ) : !signedIn ? (
        <p className="mt-[14px] text-[13px] text-app-muted">
          <Link to="/auth/login" className={`rounded font-semibold text-app-brown underline ${appRing}`}>Sign in</Link> to review products you've received.
        </p>
      ) : null}

      {star || reviews.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <p className="font-bold text-app-ink">
            {star ? `${GRADES[star][0]} reviews` : "Top Reviews"}
            {star ? (
              <button type="button" onClick={() => setStar(null)} className={`ml-2 rounded text-[12px] font-semibold text-app-brown underline ${appRing}`}>Show all</button>
            ) : null}
          </p>
          <label className="inline-flex items-center gap-2">
            <span className="text-app-muted">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className={`rounded-lg border border-app-line bg-white px-2 py-1 text-app-ink ${appRing}`}
            >
              <option value="newest">Newest</option>
              <option value="helpful">Most Helpful</option>
            </select>
          </label>
        </div>
      ) : null}

      {loading && !reviews.length ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-app-muted" aria-label="Loading reviews" /></div>
      ) : visible.length ? (
        <ul>
          {visible.map((r) => <AppReviewItem key={r.id} review={r} signedIn={signedIn} onVote={onVote} onReport={onReport} />)}
        </ul>
      ) : star ? (
        <p className="pt-4 text-[13px] text-app-muted">No reviews with this rating.</p>
      ) : null}

      {canExpand || hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => (canExpand ? setShowAll(true) : onMore())}
          className={`mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-app-line bg-white px-4 text-[13px] font-semibold text-app-brown disabled:opacity-50 ${appRing}`}
        >
          {loading ? "Loading…" : "More Reviews"}
        </button>
      ) : null}

      <ReviewFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={productId}
        productName={productName}
        onSaved={onReload}
      />
    </section>
  )
}

export default function ProductReviews({ productId, productName, variant = "mobile" }) {
  const signedIn = isModuleAuthenticated("user")
  const [data, setData] = useState(null)
  const [reviews, setReviews] = useState([])
  const [sort, setSort] = useState("newest")
  const [star, setStar] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [eligible, setEligible] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async (nextPage = 1) => {
    if (!productId) return
    setLoading(true)
    try {
      const res = await catalogAPI.getProductReviews(productId, { sort, rating: star || undefined, page: nextPage, limit: PAGE_SIZE })
      const d = res?.data?.data || null
      setData(d)
      setPage(nextPage)
      setReviews((prev) => (nextPage === 1 ? d?.reviews || [] : [...prev, ...(d?.reviews || [])]))
    } catch {
      if (nextPage === 1) setReviews([])
    } finally {
      setLoading(false)
    }
  }, [productId, sort, star])

  useEffect(() => { load(1) }, [load])

  useEffect(() => {
    if (!signedIn || !productId) return
    let cancelled = false
    userAPI.getReviewEligibility(productId)
      .then((res) => { if (!cancelled) setEligible(Boolean(res?.data?.data?.eligible)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [signedIn, productId])

  const onVote = async (review) => {
    try {
      const res = review.votedHelpful ? await userAPI.unmarkReviewHelpful(review.id) : await userAPI.markReviewHelpful(review.id)
      const d = res?.data?.data || {}
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, helpfulCount: d.helpfulCount ?? r.helpfulCount, votedHelpful: d.votedHelpful } : r)))
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not record your vote")
    }
  }

  const onReport = async (review) => {
    const reason = window.prompt("Why are you reporting this review?")
    if (!reason || !reason.trim()) return
    try {
      await userAPI.reportProductReview(review.id, reason.trim())
      toast.success("Thanks, our team will take a look")
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not report this review")
    }
  }

  const summary = data?.summary || { averageRating: 0, totalRatings: 0, histogram: {} }
  const total = Number(summary.totalRatings) || 0
  const hasMore = data?.pagination ? page < data.pagination.totalPages : false
  const desktop = variant === "desktop"
  const myReview = data?.myReview

  // No reviews and nothing this shopper can write: no empty box on the page.
  if (!total && !myReview && !eligible && !star && !reviews.length) return null

  if (!desktop) {
    return (
      <AppStyleReviews
        productId={productId}
        productName={productName}
        summary={summary}
        total={total}
        reviews={reviews}
        star={star}
        setStar={setStar}
        sort={sort}
        setSort={setSort}
        loading={loading}
        hasMore={hasMore}
        onMore={() => load(page + 1)}
        onReload={() => load(1)}
        signedIn={signedIn}
        eligible={eligible}
        myReview={myReview}
        formOpen={formOpen}
        setFormOpen={setFormOpen}
        onVote={onVote}
        onReport={onReport}
      />
    )
  }

  // Desktop: the app's reviews band laid out wide — the green average box,
  // grade bars and "Write a review" on the left, the reviews on the right.
  const headingId = `reviews-${productId}`
  const histogram = summary.histogram || {}
  return (
    <section aria-labelledby={headingId} className="rounded-[18px] bg-white px-6 py-6 font-app text-app-ink">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12">
        <div>
          <h2 id={headingId} className="font-app-display text-[28px] font-bold leading-[1.1] text-app-brown">Ratings &amp; Reviews</h2>

          {total > 0 ? (
            <div className="mt-5 flex items-start gap-4">
              <div className="w-28 shrink-0 overflow-hidden rounded-[10px] border border-[#E2E2E2]">
                <p className="flex items-center justify-center gap-1 bg-[#1E9E5A] py-3 text-[26px] font-extrabold leading-none text-white">
                  {Number(summary.averageRating).toFixed(1)}
                  <Star className="h-6 w-6 fill-white" strokeWidth={0} aria-hidden="true" />
                  <span className="sr-only"> out of 5</span>
                </p>
                <p className="py-2.5 text-center text-[12px] text-app-muted">{total.toLocaleString("en-IN")} rating{total === 1 ? "" : "s"}</p>
              </div>
              <ul className="min-w-0 flex-1">
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = Number(histogram[s]) || 0
                  const pct = total ? Math.round((n / total) * 100) : 0
                  const [label, colour] = GRADES[s]
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => setStar(star === s ? null : s)}
                        disabled={!n}
                        aria-pressed={star === s}
                        aria-label={`${label}: ${n} rating${n === 1 ? "" : "s"}${n ? (star === s ? ", showing only these" : ", show only these") : ""}`}
                        className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-app-alt disabled:cursor-default disabled:hover:bg-transparent ${appRing} ${star && star !== s ? "opacity-50" : ""}`}
                      >
                        <span className="w-[66px] shrink-0 text-[12.5px] text-[#4A423D]">{label}</span>
                        <span className="h-[6px] flex-1 overflow-hidden rounded-[3px] bg-[#E9E9E9]" aria-hidden="true">
                          <span className="block h-full rounded-[3px]" style={{ width: `${pct}%`, background: colour }} />
                        </span>
                        <span className="w-7 shrink-0 text-right text-[12.5px] text-app-muted">{n}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-app-muted">No ratings yet.</p>
          )}

          {signedIn && (eligible || myReview) ? (
            <div className="mt-6 rounded-xl bg-app-tint p-4">
              <p className="text-[14px] font-bold text-app-ink">{myReview ? "Your review" : "Review this product"}</p>
              <p className="mt-0.5 text-[12.5px] text-app-muted">{myReview ? "You can update it any time." : "Share your thoughts with other customers."}</p>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className={`mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-app-brown px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-app-brown-deep ${appRing}`}
              >
                <PenLine className="h-[18px] w-[18px]" aria-hidden="true" />
                {myReview ? "Edit your review" : "Write a review"}
              </button>
            </div>
          ) : !signedIn ? (
            <p className="mt-5 text-[13px] text-app-muted">
              <Link to="/auth/login" className={`rounded font-semibold text-app-brown underline ${appRing}`}>Sign in</Link> to review products you've received.
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line pb-3 text-[13px]">
            <p className="text-[15px] font-bold text-app-ink">
              {star ? `${GRADES[star][0]} reviews` : "Top Reviews"}
              {star ? (
                <button type="button" onClick={() => setStar(null)} className={`ml-2 rounded text-[12px] font-semibold text-app-brown underline ${appRing}`}>Show all</button>
              ) : null}
            </p>
            <label className="inline-flex items-center gap-2">
              <span className="text-app-muted">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className={`h-9 cursor-pointer rounded-full border border-app-line bg-white px-3 font-semibold text-app-ink ${appRing}`}
              >
                <option value="newest">Newest</option>
                <option value="helpful">Most Helpful</option>
              </select>
            </label>
          </div>

          {loading && !reviews.length ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-app-muted" aria-label="Loading reviews" /></div>
          ) : reviews.length ? (
            <ul className="divide-y divide-app-line [&>li]:pb-[18px]">
              {reviews.map((r) => <AppReviewItem key={r.id} review={r} signedIn={signedIn} onVote={onVote} onReport={onReport} />)}
            </ul>
          ) : (
            <p className="py-6 text-[13px] text-app-muted">{star ? "No reviews with this rating." : "No written reviews yet."}</p>
          )}

          {hasMore ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => load(page + 1)}
              className={`mt-3 inline-flex h-10 items-center justify-center rounded-full border border-app-brown bg-white px-5 text-[13px] font-semibold text-app-brown transition-colors hover:bg-app-tint disabled:opacity-50 ${appRing}`}
            >
              {loading ? "Loading…" : "More Reviews"}
            </button>
          ) : null}
        </div>
      </div>

      <ReviewFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={productId}
        productName={productName}
        onSaved={() => load(1)}
      />
    </section>
  )
}
