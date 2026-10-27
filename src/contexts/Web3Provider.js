"use client";
// contexts/Web3Provider.js — wagmi + RainbowKit, themed with the app's tokens
// (lime accent, black on lime, system font, large radii).
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/contexts/ThemeContext";
import { wagmiConfig } from "@/lib/wagmi";

const base = { borderRadius: "large", fontStack: "system", overlayBlur: "small" };

const dark = (() => {
  const t = darkTheme({ ...base, accentColor: "#d6ff00", accentColorForeground: "#000000" });
  t.colors.modalBackground = "#1c1c1c";
  t.colors.modalBorder = "rgba(255,255,255,0.08)";
  t.colors.profileForeground = "#131313";
  t.colors.closeButtonBackground = "#2a2a2a";
  return t;
})();

const light = (() => {
  const t = lightTheme({ ...base, accentColor: "#a6c705", accentColorForeground: "#000000" });
  t.colors.modalBorder = "rgba(0,0,0,0.07)";
  return t;
})();

export default function Web3Provider({ children }) {
  const { isDark } = useTheme();
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={isDark ? dark : light} modalSize="compact" appInfo={{ appName: "Sysfi" }}>
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
