import { Sidebar } from "@/components/layout/sidebar";

export default function Home() {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Welcome to MailPackr - Your email marketing platform
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
              <p className="text-gray-600">
                Click on "Campaigns" in the sidebar to manage your email campaigns.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Getting Started</h3>
              <p className="text-gray-600">
                Create your first campaign and start reaching your audience.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Analytics</h3>
              <p className="text-gray-600">
                Track your campaign performance and engagement metrics.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
