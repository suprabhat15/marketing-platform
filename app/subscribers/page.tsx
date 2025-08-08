import { Sidebar } from "@/components/layout/sidebar";

export default function SubscribersPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">All Subscribers</h1>
            <p className="text-muted-foreground mt-1">
              View and manage subscribers across all lists
            </p>
          </div>
          
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
            <p className="text-muted-foreground">
              Global subscriber management will be available in a future update.
              For now, manage subscribers within individual lists.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}