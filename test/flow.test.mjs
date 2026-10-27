// lib/flow.js — which pages signed-out visitors can read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicRoute } from "@/lib/flow";

const DAO = "/daos/4663/0xa6Adddf8E72604b73FB8940a973f9Dc9F6F5A21C";

test("public pages", () => {
  for (const p of ["/", "/feed", "/tribes", "/tribes/search", "/tribe/abc", "/tribe/abc/posts", "/tribe/abc/members", "/post/t/p", "/invite/XyZ123",
    "/daos", DAO, `${DAO}/proposal/7`, "/explore", "/explore/app1", "/explore/bots/b1", "/developers/docs", "/swap"]) {
    assert.equal(isPublicRoute(p), true, p);
  }
});

test("private pages", () => {
  for (const p of ["/wallet", "/wallet/assets", "/settings", "/profile", "/tribe/abc/chat", "/tribe/abc/settings", "/tribe/abc/apps", "/tribes/create",
    "/daos/launch", `${DAO}/propose`, "/daos/4663/0x123", "/explore/dev", "/developers", "/developers/bots/new", "/feed/x"]) {
    assert.equal(isPublicRoute(p), false, p);
  }
});

test("Google sign-ups set up the wallet before the profile", async () => {
  const { computeFlowState, FLOW } = await import("@/lib/flow");
  const g = { uid: "u", emailVerified: true, isGoogleOnly: true };
  const base = { authLoading: false, checkingWallet: false, walletCheckError: null, backupPending: false };
  assert.equal(computeFlowState({ ...base, user: g, firestoreWalletExists: false }), FLOW.WALLET_SETUP);
  assert.equal(computeFlowState({ ...base, user: g, firestoreWalletExists: true, backupPending: true }), FLOW.WALLET_SETUP);
  assert.equal(computeFlowState({ ...base, user: g, firestoreWalletExists: true }), FLOW.PROFILE_SETUP);
  assert.equal(computeFlowState({ ...base, user: { ...g, username: "a", displayName: "A" }, firestoreWalletExists: true }), FLOW.READY);
  // Email accounts keep profile → wallet.
  const e = { uid: "u", emailVerified: true };
  assert.equal(computeFlowState({ ...base, user: e, firestoreWalletExists: false }), FLOW.PROFILE_SETUP);
});
