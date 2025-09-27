import DomainsDashboard from '@/components/domains/domains-dashboard';
import { auth } from '@/lib/auth';
import { getUserDomains } from '@/lib/domain-verification';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function DomainsPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user?.id) {
    redirect('/login');
  }

  const domains = await getUserDomains(session.user.id);

  return (
    <div className="bg-background">
        <DomainsDashboard initialDomains={domains} />
    </div>
  );
}