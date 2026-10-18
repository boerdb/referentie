"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type ToastAction = { label: string; onClick: () => void };

type ToastInput = {
  message: string;
  description?: string;
  kind?: ToastKind;
  action?: ToastAction;
  /** Weergaveduur in ms; fouten blijven standaard langer staan. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number; kind: ToastKind };

type ConfirmInput = {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmInput & { resolve: (ok: boolean) => void };

type ToastApi = {
  show: (toast: ToastInput) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  /** Vervangt window.confirm met een dialoog in de stijl van de app. */
  confirm: (input: ConfirmInput) => Promise<boolean>;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast vereist <ToastProvider>");
  return ctx;
}

const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const ICON_COLOR = {
  success: "text-[var(--success)]",
  error: "text-[var(--danger)]",
  info: "text-[var(--accent)]",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    const kind = toast.kind ?? "info";
    // Maximaal drie tegelijk; de oudste verdwijnt.
    setToasts((list) => [...list.slice(-2), { ...toast, id, kind }]);
  }, []);

  const confirm = useCallback(
    (input: ConfirmInput) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...input, resolve })),
    [],
  );

  const [api] = useState<ToastApi>(() => ({
    show,
    success: (message, description) => show({ message, description, kind: "success" }),
    error: (message, description) => show({ message, description, kind: "error" }),
    info: (message, description) => show({ message, description, kind: "info" }),
    confirm,
  }));

  function closeConfirm(ok: boolean) {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:items-end lg:px-5 lg:pb-5"
        aria-live="polite"
        role="region"
        aria-label="Meldingen"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
      {confirmState && (
        <ConfirmDialog state={confirmState} onClose={closeConfirm} />
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss: dismissById,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const Icon = ICON[toast.kind];
  const duration = toast.duration ?? (toast.kind === "error" || toast.action ? 6000 : 3500);
  const onDismiss = () => dismissById(toast.id);

  useEffect(() => {
    const timer = window.setTimeout(() => dismissById(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, dismissById, toast.id]);

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3 text-sm shadow-[var(--shadow-lg)]"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLOR[toast.kind])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{toast.message}</p>
        {toast.description && (
          <p className="mt-0.5 break-words text-xs text-[var(--text-muted)]">
            {toast.description}
          </p>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Melding sluiten"
        className="btn-ghost -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: (ok: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 max-lg:items-end max-lg:p-0"
      style={{ background: "var(--overlay)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-[var(--shadow-lg)] max-lg:max-w-none max-lg:rounded-b-none max-lg:rounded-t-2xl max-lg:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <h2 id="confirm-title" className="text-base font-semibold break-words">
          {state.title}
        </h2>
        {state.description && (
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{state.description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary rounded-lg px-3.5 py-2 text-sm max-lg:min-h-11 max-lg:flex-1"
            onClick={() => onClose(false)}
          >
            Annuleren
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-medium max-lg:min-h-11 max-lg:flex-1",
              state.danger ? "bg-[var(--danger)] text-white hover:opacity-90" : "btn-primary",
            )}
            onClick={() => onClose(true)}
          >
            {state.confirmLabel ?? "Doorgaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
