"use client";
// Tribes — port of TribeListScreen: your tribes (pinned first), search, create.
import { useMemo } from "react";
import Link from "next/link";
import { IoAdd, IoPeopleOutline, IoSearch, IoSearchOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import TribeRow, { TribeRowSkeleton } from "@/components/tribe/TribeRow";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useMyTribes, useTribePins } from "@/hooks/tribes";
import { useTopTribes } from "@/hooks/queries";
import VisitorBanner from "@/components/feed/VisitorBanner";
import { tribeOwner } from "@/lib/tribeApi";

/** Signed out: popular public tribes. */
function PopularTribes() {
  const q = useTopTribes(30);
  return (
    <>
      <PageHeader title="Tribes" subtitle="Popular communities" />
      <VisitorBanner body="Sign in to join tribes, chat with members and start your own." />
      <div className="px-4 pb-3">
        <Link href="/tribes/search" className="flex h-11 items-center gap-2 rounded-2xl bg-hover px-4 text-sm text-text-tertiary hover:text-text-secondary">
          <IoSearchOutline size={18} /> Find tribes
        </Link>
      </div>
      {q.isPending ? Array.from({ length: 6 }, (_, i) => <TribeRowSkeleton key={i} />) : (q.data || []).map((t) => <TribeRow key={t.id} tribe={t} />)}
    </>
  );
}

export default function TribesPage() {
  const { user } = useAuth();
  if (!user) return <PopularTribes />;
  return <MyTribes user={user} />;
}

function MyTribes({ user }) {
  const q = useMyTribes();
  const { pins, toggle } = useTribePins();

  const tribes = useMemo(() => {
    const list = q.data || [];
    return [...list].sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)));
  }, [q.data, pins]);

  return (
    <>
      <PageHeader title="Tribes" subtitle={q.isFetching && q.data ? "Syncing…" : undefined} />
      <div className="flex items-center gap-2 px-4 py-3">
        <Link
          href="/tribes/search"
          className="flex h-11 flex-1 items-center gap-2 rounded-2xl bg-hover px-4 text-sm text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <IoSearchOutline size={18} /> Find tribes
        </Link>
        <Link
          href="/tribes/create"
          aria-label="Create tribe"
          className="glow-primary flex h-11 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-bold text-on-primary"
        >
          <IoAdd size={18} /> <span className="hidden sm:inline">Create</span>
        </Link>
      </div>

      {q.isPending ? (
        Array.from({ length: 6 }, (_, i) => <TribeRowSkeleton key={i} />)
      ) : q.isError && !q.data ? (
        <div className="px-4 py-16 text-center">
          <p className="mb-4 text-sm text-text-secondary">Couldn&apos;t load your tribes.</p>
          <Button title="Try again" size="small" onClick={() => q.refetch()} />
        </div>
      ) : tribes.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IoPeopleOutline size={48} />
          </span>
          <p className="mb-1 text-lg font-bold text-text">No Tribes Yet</p>
          <p className="mb-6 text-sm text-text-secondary">Join a community or start your own</p>
          <div className="flex gap-3">
            <Button as={Link} href="/tribes/search" title="Browse Tribes" icon={<IoSearch size={16} />} size="small" className="rounded-full" />
            <Button as={Link} href="/tribes/create" title="Create Tribe" icon={<IoAdd size={16} />} variant="outline" size="small" className="rounded-full" />
          </div>
        </div>
      ) : (
        <div>
          {tribes.map((t) => (
            <TribeRow key={t.id} tribe={t} isOwner={tribeOwner(t) === user?.uid} pinned={pins.includes(t.id)} onTogglePin={() => toggle(t.id)} />
          ))}
          {q.isFetching && (
            <div className="flex justify-center py-3">
              <Spinner size={16} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
