/**
 * Ways to pay at checkout and how each one reaches the server and Razorpay.
 *
 * "Pay Later" and "Pay Online" are both ordinary Razorpay payments: the order
 * is created with paymentMethod "razorpay" and verified the same way. They
 * only change which methods Razorpay Checkout shows first. If a method is not
 * enabled on the merchant account, Checkout simply leaves it out and still
 * shows the default list (show_default_blocks), so nothing breaks.
 */

export const PAY_CASH = "cash"
export const PAY_WALLET = "wallet"
export const PAY_ONLINE = "razorpay"
export const PAY_LATER = "paylater"

/** True for the choices that open Razorpay Checkout. */
export const isOnlinePayChoice = (choice) => choice === PAY_ONLINE || choice === PAY_LATER

/** The paymentMethod the order API accepts for a checkout choice. */
export const toBackendPaymentMethod = (choice) => {
  if (choice === PAY_CASH) return "cash"
  if (choice === PAY_WALLET) return "wallet"
  return "razorpay"
}

/** Razorpay Checkout `config` for a choice, or undefined to use Razorpay's defaults. */
export const razorpayCheckoutConfig = (choice) => {
  if (choice === PAY_LATER) {
    return {
      display: {
        blocks: {
          paylater: {
            name: "Pay Later",
            instruments: [{ method: "paylater" }],
          },
        },
        sequence: ["block.paylater"],
        preferences: { show_default_blocks: true },
      },
    }
  }
  if (choice === PAY_ONLINE) {
    return {
      display: {
        blocks: {
          online: {
            name: "Pay Online",
            instruments: [
              { method: "upi" },
              { method: "wallet" },
              { method: "card" },
              { method: "netbanking" },
            ],
          },
        },
        sequence: ["block.online"],
        preferences: { show_default_blocks: true },
      },
    }
  }
  return undefined
}

/** Short label for the chosen way to pay. */
export const payChoiceLabel = (choice) => {
  if (choice === PAY_WALLET) return "Wallet"
  if (choice === PAY_CASH) return "Cash on Delivery"
  if (choice === PAY_LATER) return "Pay Later"
  return "Pay Online"
}
