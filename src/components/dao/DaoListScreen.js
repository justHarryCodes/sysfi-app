"use client";
// DAO browser — port of DAOListScreen: search, genre chips, list/grid,
// launch button. "Holding" narrows to DAOs whose governance token this
// wallet holds (the app's unrouted MyDAOScreen / useMyDAOs).
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IoAdd,
  IoSearchOutline,
  IoGridOutline,
  IoListOutline,
  IoCloudOfflineOutline,
  IoRefresh,
  IoCloseCircleOutline,
  IoPeopleOutline,
  IoWalletOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import { DaoCard, GenreFilter } from "@/components/dao/DaoUi";
import ChainSwitcher, { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { useChain } from "@/contexts/ChainContext";
import { useDaoList, useHeldTokenSet } from "@/hooks/daos";
import { useDebounced } from "@/hooks/useDebounced";
import { getFactoryAddress } from "@/lib/dao/contracts";

export default function DaoListScreen() {
  const { activeChain: chain, chains, switchChain } = useChain();
  const list = useDaoList(chain.id);
  const held = useHeldTokenSet();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(null);
  const [grid, setGrid] = useState(true);
  const [holdingOnly, setHoldingOnly] = useState(false);
  const q = useDebounced(query.trim().toLowerCase(), 200);

  const daos = useMemo(() => list.data || [], [list.data]);
  const isHolding = (d) => !!d.tokenAddress && held.has(d.tokenAddress.toLowerCase());
  const shown = useMemo(
    () =>
      daos
        .filter((d) => genre === null || d.genreId === genre)
        .filter((d) => !q || d.name.toLowerCase().includes(q) || d.address.toLowerCase().includes(q))
        .filter((d) => !holdingOnly || (!!d.tokenAddress && held.has(d.tokenAddress.toLowerCase())))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [daos, genre, q, holdingOnly, held],
  );
  const hasFilters = !!q || genre !== null || holdingOnly;
  const clear = () => {
    setQuery("");
    setGenre(null);
    setHoldingOnly(false);
  };

  const launchable = !!getFactoryAddress(chain.id);

  return (
    <>
      <PageHeader title="DAOs" subtitle={list.data ? `${daos.length} ${daos.length === 1 ? "community" : "communities"} on ${chain.name}${list.isFetching ? " · syncing…" : ""}` : undefined} />

      <div className="flex items-center gap-2 px-4 pt-3 md:px-5">
        <ChainSwitcher only={(c) => !!c.daoFactory} />
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary">
          <IoSearchOutline size={16} className="shrink-0 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search DAOs on ${chain.name}…`}
            aria-label="Search DAOs"
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-text-tertiary hover:text-text">
              <IoCloseCircleOutline size={16} />
            </button>
          )}
        </label>
        <button
          type="button"
          aria-pressed={holdingOnly}
          onClick={() => setHoldingOnly((v) => !v)}
          title="DAOs whose token you hold"
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${holdingOnly ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-secondary hover:text-text"}`}
        >
          <IoWalletOutline size={16} /> <span className="hidden sm:inline">Holding</span>
        </button>
        <button
          type="button"
          aria-label={grid ? "List view" : "Grid view"}
          onClick={() => setGrid((v) => !v)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text hover:bg-hover"
        >
          {grid ? <IoListOutline size={18} /> : <IoGridOutline size={18} />}
        </button>
        {launchable && (
          <Link href="/daos/launch" className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-bold text-on-primary hover:opacity-90">
            <IoAdd size={18} /> <span className="hidden sm:inline">Launch</span>
          </Link>
        )}
      </div>

      <GenreFilter value={genre} onChange={setGenre} />

      <div className="px-4 pb-8 pt-2 md:px-5">
        {!launchable ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <ChainIcon chain={chain} size={56} className="mb-4" />
            <p className="mb-2 text-lg font-semibold text-text">Governance isn&apos;t on {chain.name} yet</p>
            <p className="mb-5 max-w-sm text-sm text-text-secondary">Sysfi DAOs are deployed on these networks — more are coming.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {chains
                .filter((c) => c.daoFactory)
                .map((c) => (
                  <button key={c.id} type="button" onClick={() => switchChain(c.id)} className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:border-primary/40">
                    <ChainIcon chain={c} size={18} /> {c.name}
                  </button>
                ))}
            </div>
          </div>
        ) : list.isPending ? (
          <div className="flex flex-col items-center gap-3 py-20 text-sm text-text-secondary">
            <Spinner size={32} className="text-primary" />
            Loading communities…
          </div>
        ) : list.error && !daos.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <IoCloudOfflineOutline size={52} className="mb-3 text-text-secondary" />
            <p className="mb-1 text-lg font-semibold text-text">Could not load communities</p>
            <p className="mb-5 text-sm text-text-secondary">{list.error.message}</p>
            <button type="button" onClick={() => list.refetch()} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
              <IoRefresh size={16} /> Try again
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-surface text-text-secondary">
              {hasFilters ? <IoSearchOutline size={36} /> : <IoPeopleOutline size={36} />}
            </span>
            <p className="mb-2 text-lg font-semibold text-text">{hasFilters ? "No results found" : `No communities on ${chain.name} yet`}</p>
            <p className="mb-5 max-w-sm text-sm text-text-secondary">
              {holdingOnly && !q && genre === null
                ? "You don't hold the governance token of any DAO on this chain."
                : hasFilters
                  ? "Try adjusting your search or filter — communities might be listed under a different genre."
                  : "Be the first to launch a community on this chain — it only takes a minute."}
            </p>
            {hasFilters ? (
              <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
                <IoCloseCircleOutline size={16} /> Clear filters
              </button>
            ) : (
              launchable && (
                <Link href="/daos/launch" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
                  <IoAdd size={16} /> Launch a DAO
                </Link>
              )
            )}
          </div>
        ) : grid ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((d) => (
              <DaoCard key={d.address} dao={d} grid holding={isHolding(d)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {shown.map((d) => (
              <DaoCard key={d.address} dao={d} holding={isHolding(d)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
