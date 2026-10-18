/**
 * Verwijdert de offline-cache van de service worker. Die bevat de HTML van
 * /bibliotheek met naam en e-mail; na uitloggen mag die niet op het toestel blijven.
 */
export async function clearOfflineCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    /* geen toegang tot CacheStorage (privévenster) */
  }
}
