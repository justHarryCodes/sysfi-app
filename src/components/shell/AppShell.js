"use client";
// components/shell/AppShell.js — signed-in frame.
//   < md : the mobile app — TwitterHeader (avatar → drawer · logo · bell),
//          frosted bottom tab bar (AppNavigator.makeTabOptions), drawer.
//   md+  : a dApp workspace — TopBar (nav, ⌘K search, network, wallet,
//          account) over three independently scrolling columns:
//          LeftRail (identity + wallet, lg+) · content panel · RightRail
//          (markets, xl+). Wide routes (nav.js WIDE_ROUTES) drop both rails
//          and let the content panel take the full width.
import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IoNotificationsOutline } from "react-icons/io5";
import { useAuth } from "@/contexts/AuthContext";
import Avatar from "@/components/ui/Avatar";
import AmbientBackdrop from "./AmbientBackdrop";
import ProfileDrawer from "./ProfileDrawer";
import TopBar from "./TopBar";
import LeftRail from "./LeftRail";
import RightRail from "./RightRail";
import { TABS, isActive, isWideRoute } from "./nav";
import { ComposeProvider } from "@/components/post/ComposeContext";
import { PersonCardProvider } from "@/components/people/PersonCard";
import { useSignInGate } from "@/hooks/useSignInGate";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { signIn } = useSignInGate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const wide = isWideRoute(pathname);

  return (
    <ComposeProvider>
      <PersonCardProvider>
        <div className="min-h-dvh bg-background md:flex md:h-dvh md:flex-col md:bg-transparent">
          <AmbientBackdrop />
          <TopBar />

          <div className="md:mx-auto md:flex md:min-h-0 md:w-full md:max-w-[1440px] md:flex-1 md:gap-5 md:px-4 md:py-5 lg:px-6">
            {!wide && <LeftRail />}

            <div className="min-w-0 md:flex md:flex-1 md:justify-center">
              <div
                id="main-panel"
                className={`md:glass-panel md:panel-scroll md:h-full md:w-full md:overflow-y-auto md:overscroll-contain md:rounded-[22px] ${
                  wide ? "md:max-w-none" : "md:max-w-[768px]"
                }`}
              >
                {/* ── Mobile header (TwitterHeader) ── */}
                <header className="sticky top-0 z-30 flex items-center justify-between border-b-[0.5px] border-divider bg-background px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] md:hidden">
                  {user ? (
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      aria-label="Open profile menu"
                      className="flex w-8 justify-center"
                    >
                      <Avatar src={user?.profileImageUrl} size={28} />
                    </button>
                  ) : (
                    <span className="w-[72px]" />
                  )}
                  <Link href={user ? "/feed" : "/"} aria-label="Sysfi home">
                    <Image src="/logo.png" alt="" width={34} height={34} />
                  </Link>
                  {user ? (
                    <button
                      type="button"
                      aria-label="Notifications"
                      className="flex w-8 justify-center text-text"
                    >
                      <IoNotificationsOutline size={24} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => signIn("/login")}
                      className="w-[72px] rounded-full bg-primary py-1.5 text-xs font-bold text-on-primary"
                    >
                      Sign in
                    </button>
                  )}
                </header>

                <main className="min-h-dvh pb-[calc(env(safe-area-inset-bottom)+90px)] md:min-h-full md:pb-8">
                  {children}
                </main>
              </div>
            </div>

            {!wide && <RightRail />}
          </div>

          {/* ── Mobile frosted tab bar ── */}
          <nav
            aria-label="Main"
            className="glass fixed inset-x-0 bottom-0 z-40 flex border-t-[0.5px] border-[var(--glass-hairline)] pb-[calc(env(safe-area-inset-bottom)+10px)] pt-[5px] md:hidden"
          >
            {TABS.map(({ href, label, Icon, ActiveIcon }) => {
              const active = isActive(pathname, href);
              const Glyph = active ? ActiveIcon : Icon;
              const isFeed = href === "/feed";
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 ${active ? "text-primary" : "text-text-tertiary"}`}
                >
                  <Glyph size={isFeed ? (active ? 26 : 24) : 22} />
                  <span className="text-xs font-semibold">{label}</span>
                </Link>
              );
            })}
          </nav>

          {user && <ProfileDrawer open={drawerOpen} onClose={closeDrawer} />}
        </div>
      </PersonCardProvider>
    </ComposeProvider>
  );
}
