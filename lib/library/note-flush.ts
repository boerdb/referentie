/**
 * Openstaande notitiewijzigingen die nog weggeschreven moeten worden. Bijvoorbeeld bij uitloggen,
 * vóórdat de sessie verdwijnt.
 */
const pending = new Set<() => Promise<void>>();

export function registerNoteFlush(flush: () => Promise<void>): () => void {
  pending.add(flush);
  return () => pending.delete(flush);
}

export async function flushPendingNotes(): Promise<void> {
  await Promise.all([...pending].map((flush) => flush()));
}
