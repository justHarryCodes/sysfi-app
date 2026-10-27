"use client";
// components/explore/SignRequestSheet.js — a mini-app asked for a signature.
// Tribe's own sheet: the app can't change its wording. Shows who is asking
// (name + real origin) and what exactly will be signed.
import { useState } from "react";
import { IoAlertCircle, IoCreateOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

/** personal_sign data is usually 0x-hex; show it as text when it's readable. */
export function readableMessage(data) {
  if (typeof data !== "string" || !/^0x([0-9a-f]{2})*$/i.test(data)) return { text: String(data ?? ""), hex: false };
  try {
    const bytes = Uint8Array.from(data.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(text)) return { text, hex: false };
  } catch {}
  return { text: data, hex: true };
}

function TypedData({ typed }) {
  const { domain = {}, primaryType, message = {} } = typed;
  return (
    <div className="space-y-2 text-xs">
      <p className="text-text-tertiary">
        {primaryType} · {domain.name ?? "Unknown"}
        {domain.chainId ? ` · chain ${Number(domain.chainId)}` : ""}
      </p>
      {domain.verifyingContract && <p className="break-all font-mono text-text-secondary">Contract {domain.verifyingContract}</p>}
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 font-mono text-[11px] text-text">{JSON.stringify(message, null, 2)}</pre>
    </div>
  );
}

/**
 * request: { app: { name, iconUrl, origin }, kind: "message" | "typed", message?, typed? }
 * onSign() → Promise (performs the signature; the sheet waits), onReject()
 */
export default function SignRequestSheet({ request, onSign, onReject }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!request) return null;
  const { app } = request;
  const msg = request.kind === "message" ? readableMessage(request.message) : null;
  // Signing typed data for a different chain than the app is on is a classic phishing move.
  const crossChainTyped = request.kind === "typed" && request.typed?.domain?.chainId && Number(request.typed.domain.chainId) !== request.chainId;

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSign();
    } catch (e) {
      setError(e?.message ?? "Couldn't sign");
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={() => !busy && onReject()} labelledBy="sign-title" dismissible={!busy}>
      <div className="mb-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {app.iconUrl ? <img src={app.iconUrl} alt="" className="h-11 w-11 rounded-xl bg-surface object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface"><IoCreateOutline size={20} /></span>}
        <div className="min-w-0">
          <h2 id="sign-title" className="text-lg font-bold text-text">
            Signature request
          </h2>
          <p className="truncate text-xs text-text-secondary">
            {app.name} · <span className="font-mono">{app.origin}</span>
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        {msg ? (
          <>
            {msg.hex && <p className="mb-2 text-xs font-semibold text-neutral">Raw data — make sure you trust this app.</p>}
            <p className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-sm text-text">{msg.text}</p>
          </>
        ) : (
          <TypedData typed={request.typed} />
        )}
      </div>

      {crossChainTyped && (
        <p className="mb-4 flex gap-2 rounded-lg bg-down/[0.06] p-3 text-xs text-down">
          <IoAlertCircle size={16} className="mt-px shrink-0" />
          This signature is for chain {Number(request.typed.domain.chainId)}, not the network the app is using. Only sign if you expect that.
        </p>
      )}
      <p className="mb-4 text-xs text-text-tertiary">Signing doesn&apos;t send a transaction or cost gas, but signatures can authorise actions — only sign what you understand.</p>
      {error && <p className="mb-3 text-sm text-down">{error}</p>}
      <Button title="Sign" fullWidth loading={busy} onClick={sign} className="mb-2" />
      <Button title="Reject" variant="outline" fullWidth disabled={busy} onClick={onReject} />
    </Modal>
  );
}
