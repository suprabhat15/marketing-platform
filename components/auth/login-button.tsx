"use client";

import { signIn, signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginButton() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <Button disabled>Loading...</Button>;
  }

  if (session) {
    return (
      <div className="flex items-center gap-4">
        <span>Welcome, {session.user.name}</span>
        <Button onClick={() => signOut()}>Sign Out</Button>
      </div>
    );
  }

  return null;
}