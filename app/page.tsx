import { Sidebar } from "@/components/layout/sidebar";

export default function Home() {
  return (
    <div className="bg-background flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-foreground text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome to MailPackr - Your email marketing platform
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="bg-card border-border rounded-lg border p-6 shadow">
              <h3 className="text-card-foreground mb-2 text-lg font-semibold">
                Quick Actions
              </h3>
              <p className="text-muted-foreground">
                Click on "Campaigns" in the sidebar to manage your email
                campaigns.
              </p>
            </div>

            <div className="bg-card border-border rounded-lg border p-6 shadow">
              <h3 className="text-card-foreground mb-2 text-lg font-semibold">
                Getting Started
              </h3>
              <p className="text-muted-foreground">
                Create your first campaign and start reaching your audience.
              </p>
            </div>

            <div className="bg-card border-border rounded-lg border p-6 shadow">
              <h3 className="text-card-foreground mb-2 text-lg font-semibold">
                Analytics
              </h3>
              <p className="text-muted-foreground">
                Track your campaign performance and engagement metrics.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
