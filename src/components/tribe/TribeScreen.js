"use client";
// Loads a tribe by route id and renders the hub header + a section.
// Sections receive the tribe and the viewer's role.
import { useParams } from "next/navigation";
import Spinner from "@/components/ui/Spinner";
import PageHeader from "@/components/layout/PageHeader";
import TribeHeader from "@/components/tribe/TribeHeader";
import { useTribeDetail, useTribeRole } from "@/hooks/tribes";

export function useRouteTribe() {
  const { id } = useParams();
  const q = useTribeDetail(id);
  const role = useTribeRole(q.data);
  return { id, tribe: q.data, role, query: q };
}

export default function TribeScreen({ children, header = true }) {
  const { tribe, role, query } = useRouteTribe();

  if (query.isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} />
      </div>
    );
  }
  if (!tribe) {
    return (
      <>
        <PageHeader title="Tribe" backHref="/tribes" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">
          {query.error?.status === 404 ? "This tribe doesn't exist or was removed." : "Couldn't load this tribe. Try again shortly."}
        </p>
      </>
    );
  }
  return (
    <>
      {header && <TribeHeader tribe={tribe} />}
      {children({ tribe, role })}
    </>
  );
}
