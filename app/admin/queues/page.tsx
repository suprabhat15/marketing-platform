'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Play, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Users,
  Mail,
  AlertCircle,
  ExternalLink,
  Eye,
  Filter
} from 'lucide-react';

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface QueueData {
  campaign: QueueStats;
  batch: QueueStats;
}

interface Job {
  id: string;
  name: string;
  queue: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  data: any;
  progress?: number;
  createdAt: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  attemptsMade: number;
}

// Admin emails that can access this page (should match the API route)
const ADMIN_EMAILS = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',') || [
  'subratzx007@gmail.com'
];

export default function QueuesAdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queueStats, setQueueStats] = useState<QueueData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedQueue, setSelectedQueue] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchQueueStats();
      fetchJobs();
      // Auto-refresh every 5 seconds
      const interval = setInterval(() => {
        fetchQueueStats();
        fetchJobs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const checkAdminAccess = async () => {
    try {
      const session = await authClient.getSession();
      
      if (!session?.user?.email) {
        router.push('/auth');
        return;
      }

      const userIsAdmin = ADMIN_EMAILS.includes(session.user.email);
      
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

  const fetchQueueStats = async () => {
    try {
      const response = await fetch('/api/admin/queue-stats');
      if (response.ok) {
        const data = await response.json();
        setQueueStats(data);
      }
    } catch (error) {
      console.error('Error fetching queue stats:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedQueue !== 'all') params.append('queue', selectedQueue);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      params.append('limit', '50');

      const response = await fetch(`/api/admin/queue-jobs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchQueueStats(), fetchJobs()]);
    setRefreshing(false);
  };

  // Update jobs when filters change
  useEffect(() => {
    if (isAdmin) {
      fetchJobs();
    }
  }, [selectedQueue, selectedStatus, isAdmin]);

  const retryFailedJobs = async (queueType: 'campaign' | 'batch') => {
    try {
      const response = await fetch(`/api/admin/retry-failed-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueType }),
      });
      
      if (response.ok) {
        await fetchQueueStats(); // Refresh stats after retry
      }
    } catch (error) {
      console.error('Error retrying failed jobs:', error);
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

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Queue Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor email processing queues and jobs
          </p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={refreshing}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Queue Statistics */}
      {queueStats && (
        <>
          {/* Campaign Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Campaign Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                      {queueStats.campaign.waiting} Waiting
                    </Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Play className="h-4 w-4 text-blue-600" />
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {queueStats.campaign.active} Active
                    </Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      {queueStats.campaign.completed} Completed
                    </Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <Badge variant="outline" className="bg-red-50 text-red-700">
                      {queueStats.campaign.failed} Failed
                    </Badge>
                    {queueStats.campaign.failed > 0 && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => retryFailedJobs('campaign')}
                        className="ml-2"
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Batch Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Batch Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                      {queueStats.batch.waiting} Waiting
                    </Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Play className="h-4 w-4 text-blue-600" />
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {queueStats.batch.active} Active
                    </Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      {queueStats.batch.completed} Completed
                    </Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <Badge variant="outline" className="bg-red-50 text-red-700">
                      {queueStats.batch.failed} Failed
                    </Badge>
                    {queueStats.batch.failed > 0 && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => retryFailedJobs('batch')}
                        className="ml-2"
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Recent Jobs ({jobs.length})
            </CardTitle>
            <div className="flex gap-2">
              <select 
                value={selectedQueue} 
                onChange={(e) => setSelectedQueue(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">All Queues</option>
                <option value="campaign">Campaign</option>
                <option value="batch">Batch</option>
                <option value="dlq">DLQ</option>
                <option value="batch-dlq">Batch DLQ</option>
              </select>
              <select 
                value={selectedStatus} 
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">All Status</option>
                <option value="waiting">Waiting</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No jobs found matching the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">Queue</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Progress</th>
                    <th className="text-left p-2">Created</th>
                    <th className="text-left p-2">Attempts</th>
                    <th className="text-left p-2">Campaign ID</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={`${job.queue}-${job.id}`} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{job.id?.slice(-8)}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {job.queue}
                        </Badge>
                      </td>
                      <td className="p-2">{job.name}</td>
                      <td className="p-2">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            job.status === 'completed' ? 'bg-green-50 text-green-700' :
                            job.status === 'failed' ? 'bg-red-50 text-red-700' :
                            job.status === 'active' ? 'bg-blue-50 text-blue-700' :
                            'bg-yellow-50 text-yellow-700'
                          }`}
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {job.progress !== undefined ? `${job.progress}%` : '-'}
                      </td>
                      <td className="p-2">
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                      <td className="p-2">{job.attemptsMade || 0}</td>
                      <td className="p-2 font-mono text-xs">
                        {job.data?.campaignId?.slice(-8) || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Queue Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Campaign Queue</h3>
            <p className="text-sm text-muted-foreground">
              Processes entire campaigns by breaking them into batches and queuing them for processing.
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">Batch Queue</h3>
            <p className="text-sm text-muted-foreground">
              Processes individual batches of emails with rate limiting and retry logic.
            </p>
          </div>
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              This dashboard auto-refreshes every 5 seconds. Use the Retry button to reprocess failed jobs.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}