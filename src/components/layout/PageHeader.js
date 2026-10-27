"use client";
// components/layout/PageHeader.js — sticky frosted header at the top of the
// content panel: title (with optional back button) and segmented-pill tabs.
// On phones the global app header already shows the logo, so the title row
// only appears when there's a back action.
import Link from "next/link";
import { IoArrowBack } from "react-icons/io5";

export default function PageHeader({ title, subtitle, backHref, tabs, activeTab, onTabChange }) {
  return (
    <div className="z-20 border-b border-divider bg-background/80 backdrop-blur-md md:sticky md:top-0 md:border-panel-border md:bg-[var(--panel-bg-strong)] md:backdrop-blur-xl">
      {title && (
        <div className={`h-[60px] items-center gap-3 px-4 md:px-5 ${backHref ? "flex" : "hidden md:flex"}`}>
          {backHref && (
            <Link
              href={backHref}
              aria-label="Back"
              className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-text transition-colors hover:bg-hover"
            >
              <IoArrowBack size={20} />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold leading-6 tracking-[-0.3px] text-text">{title}</h1>
            {subtitle && <p className="truncate text-xs text-text-tertiary">{subtitle}</p>}
          </div>
        </div>
      )}
      {tabs && (
        // Top padding only where no title row sits above the tabs.
        <div className={`px-4 pb-3 md:px-5 ${!title ? "pt-3" : backHref ? "" : "pt-3 md:pt-0"}`}>
          <div role="tablist" className="flex gap-1 rounded-2xl bg-hover p-1">
            {tabs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTabChange?.(t.id)}
                  className={`h-9 flex-1 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-primary text-on-primary shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--primary)_70%,transparent)]"
                      : "text-text-secondary hover:text-text"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
