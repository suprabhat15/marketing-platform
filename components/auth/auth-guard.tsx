"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't redirect while loading
    if (isPending) {
      return;
    }

    // If user is authenticated and on auth page, redirect to dashboard
    // if (session && pathname === "/auth") {
    //   router.push("/");
    //   return;
    // }

    // If user is not authenticated and not on auth page, redirect to auth
    // if (!session && pathname !== "/auth") {
    //   router.push("/auth");
    // }
  }, [session, isPending, router, pathname]);

  // Show loading spinner while checking authentication
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If on auth page, always show children
  if (pathname === "/auth") {
    return <>{children}</>;
  }

  // If authenticated, show children
  if (!session) {
    return <>{children}</>;
  }

  // If not authenticated and not on auth page, show loading (will redirect)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}