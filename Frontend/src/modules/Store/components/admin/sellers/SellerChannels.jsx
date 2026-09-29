import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { adminAPI } from "@store/api"
import { toast } from "sonner"

/**
 * Seller sales channels (CHANNELS_CONTRACT.md):
 *   seller.channels = { quick: { status, rejectionReason, appliedAt, decidedAt }, shop: {...} }
 * status is 'none' | 'pending' | 'approved' | 'rejected'.
 */
export const CHANNEL_KEYS = ["quick", "shop"]
export const CHANNEL_LABELS = { quick: "Quick", shop: "Shop" }

export const getChannelInfo = (seller, channel) => {
  const raw = seller?.channels?.[channel] || {}
  const status = ["pending", "approved", "rejected"].includes(raw.status) ? raw.status : "none"
  return { ...raw, status }
}

/** Channels a seller may list products in (account approved is checked by the server). */
export const getApprovedChannels = (seller) =>
  CHANNEL_KEYS.filter((c) => getChannelInfo(seller, c).status === "approved")

const BADGE = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-rose-100 text-rose-700",
  none: "bg-slate-100 text-slate-500",
}
const STATUS_LABEL = { approved: "Approved", pending: "Pending", rejected: "Rejected", none: "Not applied" }

export function ChannelStatusBadge({ channel, status }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[status] || BADGE.none}`}>
      {CHANNEL_LABELS[channel]}: {STATUS_LABEL[status] || STATUS_LABEL.none}
    </span>
  )
}

export function ChannelStatusBadges({ seller }) {
  return (
    <div className="flex flex-col gap-1">
      {CHANNEL_KEYS.map((c) => (
        <ChannelStatusBadge key={c} channel={c} status={getChannelInfo(seller, c).status} />
      ))}
    </div>
  )
}

const fmtDate = (d) => {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString()
}

/**
 * Quick needs the store inside a delivery zone. Shows where the store is,
 * which zone covers it, and the one-click fix: assign the covering zone, or
 * create a zone when none covers that area yet.
 */
export function QuickZoneCheck({ sellerId, onStatus }) {
  const [check, setCheck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(() => {
    if (!sellerId) return
    setLoading(true)
    adminAPI
      .getSellerQuickZone(sellerId)
      .then((res) => {
        const data = res?.data?.data || null
        setCheck(data)
        onStatus?.(data)
      })
      .catch(() => {
        setCheck(null)
        onStatus?.(null)
      })
      .finally(() => setLoading(false))
  }, [sellerId, onStatus])

  useEffect(() => {
    load()
  }, [load])

  const assign = async () => {
    if (!check?.zoneForLocation?.id) return
    setAssigning(true)
    try {
      const res = await adminAPI.assignSellerZone(sellerId, check.zoneForLocation.id)
      const data = res?.data?.data || null
      setCheck(data)
      onStatus?.(data)
      toast.success(`Assigned ${check.zoneForLocation.name}`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't assign the zone")
    } finally {
      setAssigning(false)
    }
  }

  if (loading) return <p className="mt-2 text-xs text-slate-500">Checking the store's delivery zone…</p>
  if (!check) return <p className="mt-2 text-xs text-rose-600">Couldn't check the delivery zone.</p>

  const place = [check.store?.area, check.store?.city, check.store?.pincode].filter(Boolean).join(", ") || "the store's location"
  const box = "mt-2 rounded-md px-3 py-2 text-xs"

  if (check.action === "none") {
    return (
      <p className={`${box} bg-emerald-50 text-emerald-800`}>
        ✓ Inside <strong>{check.assignedZone?.name}</strong> · {place}
      </p>
    )
  }
  if (check.action === "set_location") {
    return (
      <p className={`${box} bg-amber-50 text-amber-800`}>
        The store has no location on the map, so its delivery zone can't be checked. Set it with <strong>Edit Location</strong>.
      </p>
    )
  }
  if (check.action === "assign_zone") {
    return (
      <div className={`${box} flex flex-wrap items-center justify-between gap-2 bg-amber-50 text-amber-800`}>
        <span>
          {check.assignedZone
            ? <>Assigned to <strong>{check.assignedZone.name}</strong>{check.assignedZone.isActive ? ", but the store is outside it." : ", which is switched off."}</>
            : "No zone assigned."}{" "}
          The store ({place}) is inside <strong>{check.zoneForLocation?.name}</strong>.
        </span>
        <button
          type="button"
          onClick={assign}
          disabled={assigning}
          className="rounded-md bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {assigning ? "Assigning…" : `Assign ${check.zoneForLocation?.name}`}
        </button>
      </div>
    )
  }
  // create_zone
  return (
    <div className={`${box} space-y-1.5 bg-rose-50 text-rose-800`}>
      <p>
        No delivery zone covers <strong>{place}</strong> yet, so this store can't take Quick orders. Create a zone around it, or keep
        the store on Shop only.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/admin/zone-setup/add" className="rounded-md bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700">
          Create a Zone
        </Link>
        <Link to="/admin/zone-setup/map" className="rounded-md border border-rose-300 px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-100">
          See All Zones on Map
        </Link>
        <button type="button" onClick={load} className="rounded-md border border-rose-300 px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-100">
          Check Again
        </button>
      </div>
    </div>
  )
}

/**
 * Per-channel approve / reject-with-reason controls.
 * `onUpdated(seller)` gets the updated seller (or a locally patched copy).
 * `only` limits the panel to one channel (e.g. the current admin panel's).
 */
export function SellerChannelsPanel({ seller, onUpdated, only }) {
  const [busy, setBusy] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState("")
  const [quickCheck, setQuickCheck] = useState(null)
  const sellerId = seller?._id || seller?.id
  const keys = only ? [only] : CHANNEL_KEYS

  const act = async (channel, action) => {
    if (!sellerId) return
    if (action === "reject" && !reason.trim()) {
      toast.error("Please enter a rejection reason")
      return
    }
    setBusy(`${channel}:${action}`)
    try {
      const res = await adminAPI.setSellerChannelStatus(sellerId, channel, action, reason)
      const body = res?.data?.data
      const updated = body?.seller || (body?.channels ? body : null)
      const now = new Date().toISOString()
      const next = updated?.channels
        ? { ...seller, ...updated, channels: updated.channels }
        : {
            ...seller,
            channels: {
              ...(seller?.channels || {}),
              [channel]: {
                ...getChannelInfo(seller, channel),
                status: action === "approve" ? "approved" : "rejected",
                rejectionReason: action === "reject" ? reason.trim() : null,
                decidedAt: now,
              },
            },
          }
      toast.success(`${CHANNEL_LABELS[channel]} channel ${action === "approve" ? "approved" : "rejected"}`)
      setRejecting(null)
      setReason("")
      onUpdated?.(next)
    } catch (err) {
      toast.error(err?.response?.data?.message || `Failed to ${action} ${CHANNEL_LABELS[channel]} channel`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {keys.map((channel) => {
        const info = getChannelInfo(seller, channel)
        // Quick can only be approved once the store is inside a delivery zone.
        const zoneBlocked = channel === "quick" && !quickCheck?.ready
        const canApprove = info.status !== "approved"
        const canReject = info.status === "pending" || info.status === "approved"
        return (
          <div key={channel} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <ChannelStatusBadge channel={channel} status={info.status} />
                <span className="text-[11px] text-slate-500">
                  {fmtDate(info.appliedAt) ? `Applied ${fmtDate(info.appliedAt)}` : ""}
                  {fmtDate(info.decidedAt) ? ` · Decided ${fmtDate(info.decidedAt)}` : ""}
                </span>
                {info.status === "rejected" && info.rejectionReason && (
                  <span className="text-xs text-rose-600">Reason: {info.rejectionReason}</span>
                )}
              </div>
              <div className="flex gap-2">
                {canApprove && (
                  <button
                    type="button"
                    disabled={!!busy || zoneBlocked}
                    title={zoneBlocked ? "Fix the delivery zone first" : undefined}
                    onClick={() => act(channel, "approve")}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === `${channel}:approve` ? "Approving..." : "Approve"}
                  </button>
                )}
                {canReject && rejecting !== channel && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => { setRejecting(channel); setReason("") }}
                    className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
            {channel === "quick" ? <QuickZoneCheck sellerId={sellerId} onStatus={setQuickCheck} /> : null}
            {rejecting === channel && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`Why is the ${CHANNEL_LABELS[channel]} channel rejected?`}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRejecting(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !reason.trim()}
                    onClick={() => act(channel, "reject")}
                    className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy === `${channel}:reject` ? "Rejecting..." : "Confirm reject"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
