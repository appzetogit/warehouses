import { useCallback, useEffect, useState } from "react"
import { Coins as CoinsIcon, Loader2, Lock, Clock } from "lucide-react"
import AnimatedPage from "@store/components/user/AnimatedPage"
import AccountAppBar from "@store/components/user/account/AccountAppBar"
import { coinsAPI } from "@store/api"
import useAppBackNavigation from "@store/hooks/useAppBackNavigation"

const PAGE_SIZE = 20

const SOURCE_LABEL = {
  refund: "Refund",
  admin: "Added by support",
  campaign: "Promotion",
  spin: "Spin reward",
  referral: "Referral Reward",
  reversal: "Returned",
}

function entryLabel(entry) {
  switch (entry.type) {
    case "credit":
      return SOURCE_LABEL[entry.source] || "Coins added"
    case "debit":
      return "Used on an order"
    case "reversal":
      return "Returned from an order"
    case "expire":
      return "Expired"
    case "adjust":
      return "Removed by support"
    default:
      return "Coins"
  }
}

const signedOf = (entry) => {
  if (Number.isFinite(Number(entry.signedAmount))) return Number(entry.signedAmount)
  const n = Math.abs(Number(entry.amount) || 0)
  return ["debit", "expire", "adjust"].includes(entry.type) ? -n : n
}

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""

const dataOf = (res) => res?.data?.data ?? res?.data ?? null

export default function Coins() {
  const goBack = useAppBackNavigation()
  const [balance, setBalance] = useState(null)
  const [expiring, setExpiring] = useState({ lots: [], total: 0 })
  const [entries, setEntries] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingPage, setLoadingPage] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    Promise.all([coinsAPI.getBalance(), coinsAPI.getExpiring(30)])
      .then(([b, e]) => {
        if (!alive) return
        setBalance(dataOf(b))
        setExpiring(dataOf(e) || { lots: [], total: 0 })
      })
      .catch(() => alive && setError("Could not load your coins. Please try again."))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const loadPage = useCallback(async (p) => {
    setLoadingPage(true)
    try {
      const data = dataOf(await coinsAPI.getLedger({ page: p, limit: PAGE_SIZE }))
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
      setTotalPages(Math.max(1, Number(data?.totalPages) || Math.ceil((Number(data?.total) || 0) / PAGE_SIZE) || 1))
      setPage(p)
    } catch {
      setError("Could not load your coin history.")
    } finally {
      setLoadingPage(false)
    }
  }, [])

  useEffect(() => {
    loadPage(1)
  }, [loadPage])

  const coins = Number(balance?.coins) || 0
  const usable = Number(balance?.usable) || 0
  const locked = Math.max(0, coins - usable)

  return (
    <AnimatedPage className="min-h-screen bg-app-cream font-app text-app-ink dark:bg-[#0a0a0a]">
      <AccountAppBar title="Coins" onBack={goBack} />

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 lg:px-8 lg:py-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-app-brown" aria-label="Loading coins" />
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-2xl border border-[#F5C2C7] bg-[#FFF0F2] p-4 text-[13.5px] text-[#9F1239]">
                {error}
              </div>
            )}

            <section className="rounded-[20px] bg-gradient-to-br from-[#6E4129] via-app-brown to-app-brown-deep p-5 text-white shadow-[0_10px_24px_rgba(88,50,29,0.25)] lg:p-6">
              <div className="flex items-center gap-2 text-[13px] font-medium text-white/80">
                <CoinsIcon className="h-4 w-4 text-app-champagne" aria-hidden="true" /> Your coins
              </div>
              <p className="mt-1 text-[40px] font-extrabold leading-tight tabular-nums">{coins}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/12 p-3">
                  <p className="text-[12px] text-white/75">Usable</p>
                  <p className="text-[20px] font-bold tabular-nums text-app-champagne">{usable}</p>
                  {Number(balance?.usableValue) > 0 && (
                    <p className="text-[11px] text-white/75">Worth {"₹"}{Number(balance.usableValue).toFixed(0)}</p>
                  )}
                </div>
                <div className="rounded-xl bg-white/12 p-3">
                  <p className="flex items-center gap-1 text-[12px] text-white/75">
                    <Lock className="h-3 w-3" aria-hidden="true" /> Locked
                  </p>
                  <p className="text-[20px] font-bold tabular-nums">{locked}</p>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] text-white/75">
                Only 80% of the coins from each credit can be spent; the rest stay locked. Coins can pay for part of an order.
              </p>
              {balance && balance.isEnabled === false && (
                <p className="mt-2 text-[12px] font-semibold text-app-champagne">Coins can't be used on orders right now.</p>
              )}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-[16px] font-bold text-app-ink dark:text-white">
                <Clock className="h-4 w-4 text-app-brown" aria-hidden="true" /> Expiring in the next 30 days
              </h2>
              {expiring.lots?.length ? (
                <ul className="divide-y divide-app-line overflow-hidden rounded-[18px] border border-app-line bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-[#1a1a1a]">
                  {expiring.lots.map((lot) => (
                    <li key={lot.lotId} className="flex items-center justify-between gap-3 px-4 py-3 text-[13.5px]">
                      <div>
                        <p className="font-semibold text-app-ink dark:text-white">{lot.coins} coins</p>
                        <p className="text-[12px] text-app-muted">
                          {SOURCE_LABEL[lot.source] || "Coins"}
                          {lot.locked > 0 ? ` · ${lot.usable} usable, ${lot.locked} locked` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#FFF0F2] px-2.5 py-1 text-[11.5px] font-semibold text-[#B3261E]">
                        Expires {formatDate(lot.expiresAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[18px] border border-app-line bg-white px-4 py-4 text-[13px] text-app-muted dark:border-gray-800 dark:bg-[#1a1a1a]">
                  No coins expire in the next 30 days.
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-2 px-1 text-[16px] font-bold text-app-ink dark:text-white">History</h2>
              {loadingPage ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-app-brown" aria-label="Loading history" />
                </div>
              ) : entries.length ? (
                <ul className="divide-y divide-app-line overflow-hidden rounded-[18px] border border-app-line bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-[#1a1a1a]">
                  {entries.map((entry) => {
                    const n = signedOf(entry)
                    return (
                      <li key={entry._id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13.5px]">
                        <div className="min-w-0">
                          <p className="font-semibold text-app-ink dark:text-white">{entryLabel(entry)}</p>
                          <p className="truncate text-[12px] text-app-muted">
                            {formatDate(entry.createdAt)}
                            {entry.note ? ` · ${entry.note}` : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 font-bold tabular-nums ${n >= 0 ? "text-app-ok" : "text-[#B3261E]"}`}>
                          {n >= 0 ? `+${n}` : `−${Math.abs(n)}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="rounded-[18px] border border-app-line bg-white px-4 py-4 text-[13px] text-app-muted dark:border-gray-800 dark:bg-[#1a1a1a]">
                  No coin activity yet.
                </p>
              )}

              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-[13px]">
                  <button
                    type="button"
                    disabled={page <= 1 || loadingPage}
                    onClick={() => loadPage(page - 1)}
                    className="rounded-xl border border-app-brown bg-white px-3.5 py-1.5 font-semibold text-app-brown hover:bg-app-tint disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-app-muted">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loadingPage}
                    onClick={() => loadPage(page + 1)}
                    className="rounded-xl border border-app-brown bg-white px-3.5 py-1.5 font-semibold text-app-brown hover:bg-app-tint disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AnimatedPage>
  )
}
