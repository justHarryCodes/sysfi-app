"use client";
// Search tribes — port of SearchTribeScreen: query + genre chips; with no
// query, shows the top tribes to browse.
import { Suspense, useDeferredValue, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IoSearchOutline, IoCloseCircle } from "react-icons/io5";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/layout/PageHeader";
import TribeRow, { TribeRowSkeleton } from "@/components/tribe/TribeRow";
import { useTopTribes } from "@/hooks/queries";
import { GENRES, searchTribes } from "@/lib/tribeApi";

function Search() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [genre, setGenre] = useState(params.get("genre") || null);
  const term = useDeferredValue(q.trim());
  const searching = term.length >= 2;

  const results = useQuery({
    queryKey: ["public", "tribes", "search", term.toLowerCase(), genre],
    queryFn: () => searchTribes(term, genre || undefined),
    enabled: searching,
    staleTime: 60_000,
    meta: { persist: false },
    placeholderData: (prev) => prev,
  });
  const top = useTopTribes(30);

  const list = searching ? results.data : (top.data || []).filter((t) => !genre || t.genre === genre);
  const pending = searching ? results.isPending : top.isPending;

  return (
    <>
      <PageHeader title="Find Tribes" backHref="/tribes" />
      <div className="space-y-3 px-4 py-3">
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-hover px-4 text-text-tertiary focus-within:shadow-[inset_0_0_0_1px_var(--primary)]">
          <IoSearchOutline size={18} />
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or description"
            aria-label="Search tribes"
            className="min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear" className="text-primary">
              <IoCloseCircle size={20} />
            </button>
          )}
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Genre">
          {[null, ...GENRES].map((g) => (
            <button
              key={g ?? "all"}
              type="button"
              aria-pressed={genre === g}
              onClick={() => setGenre(g)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                genre === g ? "bg-primary text-on-primary" : "bg-hover text-text-secondary hover:text-text"
              }`}
            >
              {g ?? "All"}
            </button>
          ))}
        </div>
      </div>

      <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[1px] text-text-tertiary">
        {searching ? "Results" : "Top tribes"}
      </p>
      {pending ? (
        Array.from({ length: 5 }, (_, i) => <TribeRowSkeleton key={i} />)
      ) : !list?.length ? (
        <p className="px-4 py-12 text-center text-sm text-text-secondary">
          {searching ? `No tribes match “${term}”${genre ? ` in ${genre}` : ""}.` : "No tribes here yet."}
        </p>
      ) : (
        list.map((t) => <TribeRow key={t.id} tribe={t} />)
      )}
    </>
  );
}

export default function SearchTribesPage() {
  return (
    <Suspense>
      <Search />
    </Suspense>
  );
}
