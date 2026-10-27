"use client";
// components/shell/SearchPalette.js — desktop command palette (⌘K / Ctrl+K / "/").
// Empty or one-letter queries list destinations; two letters and up search
// public tribes (same cached query the old rail search used). Arrow keys move,
// Enter opens.
import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IoSearchOutline, IoLockClosed, IoArrowForward } from "react-icons/io5";
import { useTribeSearch } from "@/hooks/queries";
import { useWallet } from "@/contexts/WalletContext";
import { countLabel } from "@/lib/format";
import Portal from "@/components/ui/Portal";
import Spinner from "@/components/ui/Spinner";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { DESKTOP_NAV, MORE_GROUPS, visibleItems } from "./nav";

// Mounted only while open, so every opening starts with a fresh query.
export default function SearchPalette({ open, onClose }) {
  return open ? <Palette onClose={onClose} /> : null;
}

function Palette({ onClose }) {
  const router = useRouter();
  const { isExternal } = useWallet();
  const [q, setQ] = useState("");
  const [rawCursor, setCursor] = useState(0);
  const deferred = useDeferredValue(q);
  const { data, isFetching } = useTribeSearch(deferred);
  const term = q.trim().toLowerCase();
  const searching = term.length >= 2;

  const pages = useMemo(() => {
    const all = [...DESKTOP_NAV, ...MORE_GROUPS.flatMap((g) => visibleItems(g.items, isExternal).filter((i) => i.ready))];
    return all.filter((p) => p.label.toLowerCase().includes(term));
  }, [term, isExternal]);

  const items = [
    ...(searching ? (data ?? []).map((t) => ({ key: `t${t.id}`, href: `/tribe/${t.id}`, tribe: t })) : []),
    ...pages.map((p) => ({ key: p.href, href: p.href, page: p })),
  ];

  // Results can shrink under the cursor as the search resolves.
  const cursor = Math.min(rawCursor, Math.max(items.length - 1, 0));

  const go = (href) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && items[cursor]) go(items[cursor].href);
  };

  const tribeCount = searching ? (data?.length ?? 0) : 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[90] flex justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onMouseDown={(e) => e.stopPropagation()}
          className="glass-strong flex h-fit max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[22px] [animation:pop-in_140ms_ease-out]"
        >
          <label className="flex h-14 shrink-0 items-center gap-3 border-b border-panel-border px-5 text-text-tertiary">
            <IoSearchOutline size={20} />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search tribes, or jump to a page"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-tertiary"
            />
            {isFetching && searching && <Spinner size={16} />}
            <kbd className="rounded-md border border-panel-border px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">ESC</kbd>
          </label>

          <ul className="panel-scroll overflow-y-auto p-2" role="listbox" aria-label="Results">
            {searching && (
              <li className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[1.2px] text-text-tertiary" aria-hidden>
                Tribes
              </li>
            )}
            {searching && !isFetching && tribeCount === 0 && (
              <li className="px-3 py-3 text-sm text-text-tertiary">No tribes match “{q.trim()}”.</li>
            )}
            {items.map((it, i) => {
              const active = i === cursor;
              const first = it.page && i === tribeCount;
              return (
                <li key={it.key} role="option" aria-selected={active}>
                  {first && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[1.2px] text-text-tertiary" aria-hidden>
                      Go to
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(it.href)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${active ? "bg-primary/10" : ""}`}
                  >
                    {it.tribe ? (
                      <>
                        <TribeAvatar tribe={it.tribe} size={34} rounded="rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 truncate text-md font-bold text-text">
                            {it.tribe.name}
                            {it.tribe.tokenGating && <IoLockClosed size={12} className="shrink-0 text-primary" aria-label="Token-gated" />}
                          </span>
                          <span className="block truncate text-xs text-text-tertiary">
                            {it.tribe.genre || "Community"} · {countLabel(it.tribe.memberCount, "member")}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-hover text-text-secondary">
                          <it.page.Icon size={18} />
                        </span>
                        <span className="flex-1 text-md font-semibold text-text">{it.page.label}</span>
                      </>
                    )}
                    {active && <IoArrowForward size={16} className="shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Portal>
  );
}
