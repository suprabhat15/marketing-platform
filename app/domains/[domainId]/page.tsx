'use client';

import DomainDetail from '@/components/domains/domain-detail';
import { useParams } from 'next/navigation';

export default function DomainDetailPage() {
  const params = useParams();
  const domainId = params.domainId as string;

  return <DomainDetail domainId={domainId} />;
}