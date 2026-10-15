import { useParams, Link } from "react-router-dom"

import { Download, ArrowLeft, FileText, Printer, RefreshCw } from "lucide-react"
import { useRef, useState, useEffect, useCallback } from "react"
import AnimatedPage from "@store/components/user/AnimatedPage"
import ScrollReveal from "@store/components/user/ScrollReveal"
import { Card, CardContent } from "@store/components/ui/card"
import { Button } from "@store/components/ui/button"
import { Badge } from "@store/components/ui/badge"
import { useCompanyName } from "@store/hooks/useCompanyName"
import { orderAPI } from "@store/api"
import { resolveMediaUrl } from "@/shared/utils/mediaUrl"
import {
  orderStatusLabel,
  paymentMethodLabel,
  rupees,
  storeNameOf,
  totalLabel,
  variantText,
} from "@store/utils/shopOrderFlow"
import { PriceRows, ShopAddressBlock } from "./ShopOrderDetails"

const formatDate = (dateString) =>
  dateString
    ? new Date(dateString).toLocaleString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : ""

// The print window has no Tailwind, so the few classes the invoice uses are spelled out.
const PRINT_CSS = `
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  img { display: none; }
  .invoice-header { border-bottom: 2px solid #58321D; padding-bottom: 20px; margin-bottom: 30px; }
  .invoice-title { font-size: 32px; font-weight: bold; color: #58321D; margin: 0 0 10px; }
  .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background-color: #F1E4D6; color: #3A2619; font-weight: bold; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .total-section { margin-top: 30px; max-width: 360px; margin-left: auto; }
  .flex { display: flex; }
  .justify-between { justify-content: space-between; }
  .gap-3 { gap: 12px; }
  .space-y-1\\.5 > * + * { margin-top: 6px; }
  .border-t { border-top: 1px solid #ddd; }
  .mt-2 { margin-top: 8px; }
  .pt-2 { padding-top: 8px; }
  .font-bold { font-weight: bold; }
  .text-green-700, .text-app-ok { color: #3F7D55; }
  .text-wh-muted, .text-app-muted, .text-muted-foreground { color: #666; }
  .sm\\:hidden { display: none; }
  @media print { body { margin: 0; padding: 20px; } .no-print { display: none; } }
`

export default function OrderInvoice() {
  const companyName = useCompanyName()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const invoiceRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await orderAPI.getOrderDetails(orderId)
      const next = response?.data?.data?.order || null
      if (next) setOrder(next)
      else setError("Order not found")
    } catch (err) {
      setError(err?.response?.status === 404 ? "Order not found" : err?.response?.data?.message || "Couldn't load the invoice")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-app-cream dark:bg-[#0a0a0a] p-4 font-app">
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="w-8 h-8 border-2 border-app-brown border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-app-muted">Generating invoice...</p>
        </div>
      </AnimatedPage>
    )
  }

  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-app-cream dark:bg-[#0a0a0a] p-4 font-app">
        <div className="max-w-4xl mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4 text-app-ink">{error || "Order not found"}</h1>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={load} className="flex items-center gap-2 border-app-line text-app-brown hover:bg-app-tint">
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
            <Link to="/orders">
              <Button className="bg-app-brown text-white hover:bg-app-brown-deep">Back to Orders</Button>
            </Link>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  const id = String(order._id || orderId)
  const displayId = order.order_id || order.orderId || id
  const items = Array.isArray(order.items) ? order.items : []
  const store = storeNameOf(order)

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow || !invoiceRef.current) {
      window.print()
      return
    }
    const printContent = invoiceRef.current.innerHTML
    const title = `Invoice - ${displayId}`.replace(/[<>&"]/g, "")

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>${PRINT_CSS}</style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  return (
    <AnimatedPage className="min-h-screen bg-app-cream font-app dark:bg-[#0a0a0a] p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
        <ScrollReveal>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Link to={`/orders/${id}`} aria-label="Back to order">
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10 text-app-ink hover:bg-app-tint-strong">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-app-ink lg:font-app-display lg:text-[34px] lg:text-app-brown-deep">Invoice</h1>
                <p className="text-app-muted text-sm sm:text-base">Order {displayId}</p>
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <Button
                variant="outline"
                onClick={handlePrint}
                className="flex items-center gap-2 text-xs sm:text-sm h-9 sm:h-10 rounded-xl border-app-line bg-white text-app-brown hover:bg-app-tint"
              >
                <Printer className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Print</span>
              </Button>
              <Button
                onClick={handlePrint}
                className="bg-app-brown hover:bg-app-brown-deep text-white rounded-xl flex items-center gap-2 text-xs sm:text-sm h-9 sm:h-10"
              >
                <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Save as PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <Card ref={invoiceRef} className="rounded-[18px] border-app-line bg-white text-app-ink shadow-[0_2px_10px_rgba(25,20,17,0.04)] dark:bg-[#1a1a1a] dark:border-gray-800">
            <CardContent className="p-4 sm:p-6 md:p-8 lg:p-10">
              {/* Invoice Header */}
              <div className="invoice-header border-b-2 border-app-brown pb-4 sm:pb-5">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-app-brown" />
                  <h2 className="invoice-title text-xl sm:text-2xl md:text-3xl text-app-brown font-bold">INVOICE</h2>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                  <div>
                    <p className="text-xs sm:text-sm text-app-muted">{companyName}</p>
                    {store ? <p className="text-xs sm:text-sm text-app-muted">Sold by {store}</p> : null}
                  </div>
                  <Badge className="bg-app-sand text-app-brown-deep text-sm sm:text-base px-3 sm:px-4 py-1.5 sm:py-2 w-fit rounded-full">
                    {orderStatusLabel(order)}
                  </Badge>
                </div>
              </div>

              {/* Invoice Details */}
              <div className="invoice-details grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mt-4 sm:mt-6">
                <div>
                  <h3 className="font-bold mb-2 text-sm sm:text-base">Deliver To:</h3>
                  <ShopAddressBlock address={order.deliveryAddress || order.address || {}} />
                </div>
                <div className="text-left sm:text-right">
                  <h3 className="font-bold mb-2 text-sm sm:text-base">Invoice Details:</h3>
                  <p className="text-xs sm:text-sm"><strong>Order #:</strong> {displayId}</p>
                  <p className="text-xs sm:text-sm"><strong>Date:</strong> {formatDate(order.createdAt)}</p>
                  <p className="text-xs sm:text-sm"><strong>Payment:</strong> {paymentMethodLabel(order)}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="invoice-items mt-4 sm:mt-6">
                <h3 className="font-bold mb-3 sm:mb-4 text-sm sm:text-base">Order Items:</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-app-sand text-app-brown-deep">
                        <th className="px-2 sm:px-3 py-2 text-left">Item</th>
                        <th className="px-2 sm:px-3 py-2 text-center hidden sm:table-cell">Quantity</th>
                        <th className="px-2 sm:px-3 py-2 text-right hidden md:table-cell">Unit Price</th>
                        <th className="px-2 sm:px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const qty = Number(item.quantity) || 1
                        const price = Number(item.price) || 0
                        const variant = variantText(item)
                        const src = item.image ? resolveMediaUrl(item.image) : ""
                        return (
                          <tr key={`${item.itemId || item.name}-${item.variantId || ""}-${i}`} className="border-b border-app-line">
                            <td className="px-2 sm:px-3 py-2 sm:py-3">
                              <div className="flex items-center gap-2 sm:gap-3">
                                {src ? (
                                  <img
                                    src={src}
                                    alt=""
                                    className="w-8 h-8 sm:w-12 sm:h-12 object-cover rounded-lg bg-app-alt flex-shrink-0"
                                  />
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium block">{item.name}</span>
                                  {variant ? <span className="block text-xs text-app-muted">{variant}</span> : null}
                                  <span className="text-app-muted sm:hidden text-xs">
                                    Qty: {qty} × {rupees(price)}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 sm:px-3 py-2 sm:py-3 text-center hidden sm:table-cell">{qty}</td>
                            <td className="px-2 sm:px-3 py-2 sm:py-3 text-right hidden md:table-cell">{rupees(price)}</td>
                            <td className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium">{rupees(price * qty)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals: rows that add up to the order total */}
              <div className="total-section mt-4 sm:mt-6 sm:ml-auto sm:max-w-sm">
                <PriceRows order={order} totalText={totalLabel(order)} />
              </div>

              {/* Footer */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-app-line text-center text-xs sm:text-sm text-app-muted">
                <p>Thank you for shopping with {companyName}!</p>
                <p className="mt-1 sm:mt-2">For any queries, please contact our support team.</p>
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 no-print">
            <Link to={`/orders/${id}`} className="flex-1">
              <Button className="w-full rounded-xl bg-app-brown text-sm text-white hover:bg-app-brown-deep sm:text-base h-10 sm:h-11">
                Track Order
              </Button>
            </Link>
            <Link to="/orders" className="flex-1">
              <Button variant="outline" className="w-full rounded-xl border-app-brown bg-white text-sm text-app-brown hover:bg-app-tint sm:text-base h-10 sm:h-11">
                Back to Orders
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </AnimatedPage>
  )
}
