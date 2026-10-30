"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type State, WagmiProvider } from "wagmi";
import { makeWagmiConfig } from "@/lib/wagmi";

export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [config] = useState(makeWagmiConfig);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 4_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
