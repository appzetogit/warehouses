/**
 * "Saved for later" under the cart (mobile + desktop), per storefront. Lines
 * are kept on the server; "Move to cart" is re-checked there for the channel
 * (listed, store approved, in stock) before the line is added back.
 */
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Loader2, ShoppingBag } from "lucide-react"
import { toast } from "sonner"
import { userAPI } from "@store/api"
import { useCart } from "@store/context/CartContext"
import { useStoreMode } from "@store/context/StoreModeContext"
import { isModuleAuthenticated } from "@store/utils/auth"

const CHANGED_EVENT = "store_saved_for_later_changed"
const RUPEE = "₹"
const cartMode = (storeMode) => (storeMode === "quick" ? "quick" : "shop")
const errorMessage = (e, fallback) => e?.response?.data?.message || fallback

/**
 * Take a line out of the cart and park it. Removes it locally only after the
 * server has it, so a failed save never loses the line.
 */
export async function saveCartLineForLater({ item, storeMode, removeFromCart }) {
  if (!isModuleAuthenticated("user")) {
    toast.error("Sign in to save items for later")
    return false
  }
  const productId = String(item?.productId || item?.itemId || "")
  if (!/^[a-f0-9]{24}$/i.test(productId)) {
    toast.error("This item can't be saved for later")
    return false
  }
  try {
    await userAPI.saveForLater({
      mode: cartMode(storeMode),
      productId,
      variantId: item.variantId || undefined,
      qty: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
    })
    removeFromCart(item.id)
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
    toast.success(`${item.name || "Item"} saved for later`)
    return true
  } catch (e) {
    toast.error(errorMessage(e, "Could not save this item"))
    return false
  }
}

export default function SavedForLater({ variant = "mobile", className = "" }) {
  const { storeMode, addToCart } = useCart()
  const { storePath } = useStoreMode()
  const mode = cartMode(storeMode)
  const signedIn = isModuleAuthenticated("user")
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!signedIn) return
    setLoading(true)
    try {
      const res = await userAPI.getSavedForLater(mode)
      setItems(res?.data?.data?.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [mode, signedIn])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener(CHANGED_EVENT, load)
    return () => window.removeEventListener(CHANGED_EVENT, load)
  }, [load])

  const moveToCart = async (row) => {
    setBusyId(row.id)
    try {
      const res = await userAPI.moveSavedToCart(row.id)
      const line = res?.data?.data?.line
      if (line && Number(line.quantity) > 0) {
        // The server has already taken the row out of "saved". If the cart
        // can't take the line (or the "Replace cart?" prompt is dismissed),
        // save it again so the item is never lost.
        const putBack = async () => {
          try {
            await userAPI.saveForLater({
              mode,
              productId: line.productId || line.itemId || row.productId,
              variantId: line.variantId || undefined,
              qty: Math.max(1, Math.min(99, Number(row.qty) || Number(line.quantity) || 1)),
            })
          } catch (e) {
            toast.error(errorMessage(e, "Could not keep this item saved"))
          }
          load()
        }
        const result = addToCart(line, null, { quantity: line.quantity, onReplaceCancelled: putBack })
        if (result?.ok === false) {
          if (!result.needsConfirmation) {
            toast.error(result.error || "Could not move this item to your cart")
            await putBack()
          }
          // Waiting on "Replace cart?": confirm adds it, cancel saves it again
          // (and reloads this list).
          else setItems((prev) => prev.filter((r) => r.id !== row.id))
          return
        }
      }
      setItems((prev) => prev.filter((r) => r.id !== row.id))
      toast.success(line?.quantityReduced ? `Moved to cart (only ${line.cartQuantity} available)` : "Moved to cart")
    } catch (e) {
      toast.error(errorMessage(e, "Could not move this item to your cart"))
      load()
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (row) => {
    setBusyId(row.id)
    try {
      await userAPI.removeSavedForLater(row.id)
      setItems((prev) => prev.filter((r) => r.id !== row.id))
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove this item"))
    } finally {
      setBusyId(null)
    }
  }

  if (!signedIn || (!loading && items.length === 0)) return null
  const desktop = variant === "desktop"

  return (
    <section
      aria-labelledby="saved-for-later-heading"
      className={`${desktop
        ? "rounded-[18px] border border-app-line bg-white px-5 py-4 font-app text-app-ink dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-white"
        : "rounded-[14px] border border-[#EBEBEB] bg-white p-3.5 font-app dark:border-gray-800 dark:bg-[#1a1a1a]"} ${className}`}
    >
      <h2
        id="saved-for-later-heading"
        className={desktop ? "border-b border-app-line pb-3 text-[16px] font-bold text-app-ink dark:border-gray-800 dark:text-white" : "text-[14px] font-bold text-app-ink dark:text-white"}
      >
        Saved for later ({items.length} item{items.length === 1 ? "" : "s"})
      </h2>
      {loading && !items.length ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-label="Loading saved items" /></div>
      ) : (
        <ul className={desktop ? "divide-y divide-app-line dark:divide-gray-800" : "mt-1 divide-y divide-[#EEEEEE] dark:divide-gray-800"}>
          {items.map((row) => (
            <li key={row.id} className={`flex items-start gap-3 ${desktop ? "py-4" : "py-2.5"}`}>
              <Link
                to={storePath(`/product/${row.productId}`)}
                className={`flex shrink-0 items-center justify-center overflow-hidden focus-visible:outline-2 ${desktop ? "h-[104px] w-[96px] rounded-[12px] bg-app-alt focus-visible:outline-app-brown" : "h-[68px] w-[64px] rounded-[10px] bg-app-alt focus-visible:outline-app-brown"}`}
              >
                {row.image ? (
                  <img src={row.image} alt={row.name} loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <ShoppingBag className="h-6 w-6 text-gray-300" aria-hidden="true" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <p className={desktop ? "line-clamp-2 text-[14px] font-semibold leading-[1.3] text-app-ink dark:text-gray-200" : "line-clamp-2 text-[13px] font-semibold leading-[1.25] text-app-ink dark:text-gray-200"}>{row.name}</p>
                {row.variantName ? <p className={desktop ? "mt-0.5 text-[12px] text-app-muted" : "text-[11px] text-app-muted"}>{row.variantName}</p> : null}
                <p className={`mt-0.5 ${desktop ? "text-[15px] font-extrabold text-app-ink dark:text-white" : "text-[14px] font-extrabold text-app-ink dark:text-white"}`}>
                  {RUPEE}{Number(row.price || 0).toLocaleString("en-IN")}
                  <span className={`ml-2 text-xs font-normal ${"text-app-muted"}`}>Qty {row.qty}</span>
                </p>
                {row.available ? (
                  <p className={desktop ? "text-[12px] font-medium text-[#2E7D32]" : "text-[11px] font-medium text-[#2E7D32]"}>In Stock</p>
                ) : (
                  <p className={desktop ? "text-[12px] font-medium text-[#D32F2F]" : "text-[11px] font-medium text-[#D32F2F]"}>{row.message || "Currently unavailable"}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                  <button
                    type="button"
                    disabled={!row.available || busyId === row.id}
                    onClick={() => moveToCart(row)}
                    className={desktop
                      ? "rounded-lg border-[1.2px] border-app-brown px-3.5 py-1.5 text-[12px] font-bold text-app-brown hover:bg-app-tint disabled:cursor-not-allowed disabled:border-[#BDB5AE] disabled:text-[#BDB5AE] disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-app-brown"
                      : "rounded-lg border-[1.2px] border-app-brown px-3 py-1 text-[11.5px] font-bold text-app-brown disabled:cursor-not-allowed disabled:border-[#BDB5AE] disabled:text-[#BDB5AE]"}
                  >
                    Move to Cart
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => remove(row)}
                    className={desktop
                      ? "text-[12px] font-semibold text-app-ink hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-app-brown dark:text-gray-300"
                      : "text-[11.5px] font-medium text-[#222222] disabled:opacity-50 dark:text-gray-300"}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
