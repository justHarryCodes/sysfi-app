"use client";
// components/shell/ProfileDrawer.js — port of ProfileDrawerContent (community
// mode): glass panel, avatar + name + address pill, grouped menu, dark-mode
// switch, sign out.
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IoChevronForward,
  IoMoonOutline,
  IoSunnyOutline,
  IoLogOutOutline,
  IoWalletOutline,
  IoGridOutline,
  IoClose,
} from "react-icons/io5";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/contexts/ThemeContext";
import { formatAddress } from "@/lib/wallet";
import Avatar from "@/components/ui/Avatar";
import { DRAWER_GROUPS, visibleItems } from "./nav";

export default function ProfileDrawer({ open, onClose }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { wallet, isExternal } = useWallet();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        className={`absolute inset-y-0 left-0 flex w-[78%] max-w-[340px] flex-col overflow-hidden border-r border-border transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)", backdropFilter: "blur(30px)" }}
      >
        {/* Profile card */}
        <div className="border-b border-border px-4 pb-4 pt-[calc(env(safe-area-inset-top)+18px)]" style={{ background: "var(--glass-sheen)" }}>
          <div className="flex items-center gap-[18px]">
            <div className="relative">
              <Avatar src={user?.profileImageUrl} size={52} className="border-2 border-primary" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-md font-bold text-text">{user?.displayName || user?.username || "Nexus User"}</p>
              {user?.username && <p className="truncate text-xs text-text-secondary">@{user.username}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {wallet?.address && (
                  <span className="inline-flex items-center gap-[3px] rounded-full bg-primary/10 px-[7px] py-[3px] text-[10px] font-semibold text-primary">
                    <IoWalletOutline size={10} />
                    {formatAddress(wallet.address, 4)}
                  </span>
                )}
                <span className="inline-flex items-center gap-[3px] rounded-full bg-info/10 px-[7px] py-[3px] text-[10px] font-bold text-info">
                  <IoGridOutline size={10} />
                  Community
                </span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close menu" className="self-start text-text-secondary hover:text-text">
              <IoClose size={22} />
            </button>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto pb-6">
          {DRAWER_GROUPS.map((g) => (
            <div key={g.title} className="px-4 pt-4">
              <p className="mb-0.5 px-0.5 text-[10px] font-bold uppercase tracking-[1px] text-text-tertiary">{g.title}</p>
              {visibleItems(g.items, isExternal).map(({ href, label, Icon, ready, tint }) =>
                ready ? (
                  <Link key={href} href={href} className="flex items-center px-0.5 py-[9px] hover:opacity-80">
                    <Icon size={18} className={`mr-2.5 w-[22px] ${tint || "text-text-secondary"}`} />
                    <span className="flex-1 truncate text-[17px] font-medium text-text">{label}</span>
                    <IoChevronForward size={14} className="text-text-tertiary" />
                  </Link>
                ) : (
                  <div key={href} className="flex items-center px-0.5 py-[9px] opacity-50" aria-disabled>
                    <Icon size={18} className={`mr-2.5 w-[22px] ${tint || "text-text-secondary"}`} />
                    <span className="flex-1 truncate text-[17px] font-medium text-text">{label}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Soon</span>
                  </div>
                ),
              )}
            </div>
          ))}

          <div className="px-4 pt-4">
            <p className="mb-0.5 px-0.5 text-[10px] font-bold uppercase tracking-[1px] text-text-tertiary">Appearance</p>
            <button type="button" role="switch" aria-checked={isDark} onClick={toggleTheme} className="flex w-full items-center px-0.5 py-[9px]">
              {isDark ? (
                <IoMoonOutline size={18} className="mr-2.5 w-[22px] text-text-secondary" />
              ) : (
                <IoSunnyOutline size={18} className="mr-2.5 w-[22px] text-text-secondary" />
              )}
              <span className="flex-1 text-left text-[17px] font-medium text-text">Dark Mode</span>
              <span className={`relative h-[26px] w-[46px] rounded-full transition-colors ${isDark ? "bg-primary/40" : "bg-border"}`}>
                <span
                  className={`absolute top-[3px] h-5 w-5 rounded-full transition-all ${isDark ? "left-[23px] bg-primary" : "left-[3px] bg-text-tertiary"}`}
                />
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="mx-4 mt-4 flex w-[calc(100%-32px)] items-center justify-center gap-1 rounded-[10px] border border-error/20 bg-error/[0.03] px-4 py-[11px] text-[17px] font-semibold text-error"
          >
            <IoLogOutOutline size={17} />
            Sign Out
          </button>
        </nav>
      </aside>
    </div>
  );
}
