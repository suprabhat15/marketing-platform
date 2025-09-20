'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Trash2,
  Users,
  UserPlus,
  UserMinus,
  UserX,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { CreateListDialog } from './create-list-dialog';

interface List {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    subscribers: number;
  };
  subscribers?: {
    status: 'ACTIVE' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED';
  }[];
}

interface ListStats {
  subscribed: number;
  unsubscribed: number;
  bounced: number;
  total: number;
}

export function ListsDashboard() {
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    try {
      const response = await fetch('/api/lists');
      if (response.ok) {
        const data = await response.json();
        setLists(data.lists);
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    try {
      const response = await fetch(`/api/lists/${listId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setLists((prevLists) => prevLists.filter((list) => list.id !== listId));
      }
    } catch (error) {
      console.error('Error deleting list:', error);
    }
  };

  const calculateListStats = (list: List): ListStats => {
    if (!list.subscribers) {
      return { subscribed: 0, unsubscribed: 0, bounced: 0, total: 0 };
    }

    const stats = list.subscribers.reduce(
      (acc, subscriber) => {
        acc.total++;
        switch (subscriber.status) {
          case 'ACTIVE':
            acc.subscribed++;
            break;
          case 'UNSUBSCRIBED':
            acc.unsubscribed++;
            break;
          case 'BOUNCED':
          case 'COMPLAINED':
            acc.bounced++;
            break;
        }
        return acc;
      },
      { subscribed: 0, unsubscribed: 0, bounced: 0, total: 0 }
    );

    return stats;
  };

  const handleListCreated = () => {
    fetchLists();
    setCreateDialogOpen(false);
  };

  const handleViewList = (listId: string) => {
    router.push(`/lists/${listId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Lists</h1>
          <p className="text-muted-foreground">
            Manage your subscriber lists and organize your contacts
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New List
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Lists</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lists.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {lists.reduce((acc, list) => acc + (list._count?.subscribers || 0), 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscribers</CardTitle>
            <UserMinus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {lists.reduce((acc, list) => {
                if (!list.subscribers) return acc;
                return acc + list.subscribers.filter(s => s.status === 'ACTIVE').length;
              }, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounced</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {lists.reduce((acc, list) => {
                if (!list.subscribers) return acc;
                return acc + list.subscribers.filter(s => s.status === 'BOUNCED' || s.status === 'COMPLAINED').length;
              }, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lists Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Lists ({lists.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {lists.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-medium text-foreground">No lists</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Get started by creating your first subscriber list.
                </p>
                <div className="mt-6">
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New List
                  </Button>
                </div>
              </div>
            ) : (
              lists.map((list) => {
                const stats = calculateListStats(list);
                return (
                  <div
                    key={list.id}
                    className="hover:bg-accent flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors"
                    onClick={() => handleViewList(list.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-foreground text-base font-semibold">
                            {list.name}
                          </h3>
                          {list.description && (
                            <p className="text-muted-foreground mt-1 text-sm">
                              {list.description}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-xs text-green-800"
                              >
                                {list._count?.subscribers || 0} Total
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="bg-blue-100 text-xs text-blue-800"
                              >
                                {stats.subscribed} Active
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="text-muted-foreground text-right text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Created{' '}
                            {formatDistanceToNow(new Date(list.createdAt), {
                              addSuffix: true,
                            })}
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Updated{' '}
                            {formatDistanceToNow(new Date(list.updatedAt), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex items-center gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            title="Delete List"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will
                              permanently delete the list &quot;{list.name}
                              &quot; and all its subscribers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteList(list.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete List
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <ChevronRight className="text-muted-foreground h-4 w-4" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateListDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onListCreated={handleListCreated}
      />
    </div>
  );
}