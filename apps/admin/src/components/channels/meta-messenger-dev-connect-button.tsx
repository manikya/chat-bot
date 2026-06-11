"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function MetaMessengerDevConnectButton({ onConnected }: { onConnected?: () => void }) {
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    try {
      await api.channels.connectMessengerDev();
      toast.success("Messenger connected (dev credentials)");
      onConnected?.();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Dev connect failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={connect} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect Messenger (dev token)"}
    </Button>
  );
}
