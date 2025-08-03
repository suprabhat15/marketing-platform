import { EditTemplatePage } from '@/components/templates/edit-template-page';

export default function EditTemplate({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  return <EditTemplatePage params={params} />;
}