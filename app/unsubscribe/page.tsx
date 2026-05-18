import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; status?: string }>;
}) {
  const { confirmed, status } = await searchParams;

  let icon: string;
  let title: string;
  let message: string;
  let iconBg: string;
  let iconColor: string;

  if (confirmed === '1') {
    icon = '✓';
    title = 'Unsubscribed';
    message = "You've been successfully unsubscribed. You won't receive further emails from this list.";
    iconBg = 'bg-green-100';
    iconColor = 'text-green-700';
  } else if (status === 'already') {
    icon = '✓';
    title = 'Already unsubscribed';
    message = "You're already unsubscribed from this list. No changes have been made.";
    iconBg = 'bg-gray-100';
    iconColor = 'text-gray-600';
  } else {
    icon = '!';
    title = 'Invalid link';
    message = 'This unsubscribe link is invalid or has already been used.';
    iconBg = 'bg-red-100';
    iconColor = 'text-red-700';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.98_0.004_80)] p-6">
      <Card className="w-full max-w-lg shadow-sm">
        <CardHeader className="space-y-3">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${iconBg} ${iconColor} text-lg font-bold`}>
            {icon}
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
