import { useCallback, useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Truck,
  MessageCircle,
  Mail,
  FileText,
  RefreshCw,
  CreditCard,
  MapPin,
  HelpCircle,
  RotateCcw,
} from "lucide-react"
import AnimatedPage from "@store/components/user/AnimatedPage"
import ScrollReveal from "@store/components/user/ScrollReveal"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@store/components/ui/card"
import { Button } from "@store/components/ui/button"
import { Badge } from "@store/components/ui/badge"
import { orderAPI } from "@store/api"
import { getSupportEmail } from "@store/utils/businessSettings"
import { isCancelledStatus, orderStatusLabel, rupees } from "@store/utils/shopOrderFlow"

const commonIssues = [
  {
    id: "late-delivery",
    title: "Order Is Late",
    icon: Clock,
    description: "Your order hasn't arrived within the estimated time",
    solutions: [
      "Check the order page for the latest status and courier tracking",
      "Courier deliveries can take an extra day in some areas",
      "Raise a complaint if it is well past the expected date",
    ],
    actions: [
      { label: "Track Order", path: "track" },
      { label: "Contact Support", path: "support" },
    ],
  },
  {
    id: "missing-items",
    title: "Missing Items",
    icon: Package,
    description: "Some items from your order are missing",
    solutions: [
      "Check your invoice to see what was ordered",
      "Check whether items were delivered in a separate package",
      "Raise a complaint with photos of what you received",
    ],
    actions: [
      { label: "View Invoice", path: "invoice" },
      { label: "Report Issue", path: "support" },
    ],
  },
  {
    id: "wrong-order",
    title: "Wrong Item or Size",
    icon: XCircle,
    description: "You received something different from what you ordered",
    solutions: [
      "Request a return or a replacement from the order page",
      "Keep the item and its tags as they are until it is picked up",
      "Raise a complaint if the return option isn't available",
    ],
    actions: [
      { label: "Return / Replace", path: "refund" },
      { label: "Report Issue", path: "support" },
    ],
  },
  {
    id: "quality-issue",
    title: "Quality Issue",
    icon: AlertCircle,
    description: "Product quality doesn't meet expectations",
    solutions: [
      "Request a return or a replacement from the order page",
      "Describe the issue and add photos",
      "Once the item is picked up and checked, we refund or replace it",
    ],
    actions: [
      { label: "Return / Replace", path: "refund" },
      { label: "Report Issue", path: "support" },
    ],
  },
  {
    id: "payment-issue",
    title: "Payment Problem",
    icon: CreditCard,
    description: "Issues with payment or billing",
    solutions: [
      "Check the payment shown on your invoice",
      "Verify the charge on your bank or UPI statement",
      "Raise a complaint if you were charged incorrectly",
    ],
    actions: [
      { label: "View Invoice", path: "invoice" },
      { label: "Contact Support", path: "support" },
    ],
  },
  {
    id: "cancel-order",
    title: "Cancel Order",
    icon: RefreshCw,
    description: "Need to cancel your order",
    solutions: [
      "You can cancel from the order page until your order leaves the store",
      "Once it has been handed to the courier or rider, it can no longer be cancelled",
      "If you paid online, the refund starts automatically when you cancel",
    ],
    actions: [
      { label: "View Order", path: "track" },
      { label: "Contact Support", path: "support" },
    ],
  },
]

const formatDate = (dateString) => {
  if (!dateString) return "N/A"
  return new Date(dateString).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const statusColor = (order) => {
  const status = String(order?.orderStatus || order?.status || "")
  if (status === "delivered") return "bg-green-600 text-white"
  if (isCancelledStatus(status)) return "bg-red-600 text-white"
  return "bg-wh-brand text-wh-text"
}

export default function OrderHelp() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await orderAPI.getOrderDetails(orderId)
      const next = res?.data?.data?.order || null
      setOrder(next)
      if (!next) setError("not_found")
    } catch (err) {
      setOrder(null)
      setError(err?.response?.status === 404 ? "not_found" : err?.response?.data?.message || "Couldn't load this order")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  const id = String(order?._id || orderId)
  const displayId = order?.order_id || order?.orderId || orderId
  const supportEmail = getSupportEmail()
  const complaintPath = `/complaints/submit/${encodeURIComponent(id)}`

  const handleAction = (action) => {
    switch (action) {
      case "track":
        navigate(`/orders/${id}`)
        break
      case "invoice":
        navigate(`/orders/${id}/invoice`)
        break
      case "support":
        navigate(complaintPath)
        break
      case "refund":
        navigate(`/orders/${id}/details#returns`)
        break
      default:
        break
    }
  }

  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 p-4">
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="w-8 h-8 border-2 border-wh-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your order...</p>
        </div>
      </AnimatedPage>
    )
  }

  if (!order) {
    const notFound = error === "not_found"
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 p-4">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold mb-2">{notFound ? "Order Not Found" : "Couldn't load this order"}</h2>
              <p className="text-muted-foreground mb-6">
                {notFound ? `We couldn't find an order with ID: ${orderId}` : error}
              </p>
              <div className="flex gap-4 justify-center">
                {!notFound ? (
                  <Button variant="outline" onClick={load}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Try again
                  </Button>
                ) : null}
                <Link to="/orders">
                  <Button variant="outline">View All Orders</Button>
                </Link>
                <Link to="/help">
                  <Button>Go to Help Center</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  const address = order.deliveryAddress || order.address || null
  const delivered = String(order.orderStatus || "") === "delivered"

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a] p-4 md:p-6 lg:p-8">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto space-y-4 md:space-y-5 lg:space-y-6">
        {/* Header */}
        <ScrollReveal>
          <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
            <Link to="/help" aria-label="Back to Help Center">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 md:h-10 md:w-10">
                <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Order Help</h1>
              <p className="text-sm md:text-base text-muted-foreground">Order {displayId}</p>
            </div>
          </div>
        </ScrollReveal>

        {/* Order Summary */}
        <ScrollReveal delay={0.1}>
          <Card className="shadow-lg">
            <CardHeader className="p-4 md:p-5 lg:p-6">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg md:text-xl lg:text-2xl">
                  <Package className="h-4 w-4 md:h-5 md:w-5 text-wh-brand-ink" />
                  Order Summary
                </CardTitle>
                <Badge className={`${statusColor(order)} text-xs md:text-sm`}>
                  {orderStatusLabel(order)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 md:space-y-5 p-4 md:p-5 lg:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Order ID</p>
                  <p className="font-semibold">{displayId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Placed On</p>
                  <p className="font-semibold">{formatDate(order.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                  <p className="font-semibold text-wh-brand-ink text-xl">{rupees(order.pricing?.total ?? order.total)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Items</p>
                  <p className="font-semibold">
                    {order.items?.length || 0} item{(order.items?.length || 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {address ? (
                <div className="pt-4 border-t">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Delivery Address</p>
                      <p className="text-sm">
                        {[address.street, address.additionalDetails].filter(Boolean).join(", ")}
                        <br />
                        {[address.city, address.state].filter(Boolean).join(", ")} {address.zipCode || ""}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </ScrollReveal>

        {/* Common Issues */}
        <ScrollReveal delay={0.2}>
          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold">What can we help you with?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
              {commonIssues.map((issue) => {
                const Icon = issue.icon
                return (
                  <Card key={issue.id}>
                    <CardHeader className="p-4 md:p-5 lg:p-6">
                      <div className="flex items-start gap-3 md:gap-4">
                        <div className="p-2 md:p-3 bg-yellow-100 rounded-lg">
                          <Icon className="h-4 w-4 md:h-5 md:w-5 text-wh-brand-ink" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base md:text-lg lg:text-xl">{issue.title}</CardTitle>
                          <CardDescription className="mt-1 text-sm md:text-base">{issue.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 p-4 md:p-5 lg:p-6">
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">What to do:</p>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {issue.solutions.map((solution, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <span>{solution}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-2 pt-2 border-t">
                        {issue.actions.map((action, idx) => (
                          <Button
                            key={idx}
                            variant={idx === 0 ? "default" : "outline"}
                            size="sm"
                            className={idx === 0 ? "bg-wh-brand text-wh-text hover:opacity-90" : ""}
                            onClick={() => handleAction(action.path)}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </ScrollReveal>

        {/* Quick Actions */}
        <ScrollReveal delay={0.3}>
          <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200 shadow-lg">
            <CardHeader className="p-4 md:p-5 lg:p-6">
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl lg:text-2xl">
                <HelpCircle className="h-4 w-4 md:h-5 md:w-5 text-wh-brand-ink" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-5 lg:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 lg:gap-6">
                <Link to={`/orders/${id}`}>
                  <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                    <Truck className="h-4 w-4" />
                    <div className="text-left">
                      <div className="font-semibold">Track Order</div>
                      <div className="text-xs text-muted-foreground">See where it is</div>
                    </div>
                  </Button>
                </Link>
                {delivered ? (
                  <Link to={`/orders/${id}/details#returns`}>
                    <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                      <RotateCcw className="h-4 w-4" />
                      <div className="text-left">
                        <div className="font-semibold">Return / Replace</div>
                        <div className="text-xs text-muted-foreground">Request a refund or exchange</div>
                      </div>
                    </Button>
                  </Link>
                ) : (
                  <Link to={`/orders/${id}/invoice`}>
                    <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                      <FileText className="h-4 w-4" />
                      <div className="text-left">
                        <div className="font-semibold">View Invoice</div>
                        <div className="text-xs text-muted-foreground">Print or save</div>
                      </div>
                    </Button>
                  </Link>
                )}
                <Link to={complaintPath}>
                  <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                    <MessageCircle className="h-4 w-4" />
                    <div className="text-left">
                      <div className="font-semibold">Contact Support</div>
                      <div className="text-xs text-muted-foreground">Raise a complaint</div>
                    </div>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>

        {/* Contact Support Section */}
        <ScrollReveal delay={0.4}>
          <Card id="contact-support" className="shadow-lg">
            <CardHeader className="p-4 md:p-5 lg:p-6">
              <CardTitle className="text-xl md:text-2xl lg:text-3xl flex items-center gap-2">
                <MessageCircle className="h-5 w-5 md:h-6 md:w-6 text-wh-brand-ink" />
                Contact Support for This Order
              </CardTitle>
              <CardDescription className="text-sm md:text-base">
                Our support team is ready to help you with order {displayId}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 md:space-y-5 lg:space-y-6 p-4 md:p-5 lg:p-6">
              {supportEmail ? (
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Mail className="h-5 w-5 text-wh-brand-ink" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Email Support</h3>
                    <p className="text-sm text-muted-foreground mb-2">Include order {displayId} in the subject</p>
                    <a
                      href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Help with Order ${displayId}`)}`}
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      {supportEmail}
                    </a>
                  </div>
                </div>
              ) : null}
              <Link to={complaintPath} className="block">
                <Button className="w-full bg-wh-brand text-wh-text hover:opacity-90">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Raise a Complaint
                </Button>
              </Link>
            </CardContent>
          </Card>
        </ScrollReveal>

        {/* Back to Orders */}
        <ScrollReveal delay={0.5}>
          <div className="flex gap-4">
            <Link to="/orders" className="flex-1">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to All Orders
              </Button>
            </Link>
            <Link to="/help" className="flex-1">
              <Button variant="outline" className="w-full">
                <HelpCircle className="h-4 w-4 mr-2" />
                Help Center
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </AnimatedPage>
  )
}
