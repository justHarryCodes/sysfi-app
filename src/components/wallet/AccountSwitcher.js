"use client";
// components/wallet/AccountSwitcher.js — port of AccountSwitcherModal: list
// HD accounts, switch, rename, and add the next one (derived from the
// mnemonic, so it asks for the password via withSecret).
import { useState } from "react";
import { IoCheckmarkCircle, IoAdd, IoCreateOutline, IoCopyOutline, IoCheckmark } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useWallet } from "@/contexts/WalletContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { formatAddress } from "@/lib/wallet";

export default function AccountSwitcher({ open, onClose }) {
  const { accounts, activeAccountIndex, switchAccount, addAccount, renameAccount, isExternal } = useWallet();
  const { showAlert } = useFeedback();
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(null);

  const add = async () => {
    setAdding(true);
    try {
      await addAccount(); // becomes the active account
    } catch (err) {
      if (err?.code !== "USER_CANCELLED") showAlert("Couldn't add account", err.message);
    } finally {
      setAdding(false);
    }
  };

  const saveName = (index) => {
    if (name.trim()) renameAccount(index, name.trim().slice(0, 32));
    setEditing(null);
  };

  const copy = async (a) => {
    await navigator.clipboard.writeText(a.address);
    setCopied(a.index);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="accounts-title">
      <h2 id="accounts-title" className="mb-4 text-lg font-bold text-text">
        Accounts
      </h2>
      <ul className="mb-5 max-h-[50dvh] space-y-2 overflow-y-auto">
        {accounts.map((a) => {
          const active = a.index === activeAccountIndex;
          return (
            <li
              key={a.index}
              className={`flex items-center gap-3 rounded-lg border p-3 ${active ? "border-primary/40 bg-primary/5" : "border-border bg-surface"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-on-primary">
                {a.index + 1}
              </span>
              <span className="min-w-0 flex-1">
                {editing === a.index ? (
                  <input
                    autoFocus
                    value={name}
                    maxLength={32}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => saveName(a.index)}
                    onKeyDown={(e) => e.key === "Enter" && saveName(a.index)}
                    aria-label="Account name"
                    className="w-full rounded border border-primary bg-background px-2 py-0.5 text-sm font-bold text-text outline-none"
                  />
                ) : (
                  <button type="button" onClick={() => switchAccount(a.index)} className="block w-full text-left">
                    <span className="block truncate text-sm font-bold text-text">{a.name}</span>
                    <span className="block font-mono text-xs text-text-secondary">{formatAddress(a.address, 6)}</span>
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => copy(a)}
                aria-label="Copy address"
                className="p-1 text-text-tertiary hover:text-text"
              >
                {copied === a.index ? <IoCheckmark size={16} className="text-primary" /> : <IoCopyOutline size={16} />}
              </button>
              {!isExternal && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(a.index);
                    setName(a.name);
                  }}
                  aria-label="Rename account"
                  className="p-1 text-text-tertiary hover:text-text"
                >
                  <IoCreateOutline size={16} />
                </button>
              )}
              {active && <IoCheckmarkCircle size={20} className="shrink-0 text-primary" aria-label="Active account" />}
            </li>
          );
        })}
      </ul>
      {isExternal ? (
        <p className="mb-4 text-center text-xs text-text-tertiary">
          This account is bound to your connected wallet. Manage accounts in your wallet app.
        </p>
      ) : (
        <Button
          title="Add Account"
          icon={<IoAdd size={18} />}
          variant="secondary"
          fullWidth
          loading={adding}
          onClick={add}
          className="mb-3"
        />
      )}
      <Button title="Done" fullWidth onClick={onClose} />
    </Modal>
  );
}
