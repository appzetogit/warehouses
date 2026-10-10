// Run: node --test test/authRedirect.test.mjs   (from Frontend/)
import { test } from "node:test"
import assert from "node:assert/strict"
import { safeRedirectPath, pickRedirectPath } from "../src/modules/Store/pages/user/auth/authRedirect.js"

test("same-site paths are kept, with their query and hash", () => {
  assert.equal(safeRedirectPath("/cart"), "/cart")
  assert.equal(safeRedirectPath("/quick/product/abc?v=M#reviews"), "/quick/product/abc?v=M#reviews")
  assert.equal(safeRedirectPath({ pathname: "/orders/1", search: "?x=1" }), "/orders/1?x=1")
})

test("other sites, protocols and the sign-in pages are refused", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "cart", "", null, 42, "/auth/login", "/auth/otp", "/quick/auth/login", "/x\n/y"]) {
    assert.equal(safeRedirectPath(bad), null, String(bad))
  }
})

test("the first usable candidate wins", () => {
  assert.equal(pickRedirectPath(undefined, "//evil.com", "/wishlist", "/cart"), "/wishlist")
  assert.equal(pickRedirectPath(null, ""), null)
})
