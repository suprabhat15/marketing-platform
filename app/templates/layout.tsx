import { Sidebar } from '@/components/layout/sidebar';

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="bg-background flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}