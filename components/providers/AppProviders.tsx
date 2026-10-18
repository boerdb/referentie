"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { ToastProvider } from "@/components/ui/Toaster";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) =>
              count < 2 && !(error && "status" in error && error.status === 401),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="referentie-theme"
    >
      <ToastProvider>{children}</ToastProvider>
      <ServiceWorkerRegistrar />
    </ThemeProvider>
    </QueryClientProvider>
  );
}
