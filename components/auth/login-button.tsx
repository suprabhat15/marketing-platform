"use client";

import { useState } from "react";
import { deleteUser, signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, MoreHorizontal, Trash2 } from "lucide-react";

export function LoginButton() {
  const { data: session, isPending } = useSession();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteMessage('');

    try {
      const result = await deleteUser({
        callbackURL: '/goodbye',
      });

      if (result.error) {
        setDeleteMessage(
          result.error.message || 'Failed to start account deletion.'
        );
        return;
      }

      setDeleteMessage(
        'Check your email for the deletion link. Open it from this signed-in browser to finish deleting your account.'
      );
    } catch {
      setDeleteMessage('Failed to start account deletion.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isPending) {
    return <Button disabled>Loading...</Button>;
  }

  if (session) {
    const emailPreview = `${session.user.email.slice(0, 15)}...`;

    return (
      <div className="space-y-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full cursor-pointer justify-between px-3 text-sidebar-foreground"
            >
              <span className="truncate text-sm font-medium">{emailPreview}</span>
              <MoreHorizontal className="h-4 w-4 shrink-0" />
              <span className="sr-only">Open account menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                We&apos;ll email a confirmation link to {session.user.email}.
                Open that link from this signed-in browser to permanently
                delete your MailPackr account and related data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={handleDeleteAccount}
              >
                {isDeleting ? 'Sending email...' : 'Send deletion email'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {deleteMessage ? (
          <p className="text-xs text-muted-foreground">{deleteMessage}</p>
        ) : null}
      </div>
    );
  }

  return null;
}
