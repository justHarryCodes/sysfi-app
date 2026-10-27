"use client";
// Renders children into document.body. Needed for full-screen overlays: the
// desktop content panel uses backdrop-filter, which makes it the containing
// block for position:fixed descendants — without a portal, a modal opened
// from a page would be confined to the panel.
import { createPortal } from "react-dom";

export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
