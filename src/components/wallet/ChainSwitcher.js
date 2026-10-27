"use client";
// components/wallet/ChainSwitcher.js — the app's ChainSwitcher as a menu:
// chain icon + name as the trigger, every supported chain in the list.
// `only` narrows the list (e.g. chains with a DAO factory or a swap router);
// the active chain is global (ChainContext), so wallet, trade and DAOs move
// together.
import { useCallback, useRef, useState } from "react";
import { IoChevronDown, IoCheckmark, IoGlobeOutline } from "react-icons/io5";
import Popover from "@/components/ui/Popover";
import { useChain } from "@/contexts/ChainContext";

export function ChainIcon({ chain, size = 18, className = "" }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={chain.icon} alt="" width={size} height={size} className={`shrink-0 rounded-full bg-surface ${className}`} style={{ width: size, height: size }} />;
}

/**
 * props
 *   only(chain) → bool   which chains to offer (default: all)
 *   size "sm" | "md"
 *   allowAll / allSelected / onPick(chain | null)
 *                         adds an "All networks" entry (wallet home); onPick
 *                         also fires for a chain choice
 */
export default function ChainSwitcher({ only, size = "md", className = "", allowAll = false, allSelected = false, onPick }) {
  const { activeChain, chains, switchChain } = useChain();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const options = only ? chains.filter(only) : chains;
  const sm = size === "sm";

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface font-bold text-text hover:border-primary/40 ${sm ? "h-7 px-2 text-[11px]" : "h-10 px-3 text-sm"} ${className}`}
      >
        {allSelected ? (
          <IoGlobeOutline size={sm ? 14 : 18} className="text-primary" />
        ) : (
          <ChainIcon chain={activeChain} size={sm ? 14 : 18} />
        )}
        <span className="max-w-[120px] truncate">{allSelected ? "All networks" : sm ? activeChain.shortName : activeChain.name}</span>
        {activeChain.testnet && <span className="rounded bg-warning px-1 text-[9px] font-black text-background">TEST</span>}
        <IoChevronDown size={sm ? 11 : 14} className="text-text-tertiary" />
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} placement="bottom-start" className="w-60 p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">Network</p>
        <ul role="listbox" aria-label="Network">
          {allowAll && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={allSelected}
                onClick={() => {
                  onPick?.(null);
                  close();
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${allSelected ? "bg-primary/10 font-bold text-primary" : "text-text hover:bg-hover"}`}
              >
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-hover">
                  <IoGlobeOutline size={14} />
                </span>
                <span className="min-w-0 flex-1">All networks</span>
                {allSelected && <IoCheckmark size={16} />}
              </button>
            </li>
          )}
          {options.map((c) => {
            const on = !allSelected && c.id === activeChain.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    switchChain(c.id);
                    onPick?.(c);
                    close();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${on ? "bg-primary/10 font-bold text-primary" : "text-text hover:bg-hover"}`}
                >
                  <ChainIcon chain={c} size={22} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.testnet && <span className="rounded bg-warning/20 px-1 text-[9px] font-black text-warning">TEST</span>}
                  {on && <IoCheckmark size={16} />}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
