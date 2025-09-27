'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  BarChart3,
  Settings,
  Users,
  Mail,
  Activity,
  Shield
} from 'lucide-react';

// Admin emails that can access this page
const ADMIN_EMAILS = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',') || [
  'subratzx007@gmail.com'
];

export default function AdminDashboard() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const session = await authClient.getSession();
      
      if (!session?.data?.user?.email) {
        router.push('/auth');
        return;
      }

      setUserEmail(session.data.user.email);

      const userIsAdmin = ADMIN_EMAILS.includes(session.data.user.email);
      
      if (!userIsAdmin) {
        router.push('/');
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking admin access:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect in useEffect
  }

  const adminTools = [
    {
      title: 'Queue Dashboard',
      description: 'Monitor email processing queues and job status',
      icon: Activity,
      href: '/admin/queues',
      color: 'bg-blue-500'
    },
    {
      title: 'User Management',
      description: 'Manage user accounts and permissions',
      icon: Users,
      href: '/admin/users',
      color: 'bg-green-500',
      disabled: true
    },
    {
      title: 'System Settings',
      description: 'Configure system-wide settings and parameters',
      icon: Settings,
      href: '/admin/settings',
      color: 'bg-purple-500',
      disabled: true
    },
    {
      title: 'Analytics',
      description: 'View detailed system analytics and reports',
      icon: BarChart3,
      href: '/admin/analytics',
      color: 'bg-orange-500',
      disabled: true
    },
    {
      title: 'Email Management',
      description: 'Manage email templates and configurations',
      icon: Mail,
      href: '/admin/emails',
      color: 'bg-red-500',
      disabled: true
    },
    {
      title: 'Security',
      description: 'Security settings and audit logs',
      icon: Shield,
      href: '/admin/security',
      color: 'bg-gray-500',
      disabled: true
    }
  ];

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome, {userEmail}. Manage system settings and monitor operations.
          </p>
        </div>
        <Button onClick={() => router.push('/')} variant="outline">
          Back to App
        </Button>
      </div>

      {/* Admin Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminTools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Card 
              key={tool.title} 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                tool.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'
              }`}
              onClick={() => !tool.disabled && router.push(tool.href)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${tool.color} text-white`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{tool.title}</h3>
                    {tool.disabled && (
                      <span className="text-xs text-muted-foreground">(Coming Soon)</span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {tool.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">Online</div>
              <div className="text-sm text-muted-foreground">System Status</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">Active</div>
              <div className="text-sm text-muted-foreground">Queue Workers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">Admin</div>
              <div className="text-sm text-muted-foreground">Access Level</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}