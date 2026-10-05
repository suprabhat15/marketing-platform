import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function GoodbyePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.98_0.004_80)] p-6">
      <Card className="w-full max-w-lg border-red-100 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
            !
          </div>
          <CardTitle className="text-3xl">Account deleted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm leading-6 text-muted-foreground">
            Your MailPackr account has been permanently deleted and all active
            sessions have been signed out.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="sm:flex-1">
              <Link href="/auth">Create a new account</Link>
            </Button>
            <Button asChild variant="outline" className="sm:flex-1">
              <Link href="/auth">Back to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
