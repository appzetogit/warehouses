/**
 * Safe seller logout — thin wrapper around shared module logout.
 * Keeps existing `@food/utils/sellerLogout` imports working.
 */

export { logoutSellerSession } from "@food/utils/moduleLogout";
