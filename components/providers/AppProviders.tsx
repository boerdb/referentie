"use client";

import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { ToastProvider } from "@/components/ui/Toaster";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="referentie-theme"
    >
      <ToastProvider>{children}</ToastProvider>
      <ServiceWorkerRegistrar />
    </ThemeProvider>
  );
}
