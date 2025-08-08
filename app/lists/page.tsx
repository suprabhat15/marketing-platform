import { Sidebar } from "@/components/layout/sidebar";
import { ListsDashboard } from '@/components/lists/lists-dashboard';

export default function ListsPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <ListsDashboard />
      </main>
    </div>
  );
}