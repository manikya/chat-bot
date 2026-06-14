"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startMetaInstagramOAuth } from "@/lib/meta-oauth";

interface MetaInstagramConnectButtonProps {
  returnPath?: string;
  disabled?: boolean;
  label?: string;
}

export function MetaInstagramConnectButton({
  returnPath,
  disabled,
  label = "Connect Instagram",
}: MetaInstagramConnectButtonProps) {
  const [loading, setLoading] = useState(false);

  const connect = () => {
    setLoading(true);
    try {
      startMetaInstagramOAuth(returnPath);
    } catch (err) {
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "Could not start Meta OAuth");
    }
  };

  return (
    <Button onClick={connect} disabled={disabled || loading} variant="default">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}
