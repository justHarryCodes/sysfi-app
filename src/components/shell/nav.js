// components/shell/nav.js — community-mode tabs from AppNavigator.CommunityTabs
// and the drawer menu from ProfileDrawerContent.CommunityMenu. `ready: false`
// entries are screens scheduled for a later phase; they render as "Soon".
import {
  IoFlame,
  IoFlameOutline,
  IoPeople,
  IoPeopleOutline,
  IoGrid,
  IoGridOutline,
  IoWallet,
  IoWalletOutline,
  IoPersonCircleOutline,
  IoCreateOutline,
  IoRepeat,
  IoRepeatOutline,
  IoCompassOutline,
  IoCompass,
  IoLayersOutline,
  IoImageOutline,
  IoGiftOutline,
  IoHelpCircleOutline,
  IoChatbubbleOutline,
  IoTimeOutline,
  IoKeyOutline,
  IoSettingsOutline,
  IoCodeSlashOutline,
  IoFlaskOutline,
  IoBookOutline,
} from "react-icons/io5";

export const TABS = [
  { href: "/feed", label: "Feed", Icon: IoFlameOutline, ActiveIcon: IoFlame },
  { href: "/tribes", label: "Tribes", Icon: IoPeopleOutline, ActiveIcon: IoPeople },
  { href: "/daos", label: "DAOs", Icon: IoGridOutline, ActiveIcon: IoGrid },
  { href: "/explore", label: "Explore", Icon: IoCompassOutline, ActiveIcon: IoCompass },
  { href: "/wallet", label: "Wallet", Icon: IoWalletOutline, ActiveIcon: IoWallet },
];

/** Desktop top-bar destinations: the tabs plus Trade, which on phones lives in the drawer. */
export const DESKTOP_NAV = [...TABS.slice(0, 4), { href: "/swap", label: "Trade", Icon: IoRepeatOutline, ActiveIcon: IoRepeat }, TABS[4]];

const ACCOUNT_GROUP = {
  title: "Account",
  items: [
    { href: "/profile", label: "My Profile", Icon: IoPersonCircleOutline, ready: true },
    { href: "/profile/edit", label: "Edit Profile", Icon: IoCreateOutline, ready: true },
    { href: "/settings", label: "Settings", Icon: IoSettingsOutline, ready: true },
  ],
};

/** Everything that isn't a main tab — shown in the mobile drawer and desktop "More". */
export const MORE_GROUPS = [
  {
    title: "Tools",
    items: [
      { href: "/swap", label: "Trade", Icon: IoRepeatOutline, ready: true },
      { href: "/wallet/assets", label: "Tokens", Icon: IoLayersOutline, ready: true },
      { href: "/wallet/nfts", label: "NFTs", Icon: IoImageOutline, ready: true },
      { href: "/wallet/activity", label: "Activity", Icon: IoTimeOutline, ready: true },
      // Tribe-wallet only — wallet-signed accounts keep their keys in their own wallet app.
      { href: "/wallet/recovery-phrase", label: "Backup Phrase", Icon: IoKeyOutline, ready: true, tint: "text-warning", tribeWalletOnly: true },
    ],
  },
  {
    title: "Build",
    items: [
      { href: "/developers", label: "Developers", Icon: IoCodeSlashOutline, ready: true },
      { href: "/developers/docs", label: "API reference", Icon: IoBookOutline, ready: true },
      { href: "/explore/dev", label: "Developer preview", Icon: IoFlaskOutline, ready: true },
    ],
  },
  {
    title: "Community",
    items: [{ href: "/refer", label: "Refer Friends", Icon: IoGiftOutline, ready: false, tint: "text-primary" }],
  },
  {
    title: "Support",
    items: [
      { href: "/support", label: "Help Center", Icon: IoHelpCircleOutline, ready: false },
      { href: "/support/chat", label: "Live Chat", Icon: IoChatbubbleOutline, ready: false },
    ],
  },
];

export const DRAWER_GROUPS = [ACCOUNT_GROUP, ...MORE_GROUPS];

export const PROFILE_ITEM = ACCOUNT_GROUP.items[0];

/** Menu items applicable to this account type. */
export const visibleItems = (items, isExternal) => items.filter((i) => !(i.tribeWalletOnly && isExternal));

export const isActive = (pathname, href) => pathname === href || pathname.startsWith(href + "/");

/**
 * Pages that use the full desktop width (content panel stretches, both side
 * rails hide): data-dense screens — charts, tables, grids. Feed-style
 * reading pages keep the focused column. Add prefixes as pages need it.
 */
export const WIDE_ROUTES = ["/swap", "/wallet/assets", "/wallet/activity", "/wallet/token", "/wallet/nfts", "/wallet/nft", "/daos", "/explore", "/developers", "/tribe", "/messages"];

export const isWideRoute = (pathname) => WIDE_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
