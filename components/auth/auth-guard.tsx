"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { SuspensionModal } from "./suspension-modal";

interface AuthGuardProps {
  children: React.ReactNode;
}

interface SuspensionStatus {
  suspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

const PUBLIC_PATHS = new Set(['/auth', '/goodbye', '/unsubscribe']);

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  const [suspensionStatus, setSuspensionStatus] = useState<SuspensionStatus | null>(null);
  const [suspensionChecked, setSuspensionChecked] = useState(false);

  const checkSuspension = useCallback(async () => {
    try {
      const res = await fetch("/api/user/status");
      if (res.ok) {
        const data = await res.json();
        setSuspensionStatus(data);
      }
    } catch {
      // If check fails, don't block the user
    } finally {
      setSuspensionChecked(true);
    }
  }, []);

  useEffect(() => {
    if (isPending) {
      return;
    }

    if (session && pathname === '/auth') {
      router.push('/');
      return;
    }

    if (!session && !isPublicPath) {
      router.push('/auth');
    }
  }, [session, isPending, router, pathname, isPublicPath]);

  useEffect(() => {
    if (session && !isPublicPath) {
      setSuspensionChecked(false);
      setSuspensionStatus(null);
      checkSuspension();

      const onFocus = () => checkSuspension();
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    } else {
      setSuspensionStatus(null);
      setSuspensionChecked(true);
    }
  }, [session, isPublicPath, checkSuspension]);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isPublicPath) {
    return <>{children}</>;
  }

  if (session) {
    if (!suspensionChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (suspensionStatus?.suspended) {
      return (
        <SuspensionModal
          reason={suspensionStatus.suspendedReason}
          suspendedAt={suspensionStatus.suspendedAt}
        />
      );
    }

    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}
