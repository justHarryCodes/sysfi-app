"use client";
// Provider order mirrors crypto-wallet/App.js (Theme → Alert/Loading → Auth →
// Wallet), with the query cache above Auth so sign-out can wipe it.
import { ThemeProvider } from "@/contexts/ThemeContext";
import { QueryProvider } from "@/contexts/QueryProvider";
import { FeedbackProvider } from "@/contexts/FeedbackContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WalletRoot } from "@/contexts/WalletContext";
import { ChainProvider } from "@/contexts/ChainContext";
import Web3Provider from "@/contexts/Web3Provider";
import FlowGate from "@/components/flow/FlowGate";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <Web3Provider>
          <FeedbackProvider>
            <AuthProvider>
              <ChainProvider>
                <WalletRoot>
                  <FlowGate>{children}</FlowGate>
                </WalletRoot>
              </ChainProvider>
            </AuthProvider>
          </FeedbackProvider>
        </Web3Provider>
      </QueryProvider>
    </ThemeProvider>
  );
}
