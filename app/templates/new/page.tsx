import { Suspense } from 'react';
import { NewTemplatePage } from '@/components/templates/new-template-page';

export default function CreateTemplatePage() {
  return (
    <Suspense>
      <NewTemplatePage />
    </Suspense>
  );
}
