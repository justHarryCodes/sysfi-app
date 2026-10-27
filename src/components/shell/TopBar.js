"use client";
// components/shell/TopBar.js — desktop/tablet header (md+), dApp-style:
//   brand · primary nav (icons → labels at xl) · More
//   search (⌘K palette) · network · wallet chip · Create · account menu
// Signed-out visitors get Sign in / Create account instead of the wallet
// cluster.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IoAdd,
  IoChevronDown,
  IoEllipsisHorizontal,
  IoLogOutOutline,
  IoMoonOutline,
  IoSearchOutline,
  IoSettingsOutline,
  IoSunnyOutline,
  IoWalletOutline,
} from "react-icons/io5";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useWallet } from "@/contexts/WalletContext";
import { useCompose } from "@/components/post/ComposeContext";
import { useSignInGate } from "@/hooks/useSignInGate";
import { usePortfolio } from "@/hooks/wallet";
import { formatAddress } from "@/lib/wallet";
import { formatUsd } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import Popover, { PopoverItem } from "@/components/ui/Popover";
import ChainSwitcher from "@/components/wallet/ChainSwitcher";
import SearchPalette from "./SearchPalette";
import { DESKTOP_NAV, MORE_GROUPS, PROFILE_ITEM, isActive, visibleItems } from "./nav";

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function WalletChip() {
  const { address } = useWallet();
  const { totalUsd, isLoading } = usePortfolio();
  if (!address) {
    return (
      <Link href="/wallet" className="flex h-10 items-center gap-2 rounded-full border border-primary/40 px-3.5 text-sm font-bold text-primary hover:bg-primary/10">
        <IoWalletOutline size={17} />
        <span className="hidden xl:inline">Set up wallet</span>
      </Link>
    );
  }
  return (
    <Link
      href="/wallet"
      title="Wallet"
      className="flex h-10 items-center gap-2 rounded-full border border-panel-border bg-hover pl-1 pr-3.5 text-sm font-semibold text-text transition-colors hover:border-primary/40"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-black">
        <IoWalletOutline size={15} />
      </span>
      <span className="hidden tabular-nums xl:inline">{isLoading ? "…" : totalUsd == null ? "—" : formatUsd(totalUsd)}</span>
      <span className="font-mono text-xs text-text-secondary">{formatAddress(address, 4)}</span>
    </Link>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useRef(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-hover"
      >
        <Avatar src={user?.profileImageUrl} size={36} className="ring-2 ring-primary/40" />
        <IoChevronDown size={13} className="text-text-tertiary" />
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} placement="bottom-end" className="w-[280px]">
        <div className="flex items-center gap-3 border-b border-panel-border px-4 pb-3 pt-1">
          <Avatar src={user?.profileImageUrl} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-text">{user?.displayName || user?.username}</span>
            <span className="block truncate text-sm text-text-tertiary">@{user?.username}</span>
          </span>
        </div>
        <div className="pt-1.5">
          <PopoverItem as={Link} href={PROFILE_ITEM.href} Icon={PROFILE_ITEM.Icon} onClick={close}>
            View profile
          </PopoverItem>
          <PopoverItem as={Link} href="/settings" Icon={IoSettingsOutline} onClick={close}>
            Settings
          </PopoverItem>
          <PopoverItem Icon={isDark ? IoSunnyOutline : IoMoonOutline} onClick={toggleTheme}>
            {isDark ? "Light mode" : "Dark mode"}
          </PopoverItem>
          <PopoverItem Icon={IoLogOutOutline} onClick={() => logout()}>
            Sign out
          </PopoverItem>
        </div>
      </Popover>
    </>
  );
}

function MoreMenu() {
  const { isExternal } = useWallet();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useRef(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        title="More"
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${open ? "bg-hover text-text" : "text-text-secondary hover:bg-hover hover:text-text"}`}
      >
        <IoEllipsisHorizontal size={18} />
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} placement="bottom-start">
        {MORE_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[1px] text-text-tertiary">{g.title}</p>
            {visibleItems(g.items, isExternal).map(({ href, label, Icon, ready }) =>
              ready ? (
                <PopoverItem key={href} as={Link} href={href} Icon={Icon} onClick={close}>
                  {label}
                </PopoverItem>
              ) : (
                <PopoverItem key={href} Icon={Icon} disabled>
                  <span className="flex-1">{label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Soon</span>
                </PopoverItem>
              ),
            )}
          </div>
        ))}
      </Popover>
    </>
  );
}

export default function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { openCompose } = useCompose();
  const { signIn, requireSignIn } = useSignInGate();
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="relative z-40 hidden shrink-0 border-b border-panel-border bg-[var(--panel-bg-strong)] backdrop-blur-xl md:block">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-4 lg:gap-3 lg:px-6">
        {/* Brand */}
        <Link href={user ? "/feed" : "/"} aria-label="Sysfi home" className="mr-1 flex shrink-0 items-center gap-2.5 lg:mr-3">
          <Image src="/logo.png" alt="" width={32} height={32} priority />
          <span className="text-brand-gradient hidden text-lg font-black tracking-[0.18em] lg:inline">SYSFI</span>
        </Link>

        {/* Primary nav */}
        <nav aria-label="Main" className="flex items-center gap-0.5 rounded-full border border-panel-border bg-hover/60 p-1">
          {DESKTOP_NAV.map(({ href, label, Icon, ActiveIcon }) => {
            const active = isActive(pathname, href);
            const Glyph = active ? ActiveIcon : Icon;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                title={label}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors xl:px-3.5 ${
                  active ? "bg-primary text-on-primary shadow-[0_4px_14px_-6px_var(--primary)]" : "text-text-secondary hover:bg-hover hover:text-text"
                }`}
              >
                <Glyph size={17} className="xl:hidden" />
                <span className="hidden xl:inline">{label}</span>
              </Link>
            );
          })}
          <MoreMenu />
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:gap-2.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="flex h-10 items-center gap-2 rounded-full border border-panel-border bg-hover px-3 text-sm text-text-tertiary transition-colors hover:border-primary/40 hover:text-text 2xl:w-56"
          >
            <IoSearchOutline size={17} />
            <span className="hidden flex-1 text-left 2xl:inline">Search</span>
            <kbd className="hidden rounded-md border border-panel-border px-1.5 font-mono text-[10px] 2xl:inline">Ctrl K</kbd>
          </button>

          {user ? (
            <>
              <span className="hidden lg:block">
                <ChainSwitcher />
              </span>
              <WalletChip />
              <button
                type="button"
                onClick={requireSignIn(() => openCompose())}
                aria-label="Create post"
                className="glow-primary flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-bold text-on-primary transition-transform hover:-translate-y-px xl:px-4"
              >
                <IoAdd size={19} />
                <span className="hidden xl:inline">Create</span>
              </button>
              <AccountMenu />
            </>
          ) : (
            <>
              <button type="button" onClick={() => signIn("/login")} className="h-10 rounded-full px-4 text-sm font-semibold text-text hover:bg-hover">
                Sign in
              </button>
              <button type="button" onClick={() => signIn("/register")} className="glow-primary h-10 rounded-full bg-primary px-4 text-sm font-bold text-on-primary">
                Create account
              </button>
            </>
          )}
        </div>
      </div>
      <SearchPalette open={searchOpen} onClose={closeSearch} />
    </header>
  );
}
