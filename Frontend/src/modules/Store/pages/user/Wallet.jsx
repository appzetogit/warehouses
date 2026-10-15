import { useState, useMemo, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Coins, IndianRupee, Plus, ArrowDownCircle, ArrowUpCircle, RefreshCw, Loader2 } from "lucide-react"
import AccountAppBar from "@store/components/user/account/AccountAppBar"
import AnimatedPage from "@store/components/user/AnimatedPage"
import AddMoneyModal from "@store/components/user/AddMoneyModal"
import { userAPI } from "@store/api"
import { toast } from "sonner"
import { useCompanyName } from "@store/hooks/useCompanyName"
import useAppBackNavigation from "@store/hooks/useAppBackNavigation"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const TRANSACTION_TYPES = {
  ALL: "all",
  ADDITIONS: "additions",
  DEDUCTIONS: "deductions",
  REFUNDS: "refunds",
}

export default function Wallet() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const [selectedFilter, setSelectedFilter] = useState(TRANSACTION_TYPES.ALL)
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addMoneyModalOpen, setAddMoneyModalOpen] = useState(false)

  const fetchWalletData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await userAPI.getWallet()
      const walletData = response?.data?.data?.wallet || response?.data?.wallet

      if (walletData) {
        setWallet(walletData)
        setTransactions(walletData.transactions || [])
      }
    } catch (err) {
      debugError("Error fetching wallet:", err)
      setError(err?.response?.data?.message || "Failed to load wallet")
      toast.error("Failed to load wallet data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWalletData()
  }, [])

  const currentBalance = wallet?.balance || 0

  const referralEarnings = useMemo(() => {
    if (wallet?.referralEarnings != null) {
      return Number(wallet.referralEarnings) || 0
    }

    return transactions
      .filter(
        (transaction) =>
          transaction.type === "addition" &&
          transaction.status === "Completed" &&
          (transaction?.metadata?.source === "referral_signup" ||
            String(transaction.description || "").toLowerCase().startsWith("referral reward"))
      )
      .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  }, [wallet, transactions])

  const filteredTransactions = useMemo(() => {
    if (selectedFilter === TRANSACTION_TYPES.ALL) {
      return transactions
    }

    return transactions.filter((transaction) => {
      if (selectedFilter === TRANSACTION_TYPES.ADDITIONS) {
        return transaction.type === "addition"
      }
      if (selectedFilter === TRANSACTION_TYPES.DEDUCTIONS) {
        return transaction.type === "deduction"
      }
      if (selectedFilter === TRANSACTION_TYPES.REFUNDS) {
        return transaction.type === "refund"
      }
      return true
    })
  }, [selectedFilter, transactions])

  const formatAmount = (amount) => {
    const numeric = Number(amount ?? 0)
    const safe = Number.isFinite(numeric) ? numeric : 0
    return `${"\u20B9"}${safe.toLocaleString("en-IN")}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"

    const date = new Date(dateString)
    const formattedDate = date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const formattedTime = date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })

    return `${formattedDate} | ${formattedTime}`
  }

  const getTransactionIcon = (type) => {
    switch (type) {
      case "addition":
        return <ArrowDownCircle className="h-6 w-6 text-app-ok" aria-hidden="true" />
      case "deduction":
        return <ArrowUpCircle className="h-6 w-6 text-[#B3261E]" aria-hidden="true" />
      case "refund":
        return <RefreshCw className="h-6 w-6 text-app-brown" aria-hidden="true" />
      default:
        return null
    }
  }

  const getTransactionColor = (type) => {
    switch (type) {
      case "addition":
        return "text-app-ok"
      case "deduction":
        return "text-[#B3261E]"
      case "refund":
        return "text-app-brown"
      default:
        return "text-app-muted"
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-app-cream font-app text-app-ink dark:bg-[#0a0a0a]">
      <AccountAppBar
        title="Wallet"
        onBack={goBack}
        right={
          <Link
            to="/coins"
            className="mr-1 inline-flex items-center gap-1 rounded-full bg-app-sand px-3 py-1.5 text-[12.5px] font-semibold text-app-brown hover:bg-app-tint-strong"
          >
            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
            My Coins
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 lg:max-w-4xl lg:space-y-6 lg:px-8 lg:py-8">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-app-brown" aria-label="Loading wallet" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-[#F5C2C7] bg-[#FFF0F2] p-4">
            <p className="text-[13.5px] text-[#9F1239]">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Balance */}
            <section className="overflow-hidden rounded-[20px] bg-gradient-to-br from-[#6E4129] via-app-brown to-app-brown-deep p-5 text-white shadow-[0_10px_24px_rgba(88,50,29,0.25)] lg:p-7">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 lg:h-16 lg:w-16">
                    <IndianRupee className="h-7 w-7 text-app-champagne lg:h-8 lg:w-8" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white/80">{companyName} Money</p>
                    <p className="text-[32px] font-extrabold leading-tight tabular-nums lg:text-[40px]">{formatAmount(currentBalance)}</p>
                    <p className="text-[12px] text-white/70">Current Balance</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddMoneyModalOpen(true)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-app-champagne px-6 text-[15px] font-bold text-app-brown-deep transition-colors hover:bg-[#F0D2B3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:w-auto md:min-w-[200px]"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  Add Money
                </button>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3">
                <div>
                  <p className="text-[12px] text-white/75">Referral Earnings</p>
                  <p className="text-[18px] font-bold tabular-nums text-app-champagne">{formatAmount(referralEarnings)}</p>
                </div>
                <p className="max-w-xs text-[12px] text-white/75">Add money to enjoy one-tap, seamless payments</p>
              </div>
            </section>

            {/* Transaction history */}
            <section className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-[16px] font-bold text-app-ink dark:text-white">Transaction History</h2>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:pb-0" role="tablist" aria-label="Filter transactions">
                  {[
                    { id: TRANSACTION_TYPES.ALL, label: "All Transactions" },
                    { id: TRANSACTION_TYPES.ADDITIONS, label: "Additions" },
                    { id: TRANSACTION_TYPES.DEDUCTIONS, label: "Deductions" },
                    { id: TRANSACTION_TYPES.REFUNDS, label: "Refunds" },
                  ].map((filter) => {
                    const isSelected = selectedFilter === filter.id
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setSelectedFilter(filter.id)}
                        className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                          isSelected ? "bg-app-brown text-white" : "bg-app-sand text-app-brown-deep hover:bg-app-tint-strong"
                        }`}
                      >
                        {filter.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {filteredTransactions.length > 0 ? (
                <ul className="divide-y divide-app-line overflow-hidden rounded-[18px] border border-app-line bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-[#1a1a1a]">
                  {filteredTransactions.map((transaction) => (
                    <li key={transaction.id} className="flex items-center justify-between gap-4 px-4 py-3.5 lg:px-5">
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-tint">
                          {getTransactionIcon(transaction.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-app-ink dark:text-white">{transaction.description}</p>
                          {(transaction?.metadata?.source === "referral_signup" ||
                            String(transaction.description || "").toLowerCase().startsWith("referral reward")) && (
                            <p className="text-[11px] font-medium text-app-ok">Referral Reward</p>
                          )}
                          <p className="text-[12px] text-app-muted">{formatDate(transaction.date || transaction.createdAt)}</p>
                        </div>
                      </div>
                      <div className={`shrink-0 text-[16px] font-bold tabular-nums ${getTransactionColor(transaction.type)}`}>
                        {transaction.type === "deduction" ? "-" : "+"}
                        {formatAmount(transaction.amount)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-[18px] border border-app-line bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
                  <div className="mx-auto mb-6 max-w-md space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-xl bg-app-alt px-4 py-3"
                        style={{
                          opacity: 0.3 + i * 0.15,
                        }}
                      >
                        <div className="h-10 w-10 shrink-0 rounded-lg bg-app-sand" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-3/4 rounded bg-app-sand" />
                          <div className="h-2 w-1/2 rounded bg-app-sand" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[14px] font-medium text-app-muted">Your transactions will appear here</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <AddMoneyModal
        open={addMoneyModalOpen}
        onOpenChange={setAddMoneyModalOpen}
        onSuccess={fetchWalletData}
      />
    </AnimatedPage>
  )
}
