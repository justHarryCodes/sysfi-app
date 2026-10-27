"use client";
// components/explore/ConsentSheet.js — first open of a mini-app from Explore:
// what it asked for, in plain words; the user can untick anything except
// the basics. Signing and payments are still confirmed one by one later.
import { useState } from "react";
import { IoShieldCheckmarkOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { SCOPES } from "@/lib/miniapp/protocol";

export default function ConsentSheet({ app, requested, onAllow, onCancel, busy }) {
  const [picked, setPicked] = useState(() => new Set(requested));
  const toggle = (s) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  return (
    <Modal open onClose={onCancel} labelledBy="consent-title">
      <div className="mb-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={app.iconUrl || "/icon.png"} alt="" className="h-12 w-12 rounded-xl bg-surface object-cover" />
        <div className="min-w-0">
          <h2 id="consent-title" className="truncate text-lg font-bold text-text">
            Open {app.name}?
          </h2>
          <p className="truncate font-mono text-xs text-text-tertiary">{app.origin}</p>
        </div>
      </div>
      {requested.length ? (
        <>
          <p className="mb-2 text-sm text-text-secondary">This app would like to:</p>
          <ul className="mb-4 space-y-1">
            {requested.map((s) => (
              <li key={s}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                  <input type="checkbox" checked={picked.has(s)} onChange={() => toggle(s)} className="h-4 w-4 accent-[var(--primary)]" />
                  <span className="text-sm text-text">{SCOPES[s] ?? s}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-4 text-sm text-text-secondary">This app doesn&apos;t ask for any access to your wallet or profile.</p>
      )}
      <p className="mb-4 flex gap-2 text-xs text-text-tertiary">
        <IoShieldCheckmarkOutline size={15} className="mt-px shrink-0 text-primary" />
        Every signature, transaction and payment still needs your confirmation. You can change this any time from the app&apos;s page.
      </p>
      <Button title="Allow & open" fullWidth loading={busy} onClick={() => onAllow([...picked])} className="mb-2" />
      <Button title="Cancel" variant="outline" fullWidth onClick={onCancel} />
    </Modal>
  );
}
