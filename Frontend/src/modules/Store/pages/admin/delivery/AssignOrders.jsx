import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import io from "socket.io-client"
import {
  AlertTriangle,
  Banknote,
  Bike,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Store,
  Truck,
  Users,
} from "lucide-react"
import { adminAPI } from "@store/api"
import { API_BASE_URL } from "@store/api/config"
import { useAdminPanel } from "@store/components/admin/useAdminPanel"
import {
  activeTrips,
  formatKm,
  hasMixedStores,
  locationFreshness,
  pruneSelection,
  remainingCapacity,
  riderBlockReason,
  sortRiders,
  statusLabel,
  storeOptions,
  validateSelection,
  waitSeverity,
} from "@store/utils/dispatchBoard"

/**
 * Assign Orders: manual dispatch of Quick orders. Waiting orders (no rider
 * yet) on the left, online riders on the right; pick orders and a rider and
 * assign. Active Trips lists riders carrying orders, with Move and Unassign
 * before pickup. The dispatch mode and limits are edited at the top.
 */

const POLL_MS = 15000
const message = (e, fallback) => e?.response?.data?.message || e?.message || fallback
const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"

const SEVERITY_CLS = {
  ok: "text-slate-500",
  warn: "text-amber-600 font-semibold",
  late: "text-rose-600 font-semibold",
}

function StatusChip({ status }) {
  const cls =
    status === "ready_for_pickup"
      ? "bg-emerald-50 text-emerald-700"
      : status === "preparing"
        ? "bg-blue-50 text-blue-700"
        : "bg-slate-100 text-slate-600"
  return <span className={`${chip} ${cls}`}>{statusLabel(status)}</span>
}

function useDispatchSocket(onEvent) {
  const handler = useRef(onEvent)
  handler.current = onEvent
  useEffect(() => {
    const backendUrl = String(API_BASE_URL || "").replace(/\/api(\/v\d+)?\/?$/, "")
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("admin_accessToken") : null
    if (!backendUrl.startsWith("http") || !token) return undefined
    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: { token },
    })
    const fire = (payload) => handler.current?.(payload)
    socket.on("order_needs_rider", fire)
    socket.on("order_waiting_alert", fire)
    return () => {
      socket.off("order_needs_rider", fire)
      socket.off("order_waiting_alert", fire)
      socket.disconnect()
    }
  }, [])
}

/* ─────────────────────────── Settings ─────────────────────────── */

const toDraft = (s) => ({
  dispatchMode: s?.dispatchMode === "manual" ? "manual" : "auto",
  maxOrdersPerRider: String(s?.maxOrdersPerRider ?? 1),
  multiOrderTrips: Boolean(s?.multiOrderTrips),
  manualAlertMinutes: String(s?.manualAlertMinutes ?? 5),
  manualFallbackMinutes: String(s?.manualFallbackMinutes ?? 0),
})

function SettingsCard({ settings, onSaved }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => toDraft(settings))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) setDraft(toDraft(settings))
  }, [settings, open])

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    const body = {
      dispatchMode: draft.dispatchMode,
      maxOrdersPerRider: Number(draft.maxOrdersPerRider),
      multiOrderTrips: draft.multiOrderTrips,
      manualAlertMinutes: Number(draft.manualAlertMinutes),
      manualFallbackMinutes: Number(draft.manualFallbackMinutes),
    }
    const bad = (n, lo, hi) => !Number.isInteger(n) || n < lo || n > hi
    if (bad(body.maxOrdersPerRider, 1, 10)) return toast.error("Max orders per rider must be a whole number from 1 to 10")
    if (bad(body.manualAlertMinutes, 1, 60)) return toast.error("Alert after must be from 1 to 60 minutes")
    if (bad(body.manualFallbackMinutes, 0, 120)) return toast.error("Hand to automatic after must be from 0 to 120 minutes")
    setSaving(true)
    try {
      const res = await adminAPI.updateDispatchSettings(body)
      toast.success(res?.data?.message || "Dispatch settings saved")
      onSaved(res?.data?.data || body)
      setOpen(false)
    } catch (err) {
      toast.error(message(err, "Couldn't save the dispatch settings"))
    } finally {
      setSaving(false)
    }
  }

  const manual = draft.dispatchMode === "manual"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="dispatch-settings-body"
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <div>
          <p className="text-sm font-bold text-slate-900">Dispatch Settings</p>
          <p className="text-xs text-slate-500">
            {settings?.dispatchMode === "manual" ? "Manual" : "Automatic"} · up to {settings?.effectiveMaxOrdersPerRider ?? 1} order
            {(settings?.effectiveMaxOrdersPerRider ?? 1) === 1 ? "" : "s"} per rider
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <form id="dispatch-settings-body" onSubmit={save} className="space-y-5 border-t border-slate-100 px-4 py-4">
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700">Dispatch Mode</legend>
            <div className="mt-1.5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm" role="radiogroup">
              {[
                { id: "auto", label: "Automatic" },
                { id: "manual", label: "Manual" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.dispatchMode === m.id}
                  onClick={() => set("dispatchMode", m.id)}
                  className={`rounded-lg px-4 py-1.5 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                    draft.dispatchMode === m.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {manual
                ? "New orders wait here until you assign them to a rider."
                : "New orders are offered to nearby riders, and the first to accept gets the order."}
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Max Orders Per Rider</span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={draft.maxOrdersPerRider}
                onChange={(e) => set("maxOrdersPerRider", e.target.value)}
                className={`${inputCls} mt-1`}
              />
              <span className="mt-1 block text-xs text-slate-500">From 1 to 10.</span>
            </label>

            <div>
              <span className="text-xs font-semibold text-slate-700" id="multi-order-label">
                Rider App Shows Several Orders
              </span>
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.multiOrderTrips}
                  aria-labelledby="multi-order-label"
                  onClick={() => set("multiOrderTrips", !draft.multiOrderTrips)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                    draft.multiOrderTrips ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      draft.multiOrderTrips ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700">{draft.multiOrderTrips ? "On" : "Off"}</span>
              </div>
              <span className="mt-1 block text-xs text-slate-500">
                Keep this off until riders have the updated app. While it's off, each rider carries one order at a time.
              </span>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Alert After (Minutes)</span>
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                value={draft.manualAlertMinutes}
                onChange={(e) => set("manualAlertMinutes", e.target.value)}
                className={`${inputCls} mt-1`}
              />
              <span className="mt-1 block text-xs text-slate-500">Flag an order that has waited this long without a rider.</span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Hand To Automatic After (Minutes)</span>
              <input
                type="number"
                min={0}
                max={120}
                step={1}
                value={draft.manualFallbackMinutes}
                onChange={(e) => set("manualFallbackMinutes", e.target.value)}
                disabled={!manual}
                className={`${inputCls} mt-1 disabled:bg-slate-50 disabled:text-slate-400`}
              />
              <span className="mt-1 block text-xs text-slate-500">
                {manual
                  ? "If nobody assigns an order in this time, it's offered to nearby riders. 0 means never."
                  : "Only used in manual mode."}
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save Settings
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

/* ─────────────────────────── Waiting tab ─────────────────────────── */

function WaitingOrderRow({ order, checked, onToggle, alertMinutes }) {
  const sev = waitSeverity(order.waitingMinutes, alertMinutes)
  const id = `wo-${order.id}`
  return (
    <li>
      <label
        htmlFor={id}
        className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
          checked ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">#{order.orderId}</span>
            <StatusChip status={order.status} />
            {order.collectsCash ? (
              <span className={`${chip} bg-amber-50 text-amber-700`}>
                <Banknote className="h-3 w-3" aria-hidden="true" /> Cash {money(order.total)}
              </span>
            ) : null}
            <span className={`ml-auto inline-flex items-center gap-1 text-xs ${SEVERITY_CLS[sev]}`}>
              <Clock className="h-3 w-3" aria-hidden="true" /> Waited {order.waitingMinutes ?? 0} min
            </span>
          </div>
          <p className="flex items-center gap-1 truncate text-xs text-slate-600">
            <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
            {order.store?.name || "Store"}
            {order.store?.area ? <span className="text-slate-400">· {order.store.area}</span> : null}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Package className="h-3 w-3" aria-hidden="true" /> {order.itemCount ?? 0} item{order.itemCount === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> To {order.drop?.area || "customer"}
            </span>
            {order.tripDistanceKm != null ? <span>{formatKm(Number(order.tripDistanceKm))} trip</span> : null}
            {order.offeredToRiders > 0 ? <span>Offered to {order.offeredToRiders} rider{order.offeredToRiders === 1 ? "" : "s"}</span> : null}
          </p>
        </div>
      </label>
    </li>
  )
}

function RiderRow({ entry, selected, onSelect, selectedOrders }) {
  const { rider, km } = entry
  const left = remainingCapacity(rider)
  const full = left === 0
  const fresh = locationFreshness(rider.locationAgeMinutes)
  const block = selectedOrders.length ? riderBlockReason(rider, selectedOrders) : full ? riderBlockReason(rider, []) : ""
  const cashBlockedForSelection = rider.cashBlocked && selectedOrders.some((o) => o.collectsCash)
  const disabled = cashBlockedForSelection || full
  const id = `rider-${rider.id}`
  return (
    <li>
      <label
        htmlFor={id}
        className={`flex gap-3 rounded-xl border p-3 transition-colors ${
          disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70" : "cursor-pointer"
        } ${selected ? "border-slate-900 bg-slate-50" : disabled ? "" : "border-slate-200 bg-white hover:border-slate-300"}`}
      >
        <input
          id={id}
          type="radio"
          name="assign-rider"
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{rider.name || "Rider"}</span>
            {rider.vehicle ? <span className="text-xs capitalize text-slate-500">{rider.vehicle}</span> : null}
            <span className={`${chip} ${full ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
              {rider.activeOrders ?? 0} / {rider.maxOrders ?? 1}
            </span>
            {rider.cashBlocked ? <span className={`${chip} bg-rose-50 text-rose-700`}>Cash Limit Reached</span> : null}
            {km !== null ? <span className="ml-auto text-xs font-semibold text-slate-700">{formatKm(km)} from store</span> : null}
          </div>
          <p className={`text-xs ${fresh.stale ? "text-amber-600" : "text-slate-500"}`}>
            {fresh.stale ? <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}
            {fresh.label}
            {rider.cashInHand > 0 ? <span className="text-slate-400"> · {money(rider.cashInHand)} cash in hand</span> : null}
          </p>
          {block && (disabled || selected) ? <p className="text-xs text-rose-600">{block}</p> : null}
        </div>
      </label>
    </li>
  )
}

function WaitingTab({ board, settings, onAssigned }) {
  const waiting = useMemo(() => board?.waiting || [], [board])
  const riders = useMemo(() => board?.riders || [], [board])
  const [storeFilter, setStoreFilter] = useState("")
  const [selectedIds, setSelectedIds] = useState([])
  const [riderId, setRiderId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [failures, setFailures] = useState([])

  // Drop selections that left the board after a refresh.
  useEffect(() => {
    setSelectedIds((ids) => {
      const next = pruneSelection(ids, waiting)
      return next.length === ids.length ? ids : next
    })
  }, [waiting])
  useEffect(() => {
    if (riderId && !riders.some((r) => String(r.id) === riderId)) setRiderId("")
  }, [riders, riderId])

  const stores = useMemo(() => storeOptions(waiting), [waiting])
  useEffect(() => {
    if (storeFilter && !stores.some((s) => s.id === storeFilter)) setStoreFilter("")
  }, [stores, storeFilter])

  const visible = useMemo(
    () => (storeFilter ? waiting.filter((o) => String(o.store?.id ?? "") === storeFilter) : waiting),
    [waiting, storeFilter],
  )
  const selectedOrders = useMemo(() => {
    const byId = new Map(waiting.map((o) => [String(o.id), o]))
    return selectedIds.map((id) => byId.get(id)).filter(Boolean)
  }, [waiting, selectedIds])
  const sortedRiders = useMemo(() => sortRiders(riders, selectedOrders), [riders, selectedOrders])
  const rider = riders.find((r) => String(r.id) === riderId) || null
  const check = validateSelection({ orders: selectedOrders, rider })

  const toggle = (id) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const selectAllVisible = () =>
    setSelectedIds((ids) => [...new Set([...ids, ...visible.map((o) => String(o.id))])])
  const clearSelection = () => setSelectedIds([])

  const assign = async () => {
    if (!check.ok || !rider) return
    setAssigning(true)
    setFailures([])
    try {
      const res = await adminAPI.assignOrdersToRider(rider.id, selectedOrders.map((o) => o.id))
      const data = res?.data?.data || {}
      const failed = Array.isArray(data.failed) ? data.failed : []
      if ((data.assigned || []).length) toast.success(res?.data?.message || `Assigned to ${rider.name}`)
      if (failed.length) {
        setFailures(failed)
        toast.error(`${failed.length} order${failed.length === 1 ? "" : "s"} couldn't be assigned`)
      }
      setSelectedIds([])
      setRiderId("")
      onAssigned()
    } catch (err) {
      toast.error(message(err, "Couldn't assign the orders"))
      onAssigned()
    } finally {
      setAssigning(false)
    }
  }

  const failedLabel = (id) => {
    const o = waiting.find((x) => String(x.id) === String(id) || String(x.orderId) === String(id))
    return o ? `#${o.orderId}` : `#${id}`
  }

  return (
    <div className="space-y-4">
      {failures.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
          <p className="font-semibold">Some orders weren't assigned:</p>
          <ul className="mt-1 list-disc pl-5">
            {failures.map((f) => (
              <li key={f.orderId}>
                {failedLabel(f.orderId)}: {f.reason}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setFailures([])} className="mt-2 text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="waiting-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="waiting-heading" className="text-sm font-bold text-slate-900">
              Waiting Orders
            </h2>
            {selectedIds.length ? (
              <button type="button" onClick={clearSelection} className="text-xs font-semibold text-slate-600 underline">
                Clear Selection ({selectedIds.length})
              </button>
            ) : null}
          </div>
          {waiting.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="store-filter">
                Filter By Store
              </label>
              <select
                id="store-filter"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="">All Stores ({waiting.length})</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.area ? `, ${s.area}` : ""} ({s.count})
                  </option>
                ))}
              </select>
              {storeFilter ? (
                <button type="button" onClick={selectAllVisible} className={btnGhost}>
                  Select All From This Store
                </button>
              ) : null}
            </div>
          ) : null}
          {visible.length ? (
            <ul className="mt-3 space-y-2">
              {visible.map((o) => (
                <WaitingOrderRow
                  key={o.id}
                  order={o}
                  checked={selectedIds.includes(String(o.id))}
                  onToggle={() => toggle(String(o.id))}
                  alertMinutes={settings?.manualAlertMinutes}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No Orders Waiting</p>
              <p className="mt-0.5 text-xs text-slate-500">Orders that need a rider show up here.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="riders-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 id="riders-heading" className="text-sm font-bold text-slate-900">
            Online Riders
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {selectedOrders.length ? "Nearest to the first selected order's store first." : "Select orders to see how far each rider is."}
          </p>
          {sortedRiders.length ? (
            <ul className="mt-3 space-y-2" role="radiogroup" aria-labelledby="riders-heading">
              {sortedRiders.map((entry) => (
                <RiderRow
                  key={entry.rider.id}
                  entry={entry}
                  selected={riderId === String(entry.rider.id)}
                  onSelect={() => setRiderId(String(entry.rider.id))}
                  selectedOrders={selectedOrders}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No Riders Online</p>
              <p className="mt-0.5 text-xs text-slate-500">Approved riders who are online show up here.</p>
            </div>
          )}
        </section>
      </div>

      {selectedOrders.length || rider ? (
        <div className="sticky bottom-2 z-10 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs">
              {check.warnings.map((w) => (
                <p key={w} className="flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> {w}
                </p>
              ))}
              {!check.ok ? <p className="text-slate-600">{check.reason}</p> : null}
              {check.ok && hasMixedStores(selectedOrders) === false ? (
                <p className="text-slate-600">
                  {selectedOrders.length} order{selectedOrders.length === 1 ? "" : "s"} from {selectedOrders[0]?.store?.name || "one store"}.
                </p>
              ) : null}
            </div>
            <button type="button" onClick={assign} disabled={!check.ok || assigning} className={btnPrimary}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bike className="h-4 w-4" aria-hidden="true" />}
              Assign {selectedOrders.length || ""} Order{selectedOrders.length === 1 ? "" : "s"}
              {rider ? ` to ${rider.name}` : ""}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ─────────────────────────── Active trips tab ─────────────────────────── */

function TripOrderRow({ order, rider, riders, onChanged }) {
  const [mode, setMode] = useState("") // "" | "move" | "unassign"
  const [target, setTarget] = useState("")
  const [busy, setBusy] = useState(false)
  const others = riders.filter((r) => String(r.id) !== String(rider.id))

  const move = async () => {
    if (!target) return
    setBusy(true)
    try {
      const res = await adminAPI.moveRiderOrder(order.id, target)
      const failed = res?.data?.data?.failed || []
      if (failed.length) toast.error(failed.map((f) => f.reason).join(" "))
      else toast.success(res?.data?.message || "Order moved")
      setMode("")
      onChanged()
    } catch (err) {
      toast.error(message(err, "Couldn't move the order"))
    } finally {
      setBusy(false)
    }
  }

  const unassign = async () => {
    setBusy(true)
    try {
      const res = await adminAPI.unassignRiderOrder(order.id)
      toast.success(res?.data?.message || `#${order.orderId} is back in Waiting`)
      setMode("")
      onChanged()
    } catch (err) {
      toast.error(message(err, "Couldn't unassign the order"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">#{order.orderId}</span>
        <StatusChip status={order.status} />
        {order.phase ? <span className="text-xs text-slate-500">{statusLabel(order.phase)}</span> : null}
        {order.pickedUp ? <span className={`${chip} bg-emerald-50 text-emerald-700`}>Picked Up</span> : null}
        <span className={`${chip} bg-slate-100 text-slate-600`}>{order.assignedBy === "admin" ? "Assigned By Admin" : "Accepted By Rider"}</span>
        {order.payment === "cash" ? <span className={`${chip} bg-amber-50 text-amber-700`}>Cash</span> : null}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {order.store?.name || "Store"}
        {order.store?.area ? `, ${order.store.area}` : ""} → {order.drop?.area || "customer"}
      </p>

      {!order.pickedUp ? (
        mode === "" ? (
          <div className="mt-2 flex gap-2">
            <button type="button" className={btnGhost} onClick={() => setMode("move")} disabled={!others.length} aria-label={`Move order ${order.orderId} to another rider`}>
              Move
            </button>
            <button type="button" className={btnGhost} onClick={() => setMode("unassign")} aria-label={`Unassign order ${order.orderId}`}>
              Unassign
            </button>
          </div>
        ) : mode === "move" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`move-${order.id}`}>
              Move To Rider
            </label>
            <select
              id={`move-${order.id}`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Choose a rider</option>
              {others.map((r) => {
                const left = remainingCapacity(r)
                const cashNo = r.cashBlocked && order.payment === "cash"
                return (
                  <option key={r.id} value={r.id} disabled={left === 0 || cashNo}>
                    {r.name} ({r.activeOrders}/{r.maxOrders}){cashNo ? " · cash limit" : left === 0 ? " · full" : ""}
                  </option>
                )
              })}
            </select>
            <button type="button" className={btnPrimary} onClick={move} disabled={!target || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Move
            </button>
            <button type="button" className={btnGhost} onClick={() => setMode("")} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800" role="alert">
            <p>Take #{order.orderId} off {rider.name}? It goes back to Waiting.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={unassign}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                Yes, Unassign
              </button>
              <button type="button" className={btnGhost} onClick={() => setMode("")} disabled={busy}>
                Keep
              </button>
            </div>
          </div>
        )
      ) : null}
    </li>
  )
}

function ActiveTripsTab({ board, onChanged }) {
  const riders = useMemo(() => board?.riders || [], [board])
  const trips = useMemo(() => activeTrips(riders), [riders])
  if (!trips.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <Truck className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <h3 className="mt-3 text-lg font-bold text-slate-900">No Active Trips</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Riders carrying orders show up here.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {trips.map((r) => (
        <section key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`Trip of ${r.name}`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-slate-900">{r.name || "Rider"}</p>
            <span className={`${chip} ${remainingCapacity(r) === 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
              {r.activeOrders ?? 0} / {r.maxOrders ?? 1}
            </span>
            {r.cashBlocked ? <span className={`${chip} bg-rose-50 text-rose-700`}>Cash Limit Reached</span> : null}
            {r.phone ? (
              <a href={`tel:${r.phone}`} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:underline">
                <Phone className="h-3 w-3" aria-hidden="true" /> {r.phone}
              </a>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2">
            {(r.orders || []).map((o) => (
              <TripOrderRow key={o.id} order={o} rider={r} riders={riders} onChanged={onChanged} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function AssignOrders() {
  const { panel } = useAdminPanel()
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [tab, setTab] = useState("waiting")
  const inFlight = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) return
    inFlight.current = true
    if (!silent) setRefreshing(true)
    try {
      const res = await adminAPI.getDispatchBoard()
      setBoard(res?.data?.data || null)
      setError("")
    } catch (e) {
      setError(message(e, "Couldn't load the dispatch board"))
    } finally {
      inFlight.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const isQuick = panel === "quick"

  useEffect(() => {
    if (!isQuick) return undefined
    load()
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return
      load({ silent: true })
    }
    const id = setInterval(tick, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) load({ silent: true })
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [isQuick, load])

  useDispatchSocket(() => {
    if (isQuick) load({ silent: true })
  })

  const settings = board?.settings || null
  const manual = settings?.dispatchMode === "manual"
  const waitingCount = board?.waiting?.length || 0
  const tripCount = activeTrips(board?.riders || []).length

  if (!isQuick) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">Assign Orders</h1>
          <p className="mt-2 text-sm text-slate-500">Rider dispatch is for Quick orders. Shop orders ship by courier.</p>
          <Link to="/admin/quick/assign-orders" className="mt-4 inline-block text-sm font-bold text-slate-900 underline">
            Open Assign Orders In Quick
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Assign Orders</h1>
              {settings ? (
                <span className={`${chip} ${manual ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {manual ? "Manual" : "Automatic"}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Pick waiting Quick orders and hand them to an online rider. One rider can carry several orders.</p>
          </div>
          <button type="button" onClick={() => load()} disabled={refreshing} className={btnGhost} aria-label="Refresh the board">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
        </div>

        {settings ? <SettingsCard settings={settings} onSaved={() => load({ silent: true })} /> : null}

        {settings && !manual ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            Automatic dispatch is on: new orders are offered to nearby riders. You can still assign a waiting order yourself.
          </p>
        ) : null}

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => load()} className="text-xs font-semibold underline">
              Try Again
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-20" role="status" aria-label="Loading">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden="true" />
          </div>
        ) : board ? (
          <>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm" role="tablist">
              {[
                { id: "waiting", label: `Waiting (${waitingCount})` },
                { id: "trips", label: `Active Trips (${tripCount})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-4 py-1.5 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                    tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "waiting" ? (
              <WaitingTab board={board} settings={settings} onAssigned={() => load({ silent: true })} />
            ) : (
              <ActiveTripsTab board={board} onChanged={() => load({ silent: true })} />
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
