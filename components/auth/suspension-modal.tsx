"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SuspensionModalProps {
  reason: string | null;
  suspendedAt: string | null;
}

export function SuspensionModal({ reason, suspendedAt }: SuspensionModalProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut({
        fetchOptions: { onSuccess: () => router.push('/auth') },
      });
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-xl text-red-600">
            Account Suspended
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your access to MailPackr has been restricted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-gray-700">
          {reason && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
              {reason}
            </div>
          )}

          <p>As a result, the following actions have been taken:</p>

          <ul className="list-disc space-y-1 pl-5">
            <li>Your campaign has been cancelled immediately</li>
            <li>All scheduled and in-progress campaigns have been stopped</li>
            <li>Your account has been suspended from all features</li>
          </ul>

          <p>
            <span className="font-medium">Why does this matter?</span> High
            bounce and complaint rates damage sender reputation and can lead to
            email deliverability issues for all users on our platform.
          </p>

          <p>
            To resolve this, please contact our support team. We will review
            your account and work with you to restore access after verifying
            that your mailing lists have been cleaned.
          </p>

          {suspendedAt && (
            <p className="text-xs text-muted-foreground">
              Suspended on{" "}
              {new Date(suspendedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
