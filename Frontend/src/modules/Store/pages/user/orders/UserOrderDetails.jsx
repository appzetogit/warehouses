import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import useAppBackNavigation from "@store/hooks/useAppBackNavigation"
import {
  Banknote,
  Phone,
  Download,
  User,
  CreditCard,
  Calendar,
  Headphones,
  MapPin,
  RotateCcw,
  FileText,
  Wallet,
} from "lucide-react"
import { orderAPI, sellerAPI } from "@store/api"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@store/utils/businessSettings"
import { getCartCompareItemTotal, getLineCompareUnitPrice } from "@store/utils/productVariants"
import { DualMoney } from "@store/components/user/ProductPriceDisplay"
import OrderReturnsSection from "./OrderReturnsSection"
import CancelOrderSheet, { canCancelOrder } from "@store/components/user/orders/CancelOrderSheet"
import OrderItemsReviewPanel from "@store/components/user/reviews/OrderItemsReviewPanel"
import CompletePaymentCard from "@store/components/user/CompletePaymentCard"
import { imagePlaceholder } from "@store/constants/images"
import {
  isShopOrder,
  orderStatusLabel,
  paymentMethodLabel,
  reorderPath,
  rupees,
  shopTimeline,
  totalLabel,
} from "@store/utils/shopOrderFlow"
import {
  AddressCard,
  BillSummaryCard,
  BOTTOM_BAR_PAD,
  CancelLink,
  DetailCard,
  ItemDetailCard,
  ORDER_PAGE_BG,
  OrderBottomBar,
  OrderIdCard,
  OrderTopBar,
  SavedBanner,
  SectionHeading,
  StatusTimelineCard,
} from "@store/components/user/orders/OrderDetailCards"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

/** Timeline steps from the order's status history (Quick orders): every status it went through. */
function historySteps(order) {
  const history = (Array.isArray(order?.statusHistory) ? order.statusHistory : []).filter((h) => h?.to)
  const steps = []
  for (const h of history) {
    const to = String(h.to)
    if (steps.length && steps[steps.length - 1].status === to) continue
    steps.push({ status: to, at: h.at || null })
  }
  return steps.map((s, i) => ({
    key: `${s.status}-${i}`,
    label: orderStatusLabel({ orderStatus: s.status }),
    done: true,
    current: i === steps.length - 1,
    bad: s.status.startsWith("cancelled"),
    at: s.at,
  }))
}


export default function UserOrderDetails() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  // "Return / Replace" from the orders list lands on #returns; the section
  // only exists once the order has loaded, so scroll to it then.
  useEffect(() => {
    if (!order || window.location.hash !== "#returns") return undefined
    const t = setTimeout(() => document.getElementById("returns")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400)
    return () => clearTimeout(t)
  }, [order])
  const [seller, setSeller] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true)
        // Fetch using the ID from params (which will now be the MongoDB _id)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order && typeof response.data.order === 'object') {
          orderData = response.data.order
        } else {
          toast.error("Order not found")
          navigate("/orders")
          return
        }

        setOrder(orderData)

        // If sellerId is just a string (not populated), fetch seller details separately
        const sellerId = orderData.sellerId
        if (sellerId && typeof sellerId === 'string' && !orderData.seller) {
          try {
            const sellerResponse = await sellerAPI.getSellerById(sellerId)
            if (sellerResponse?.data?.success && sellerResponse.data.data?.seller) {
              setSeller(sellerResponse.data.data.seller)
            } else if (sellerResponse?.data?.seller) {
              setSeller(sellerResponse.data.seller)
            }
          } catch (sellerError) {
            debugWarn("Failed to fetch seller details:", sellerError)
            // Don't show error toast, just log it - order details can still be shown
          }
        }
      } catch (error) {
        debugError("Error fetching order details:", error)
        toast.error(
          error?.response?.data?.message || "Failed to load order details"
        )
        navigate("/orders")
      } finally {
        setLoading(false)
      }
    }

    fetchOrderDetails()
  }, [orderId, navigate])

  const handleCopyOrderId = async () => {
    if (!order) return
    const id = order.order_id || order.orderId || order._id || orderId
    try {
      await navigator.clipboard.writeText(String(id))
      toast.success("Order ID copied")
    } catch {
      toast.error("Failed to copy Order ID")
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${ORDER_PAGE_BG} flex items-center justify-center font-app`}>
        <p className="text-app-muted text-sm">Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className={`min-h-screen ${ORDER_PAGE_BG} flex items-center justify-center font-app`}>
        <div className="text-center space-y-3">
          <p className="text-app-ink text-sm font-medium">Order Not Found</p>
          <button
            onClick={() => navigate("/orders")}
            className="px-4 py-2 rounded-xl bg-app-brown text-white text-sm font-semibold"
          >
            Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const orderIdDisplay = order.order_id || order.orderId || order._id || orderId
  // Use fetched seller data if available, otherwise use order.sellerId or order.seller
  const sellerObj = seller || order.sellerId || order.seller || {}
  const sellerName =
    order.sellerName || sellerObj.sellerName || sellerObj.name || "Seller"

  // Build seller address (try seller fields first, then fall back)
  const sellerLocation = (() => {
    const loc = sellerObj.location || {}

    // Priority 1: direct address on seller object
    if (sellerObj.address) return sellerObj.address

    // Priority 2: formattedAddress from location
    if (loc.formattedAddress) return loc.formattedAddress

    // Priority 3: generic address / street-style fields
    if (loc.address) return loc.address

    if (loc.street || loc.city) {
      const parts = [
        loc.street,
        loc.area,
        loc.city,
        loc.state,
        loc.zipCode || loc.pincode || loc.postalCode,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 4: addressLine1 / addressLine2 style
    if (loc.addressLine1) {
      const parts = [
        loc.addressLine1,
        loc.addressLine2,
        loc.city,
        loc.state,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 5: order-level sellerAddress if present
    if (order.sellerAddress) return order.sellerAddress

    // Don't fallback to user delivery address - show empty or "Address not available"
    return "Address not available"
  })()

  const items = Array.isArray(order.items) ? order.items : []
  const pricing = order.pricing || {}

  const userName = order.customerName || order.userName || order.userId?.name || order.userId?.fullName || ""
  const userPhone = order.customerPhone || order.userPhone || order.userId?.phone || ""
  const paymentMethod = paymentMethodLabel(order)
  // Bill rows: these add up to pricing.total (the quick-mode surcharge is part of platformFee).
  const deliveryTotal = (Number(pricing.deliveryFee) || 0) + (Number(pricing.deliveryFeeGst) || 0)
  const quickFee = Number(pricing.quickDeliveryFee) || 0
  const basePlatformFee = Math.max(0, (Number(pricing.platformFee) || 0) - quickFee)
  const packagingFee = Number(pricing.packagingFee) || 0
  const discountAmount = Number(pricing.discount) || 0
  const coinsAmount = Number(order.coinsDiscount ?? pricing.coinsDiscount) || 0
  const paymentDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : ""

  const addressText =
    order.deliveryAddress?.formattedAddress ||
    order.address?.formattedAddress ||
    [
      order.deliveryAddress?.street || order.address?.street,
      order.deliveryAddress?.city || order.address?.city,
      order.deliveryAddress?.state || order.address?.state,
      order.deliveryAddress?.zipCode || order.address?.zipCode
    ]
      .filter(Boolean)
      .join(", ")

  const savings =
    (pricing.discount || 0) +
    (pricing.originalItemTotal || 0) -
    (pricing.subtotal || 0)

  const compareItemTotal = getCartCompareItemTotal(items)
  const itemSubtotal = Number(pricing.subtotal || pricing.total || 0) || 0
  const orderPayTotal = Number(pricing.total || 0) || 0
  const displayCompareItemTotal =
    compareItemTotal > itemSubtotal
      ? compareItemTotal
      : Number(pricing.originalItemTotal) > itemSubtotal
        ? Number(pricing.originalItemTotal)
        : 0
  const compareToPay =
    displayCompareItemTotal > itemSubtotal
      ? orderPayTotal + (displayCompareItemTotal - itemSubtotal)
      : orderPayTotal

  // Seller phone (multiple fallbacks) - use fetched seller data first
  const sellerPhone =
    sellerObj.primaryContactNumber ||
    sellerObj.phone ||
    sellerObj.contactNumber ||
    order.sellerPhone ||
    ""

  const handleCallSeller = () => {
    if (!sellerPhone) {
      toast.error("Seller phone number not available")
      return
    }
    window.location.href = `tel:${sellerPhone}`
  }

  const handleDownloadSummary = async () => {
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ])
      const companyName = await getCompanyNameAsync()
      // Create new PDF document
      const doc = new jsPDF()

      // Title
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(`${companyName} Order: Summary and Receipt`, 105, 20, { align: 'center' })

      // Order details section
      let yPos = 35
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      // Order ID
      doc.setFont('helvetica', 'bold')
      doc.text('Order ID:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(orderIdDisplay, 60, yPos)
      yPos += 7

      // Order Time
      doc.setFont('helvetica', 'bold')
      doc.text('Order Time:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const orderTimeLines = doc.splitTextToSize(paymentDate || 'N/A', 130)
      doc.text(orderTimeLines, 60, yPos)
      yPos += orderTimeLines.length * 7

      // Customer Name
      doc.setFont('helvetica', 'bold')
      doc.text('Customer Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(userName || 'Customer', 60, yPos)
      yPos += 7

      // Delivery Address
      doc.setFont('helvetica', 'bold')
      doc.text('Delivery Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const addressLines = doc.splitTextToSize(addressText || 'N/A', 130)
      doc.text(addressLines, 60, yPos)
      yPos += addressLines.length * 7

      // Seller Name
      doc.setFont('helvetica', 'bold')
      doc.text('Seller Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(sellerName, 60, yPos)
      yPos += 7

      // Seller Address
      doc.setFont('helvetica', 'bold')
      doc.text('Seller Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const sellerAddressLines = doc.splitTextToSize(sellerLocation || 'N/A', 130)
      doc.text(sellerAddressLines, 60, yPos)
      yPos += sellerAddressLines.length * 7 + 5

      // Items table
      const tableData = items.map(item => [
        item.variantName ? `${item.name || 'Item'} (${item.variantName})` : (item.name || 'Item'),
        String(item.quantity || item.qty || 1),
        `Rs. ${Number(item.price || 0).toFixed(2)}`,
        `Rs. ${Number((item.price || 0) * (item.quantity || item.qty || 1)).toFixed(2)}`
      ])

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Quantity', 'Unit Price', 'Total Price']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        }
      })

      // Get final Y position after table (autoTable adds lastAutoTable property)
      const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : yPos + (tableData.length * 8) + 20

      // Total
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Total:', 145, finalY + 10, { align: 'right' })
      doc.text(`Rs. ${Number(pricing.total || 0).toFixed(2)}`, 195, finalY + 10, { align: 'right' })

      // Save PDF instantly
      const fileName = `Order_Summary_${orderIdDisplay}_${Date.now()}.pdf`
      doc.save(fileName)

      toast.success("Summary downloaded successfully!")
    } catch (error) {
      debugError("Error generating PDF:", error)
      toast.error("Failed to download summary")
    }
  }



  const statusText = String(order.orderStatus || order.status || "")
  const isDelivered = statusText === "delivered"
  const isCancelled = statusText.startsWith("cancelled")
  const statusTone = isCancelled ? "cancelled" : isDelivered ? "delivered" : "progress"
  const timelineSteps = isShopOrder(order)
    ? shopTimeline(order).map((step) => ({ ...step, bad: step.key === "cancelled" }))
    : historySteps(order)
  const firstItem = items[0]
  const moreItems = items.length - 1
  const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity || item.qty) || 1), 0)
  const isCash = /^(cash|cod)$/i.test(String(order?.payment?.method || order?.paymentMethod || ""))
  const saleClass = "inline-flex items-center rounded-full border border-app-brown/30 bg-app-tint px-2 py-0.5 text-sm font-bold text-app-brown tabular-nums"
  const helpId = String(order._id || orderId)

  const billRows = [
    {
      label: "Item Total",
      value: (
        <DualMoney
          amount={itemSubtotal}
          compareAmount={displayCompareItemTotal}
          decimals={2}
          plainClassName="font-medium text-app-ink tabular-nums"
          saleClassName={saleClass}
        />
      ),
    },
    { label: "GST (govt. taxes)", value: rupees(pricing.tax) },
    {
      label: `Delivery Fee${Number(pricing.deliveryFeeGst) > 0 ? " (incl. GST)" : ""}`,
      value: deliveryTotal > 0 ? rupees(deliveryTotal) : "FREE",
      tone: deliveryTotal > 0 ? undefined : "save",
    },
    quickFee > 0 ? { label: "Quick Mode", value: rupees(quickFee), tone: "brand" } : null,
    packagingFee > 0 ? { label: "Packaging", value: rupees(packagingFee) } : null,
    basePlatformFee > 0 ? { label: "Platform Fee", value: rupees(basePlatformFee) } : null,
    discountAmount > 0
      ? { label: `Discount${pricing.couponCode ? ` (${pricing.couponCode})` : ""}`, value: `− ${rupees(discountAmount)}`, tone: "save" }
      : null,
    coinsAmount > 0 ? { label: "Coins", value: `− ${rupees(coinsAmount)}`, tone: "save" } : null,
  ].filter(Boolean)

  return (
    <div className={`relative min-h-screen ${ORDER_PAGE_BG} font-app ${BOTTOM_BAR_PAD}`}>
      <OrderTopBar title="Order Details" onBack={goBack} />

      <div className="mx-auto max-w-3xl space-y-3 px-4 pt-3">
        <CompletePaymentCard order={order} onPaid={() => window.location.reload()} />

        <OrderIdCard
          orderNo={orderIdDisplay}
          onCopy={handleCopyOrderId}
          image={firstItem?.image || ""}
          title={firstItem ? `${firstItem.name || "Item"}${moreItems > 0 ? ` + ${moreItems} more` : ""}` : ""}
          meta={[`Qty: ${itemCount}`, firstItem?.variantName || ""].filter(Boolean).join("  |  ")}
          chip={paymentMethod}
          chipIcon={isCash ? Banknote : Wallet}
          footer={
            paymentDate ? (
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-app-brown" aria-hidden="true" />
                <span className="min-w-0">Placed on {paymentDate}</span>
              </span>
            ) : null
          }
        />

        <StatusTimelineCard
          tone={statusTone}
          title={isDelivered ? "Order was delivered" : orderStatusLabel(order)}
          subtitle={paymentDate ? `Ordered ${paymentDate}` : ""}
          steps={timelineSteps}
        >
          {isCancelled && order.cancellationReason ? (
            <p className="rounded-xl bg-[#FFF0F2] px-3.5 py-2.5 text-[12.5px] text-[#9F1239]">Cancelled: {order.cancellationReason}</p>
          ) : null}
        </StatusTimelineCard>

        {/* Seller */}
        <DetailCard className="flex items-center gap-3 p-4">
          <img
            src={
              // Prefer the image from the first ordered item
              (Array.isArray(items) && items[0]?.image) ||
              sellerObj.profileImage?.url ||
              sellerObj.profileImage ||
              order.sellerImage ||
              imagePlaceholder
            }
            alt={sellerName}
            className="h-11 w-11 shrink-0 rounded-xl border border-app-line object-cover"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-bold text-app-ink">{sellerName}</h3>
            <p className="line-clamp-2 text-[12px] text-app-muted">{sellerLocation}</p>
          </div>
          <button
            type="button"
            onClick={handleCallSeller}
            aria-label="Call the store"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-app-line bg-[#FBF4ED] text-app-brown hover:bg-app-tint-strong"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
          </button>
        </DetailCard>

        <SectionHeading title="Item Details" aside={`${items.length} ${items.length === 1 ? "item" : "items"}`} />
        {items.map((item, idx) => {
          const qty = Number(item.quantity || item.qty) || 1
          const price = Number(item.price) || 0
          const compareUnit = getLineCompareUnitPrice(item)
          return (
            <ItemDetailCard
              key={idx}
              image={item.image || ""}
              name={
                <span className="flex items-start gap-2">
                  {typeof item.isVeg === "boolean" && (
                    <span
                      className={`mt-1 flex h-3 w-3 shrink-0 items-center justify-center border p-[1px] ${item.isVeg ? "border-green-600" : "border-red-600"}`}
                    >
                      <span className={`h-full w-full rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`} />
                    </span>
                  )}
                  <span>
                    {item.name}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </span>
                </span>
              }
              qty={qty}
              price={
                <DualMoney
                  amount={price * qty}
                  compareAmount={compareUnit > 0 ? compareUnit * qty : 0}
                  decimals={2}
                  plainClassName="text-[15px] font-bold text-app-ink tabular-nums"
                  saleClassName={saleClass}
                />
              }
            />
          )
        })}

        {/* Delivered: write or edit a review per product */}
        <OrderItemsReviewPanel order={order} />

        <SectionHeading
          title="Bill Summary"
          aside={
            <button
              type="button"
              onClick={handleDownloadSummary}
              className="inline-flex items-center gap-1.5 rounded-full bg-app-tint-strong px-3 py-1 text-[12px] font-semibold text-app-brown hover:bg-app-sand"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
            </button>
          }
        />
        <BillSummaryCard
          rows={billRows}
          totalLabel={totalLabel(order)}
          total={
            <DualMoney
              amount={orderPayTotal}
              compareAmount={compareToPay}
              decimals={2}
              plainClassName="font-extrabold text-app-ink tabular-nums"
              saleClassName={saleClass}
            />
          }
          footer={
            savings > 0 ? (
              <div className="border-t border-app-line p-3">
                <SavedBanner amount={`₹${Number(savings).toFixed(2)}`} />
              </div>
            ) : null
          }
        />

        {/* Customer, payment and date */}
        <DetailCard className="divide-y divide-app-line">
          {[
            { icon: User, title: userName || "Customer", text: userPhone },
            { icon: CreditCard, title: "Payment Method", text: paymentMethod },
            { icon: Calendar, title: "Order Date", text: paymentDate },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-tint-strong text-app-brown">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h4 className="text-[13.5px] font-semibold text-app-ink">{title}</h4>
                {text ? <p className="text-[12px] text-app-muted">{text}</p> : null}
              </div>
            </div>
          ))}
        </DetailCard>

        <SectionHeading title="Delivery Address" />
        <AddressCard icon={MapPin} lines={[addressText || "Address not available"]} />

        {/* Cancel until the order leaves the store */}
        {canCancelOrder(order) ? (
          <CancelLink onClick={() => setCancelling(true)} note="You can cancel until your order leaves the store." />
        ) : null}

        {/* Returns and replacements (delivered courier orders) */}
        <div id="returns" className="-mx-4 scroll-mt-20">
          <OrderReturnsSection order={order} />
        </div>

        {/* Seller complaint */}
        <button
          type="button"
          onClick={() => {
            // Use MongoDB _id (ObjectId) for the API call - backend complaint controller expects ObjectId
            // Priority: order._id (MongoDB ObjectId) > orderId from route params
            const orderMongoId = order._id || orderId

            if (!orderMongoId) {
              debugError("Order ID not available:", {
                order: order ? { _id: order._id, orderId: order.orderId } : null,
                routeOrderId: orderId
              })
              toast.error("Order ID not available. Please refresh the page.")
              return
            }

            // Convert to string if it's an ObjectId object
            const orderIdString = typeof orderMongoId === 'object' && orderMongoId.toString
              ? orderMongoId.toString()
              : String(orderMongoId)

            debugLog("Navigating to complaint page with orderId:", orderIdString)
            navigate(`/complaints/submit/${encodeURIComponent(orderIdString)}`)
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-line bg-white py-3 text-[13.5px] font-semibold text-app-brown hover:bg-app-tint"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Seller Complaint
        </button>
      </div>

      <OrderBottomBar
        actions={[
          {
            key: "reorder",
            label: "Reorder",
            icon: RotateCcw,
            // Same items and sizes back in the right cart, at today's prices.
            onClick: () => navigate(reorderPath({ ...order, _id: order?._id || orderId })),
          },
          { key: "invoice", label: "View Invoice", icon: Download, onClick: handleDownloadSummary },
          { key: "help", label: "Get Help", icon: Headphones, to: `/help/orders/${helpId}`, tone: "help" },
        ]}
      />

      {cancelling ? (
        <CancelOrderSheet
          order={order}
          onClose={() => setCancelling(false)}
          onCancelled={(updated) => {
            setCancelling(false)
            // The server returns the whole cancelled order (status, refund, history); keep it all.
            setOrder((o) => {
              const next = { ...o, orderStatus: "cancelled_by_user", ...(updated && typeof updated === "object" ? updated : {}) }
              // Keep the populated store if the response only carries its id.
              if (o?.sellerId && typeof o.sellerId === "object" && typeof next.sellerId !== "object") next.sellerId = o.sellerId
              return next
            })
          }}
        />
      ) : null}
    </div>
  )
}
