"use client";
// contexts/ChainContext.js — port of crypto-wallet/contexts/ChainContext.js.
// Every chain in lib/chains.js is selectable (testnets outside production
// only); the active chain drives wallet, trade and DAOs. The choice persists
// in IndexedDB.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CHAIN_LIST, DEFAULT_CHAIN, getChainById } from "@/lib/config";
import { kvGet, kvSet } from "@/lib/cache/idb";

const ChainContext = createContext(null);
const KEY = "activeChainId";

export function ChainProvider({ children }) {
  const [activeChain, setActiveChain] = useState(DEFAULT_CHAIN);

  useEffect(() => {
    kvGet(KEY).then((id) => {
      const chain = getChainById(id);
      if (chain) setActiveChain(chain);
    });
  }, []);

  const switchChain = useCallback((id) => {
    const chain = getChainById(id);
    if (!chain) throw new Error(`Chain ${id} is not available`);
    setActiveChain(chain);
    kvSet(KEY, chain.id);
  }, []);

  return (
    <ChainContext.Provider value={{ activeChain, chains: CHAIN_LIST, switchChain, canSwitch: CHAIN_LIST.length > 1 }}>
      {children}
    </ChainContext.Provider>
  );
}

export const useChain = () => {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used within ChainProvider");
  return ctx;
};
