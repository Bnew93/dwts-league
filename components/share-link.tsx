"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { inviteMessage } from "@/lib/brand";

/**
 * Invite link with a large Copy button and, where `navigator.share` exists (mostly phones), a
 * Share… button that opens the native sheet. Desktop shows copy only — never a dead Share button.
 */
export function ShareLink({ leagueName, url }: { leagueName: string; url: string }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState<"url" | "msg" | null>(null);
  const message = inviteMessage(leagueName, url);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copy(text: string, which: "url" | "msg") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy this link", text);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: leagueName, text: message });
    } catch {
      // user dismissed the sheet
    }
  }

  return (
    <div className="mt-4">
      <div className="rounded-lg border hairline bg-plum-950/60 px-3 py-2.5 font-mono text-xs text-silver-100 [overflow-wrap:anywhere]">{url}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button onClick={() => copy(url, "url")} className="btn-gold py-3 text-base">
          {copied === "url" ? <Check size={18} /> : <Copy size={18} />} {copied === "url" ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button onClick={share} className="btn-ghost py-3 text-base">
            <Share2 size={18} /> Share…
          </button>
        )}
      </div>
      <div className="mt-4 rounded-lg border border-dashed hairline p-3 text-sm text-silver-300 [overflow-wrap:anywhere]">
        {message}
        <button onClick={() => copy(message, "msg")} className="mt-2 block text-xs text-gold-300 underline decoration-gold-400/40">
          {copied === "msg" ? "Copied" : "Copy message"}
        </button>
      </div>
    </div>
  );
}
