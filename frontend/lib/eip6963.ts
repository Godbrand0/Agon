"use client";

import type { EIP1193Provider } from "viem";

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string; // data: URI
  rdns: string; // reverse-DNS id, e.g. "io.metamask" — stable across sessions
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail;
}

/**
 * Discover every wallet extension installed in the browser via EIP-6963
 * (Multi Injected Provider Discovery). Without this, dapps read `window.ethereum`
 * directly — which only ever exposes ONE wallet (whichever extension won the
 * race to inject it, or a proxy that silently picks for the user). EIP-6963
 * lets each wallet announce itself so the user can choose.
 *
 * Returns an unsubscribe function. Call it after a short window (a few
 * hundred ms) — wallets respond to the request event near-synchronously.
 */
export function discoverProviders(onFound: (detail: EIP6963ProviderDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const seen = new Set<string>();
  const handler = (event: Event) => {
    const detail = (event as EIP6963AnnounceProviderEvent).detail;
    if (!detail?.info?.uuid || seen.has(detail.info.uuid)) return;
    seen.add(detail.info.uuid);
    onFound(detail);
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  return () => window.removeEventListener("eip6963:announceProvider", handler);
}
