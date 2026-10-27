"use client";
// components/wallet/QRScanner.js — port of the app's QRScanner using the
// browser's BarcodeDetector + camera. `isQRScanSupported()` gates the button
// (Chromium-based browsers and Android; not Firefox/Safari desktop yet).
import { useEffect, useRef, useState } from "react";
import { isAddress } from "ethers";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

export const isQRScanSupported = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

/**
 * Accepts a bare address, an EIP-681 URI (ethereum:0x…@4663?value=…), or a
 * Tribe payment link (…/wallet/send/<token>?to=0x…&amount=…).
 * Returns { to, token?, amount? } or null.
 */
export function parseScannedPayment(text) {
  const raw = String(text || "").trim();
  if (isAddress(raw)) return { to: raw };

  const eip681 = raw.match(/^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@\d+)?(?:\/transfer)?(?:\?(.*))?$/);
  if (eip681) {
    const q = new URLSearchParams(eip681[2] || "");
    if (q.get("address") && isAddress(q.get("address"))) return { to: q.get("address"), token: eip681[1] };
    return { to: eip681[1] };
  }

  try {
    const url = new URL(raw);
    const m = url.pathname.match(/\/wallet\/send\/([^/]+)(?:\/(0x[0-9a-fA-F]{40}))?/);
    if (m) {
      const to = m[2] || url.searchParams.get("to");
      if (to && isAddress(to)) return { to, token: m[1], amount: url.searchParams.get("amount") || undefined };
    }
  } catch {}
  return null;
}

/**
 * `parse(text)` → result or null decides which codes count (default: wallet
 * payments); `hint` / `invalidMessage` word the screen for other uses.
 */
export default function QRScanner({
  open,
  onClose,
  onResult,
  parse = parseScannedPayment,
  hint = "Point your camera at a wallet address QR code.",
  invalidMessage = "That QR code isn't a wallet address.",
}) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let stream;
    let raf;
    let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const parsed = codes.map((c) => parse(c.rawValue)).find(Boolean);
            if (parsed) return onResult(parsed);
            if (codes.length) setError(invalidMessage);
          } catch {}
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        setError(err?.name === "NotAllowedError" ? "Camera access was blocked. Allow it in your browser settings." : "Couldn't start the camera.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onResult, parse, invalidMessage]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="qr-title">
      <h2 id="qr-title" className="mb-4 text-center text-lg font-bold text-text">
        Scan QR code
      </h2>
      <div className="relative mb-4 aspect-square overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-primary" />
      </div>
      <p className="mb-4 min-h-5 text-center text-sm text-text-secondary">{error || hint}</p>
      <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
    </Modal>
  );
}
