"use client";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { listenForCrossTabInvalidation, makeQueryClient, scheduleCacheMaintenance } from "@/lib/cache/queryClient";

export function QueryProvider({ children }) {
  const [client] = useState(makeQueryClient);

  useEffect(() => {
    scheduleCacheMaintenance();
    return listenForCrossTabInvalidation(client);
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
