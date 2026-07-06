"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

interface Props {
  address: string;
}

/** Full Arc wallet address with copy-to-clipboard and an ArcScan link. */
export default function CopyableAddress({ address }: Props) {
  const [copied, setCopied] = useState(false);
  const isOnChain = address.startsWith("0x") && address.length === 42;

  function copy() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="font-data text-xs text-foreground truncate flex-1">{address}</span>
      <button
        onClick={copy}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Copy address"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-agon-green" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {isOnChain && (
        <a
          href={`https://testnet.arcscan.app/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-agon-green transition-colors shrink-0"
          title="View on ArcScan"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
