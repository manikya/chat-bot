"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface MetaDevConnectButtonProps {
  onConnected?: () => void;
}

export function MetaDevConnectButton({ onConnected }: MetaDevConnectButtonProps) {
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    try {
      const res = await api.channels.connectMetaDev();
      const phone = res.data?.whatsapp?.displayPhone;
      toast.success(phone ? `WhatsApp connected (${phone})` : "WhatsApp connected");
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
    <Button variant="secondary" onClick={connect} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect with dev token"}
    </Button>
  );
}
