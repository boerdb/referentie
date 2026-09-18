"use client";

import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="referentie-theme"
    >
      {children}
      <ServiceWorkerRegistrar />
    </ThemeProvider>
  );
}
