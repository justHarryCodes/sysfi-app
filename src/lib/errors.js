// lib/errors.js — error helpers with no dependencies (shared with the mobile
// app, which bundles parts of web/src/lib through its Metro config).

/** Wallet rejected the request (MetaMask 4001 / viem UserRejectedRequestError). */
export const isUserRejection = (err) =>
  err?.code === 4001 ||
  err?.code === "ACTION_REJECTED" ||
  err?.name === "UserRejectedRequestError" ||
  err?.cause?.name === "UserRejectedRequestError" ||
  /user (rejected|denied)/i.test(err?.shortMessage || err?.message || "");
