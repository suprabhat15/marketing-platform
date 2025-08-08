'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import {
  Search,
  Plus,
  MoreHorizontal,
  Download,
  Upload,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { z } from 'zod';

const subscriberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  status: z.enum(['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED']),
  createdAt: z.string(),
});

type Subscriber = z.infer<typeof subscriberSchema>;

interface PaginatedResponse {
  subscribers: Subscriber[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
    hasPrevious: boolean;
  };
}

interface SubscriberListProps {
  listId: string;
}

export function SubscriberList({ listId }: SubscriberListProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
    hasPrevious: false,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSubscriber, setNewSubscriber] = useState({
    email: '',
    firstName: '',
    lastName: '',
    status: 'ACTIVE' as const,
  });

  const fetchSubscribers = useCallback(
    async (page: number = 1, search: string = '', status: string = 'all') => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '25',
        });

        if (search.trim()) {
          params.set('search', search.trim());
        }

        if (status && status !== 'all') {
          params.set('status', status);
        }

        const response = await fetch(
          `/api/lists/${listId}/subscribers?${params}`
        );
        if (response.ok) {
          const data: PaginatedResponse = await response.json();
          setSubscribers(data.subscribers);
          setPagination(data.pagination);
        }
      } catch (error) {
        console.error('Error fetching subscribers:', error);
      } finally {
        setLoading(false);
      }
    },
    [listId]
  );

  useEffect(() => {
    fetchSubscribers(1, searchTerm, statusFilter);
  }, [fetchSubscribers, searchTerm, statusFilter]);

  const handlePageChange = (page: number) => {
    fetchSubscribers(page, searchTerm, statusFilter);
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
  }, []);

  const getStatusBadge = (status: string) => {
    const variants = {
      ACTIVE: 'bg-green-100 text-green-800',
      UNSUBSCRIBED: 'bg-gray-100 text-gray-800',
      BOUNCED: 'bg-red-100 text-red-800',
      COMPLAINED: 'bg-orange-100 text-orange-800',
    };

    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {status.toLowerCase()}
      </Badge>
    );
  };

  const handleAddSubscriber = async () => {
    if (newSubscriber.email) {
      try {
        const response = await fetch(`/api/lists/${listId}/subscribers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscribers: [newSubscriber] }),
        });

        if (response.ok) {
          setNewSubscriber({
            email: '',
            firstName: '',
            lastName: '',
            status: 'ACTIVE',
          });
          setShowAddDialog(false);
          fetchSubscribers(pagination.page, searchTerm, statusFilter);
        }
      } catch (error) {
        console.error('Error adding subscriber:', error);
      }
    }
  };

  const handleUpdateSubscriber = async (
    id: string,
    updates: Partial<Subscriber>
  ) => {
    try {
      const response = await fetch(`/api/lists/${listId}/subscribers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        fetchSubscribers(pagination.page, searchTerm, statusFilter);
      }
    } catch (error) {
      console.error('Error updating subscriber:', error);
    }
  };

  const handleDeleteSubscriber = async (id: string) => {
    try {
      const response = await fetch(`/api/lists/${listId}/subscribers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchSubscribers(pagination.page, searchTerm, statusFilter);
      }
    } catch (error) {
      console.error('Error deleting subscriber:', error);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // This would integrate with the import dialog we created earlier
      console.log('File import:', file);
    }
  };

  const handleExportCsv = () => {
    // Export functionality
    console.log('Export CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Subscribers</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            className="flex items-center gap-2"
            disabled={loading}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => document.getElementById('csv-import')?.click()}
            className="flex items-center gap-2"
            disabled={loading}
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Add Subscriber
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Subscriber</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newSubscriber.email}
                    onChange={(e) =>
                      setNewSubscriber((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="subscriber@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={newSubscriber.firstName}
                    onChange={(e) =>
                      setNewSubscriber((prev) => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                    placeholder="John"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={newSubscriber.lastName}
                    onChange={(e) =>
                      setNewSubscriber((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newSubscriber.status}
                    onValueChange={(value) =>
                      setNewSubscriber((prev) => ({
                        ...prev,
                        status: value as 'ACTIVE',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddSubscriber} className="w-full">
                  Add Subscriber
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <input
        id="csv-import"
        type="file"
        accept=".csv"
        onChange={handleFileImport}
        className="hidden"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                pagination.totalCount
              )}
            </div>
            <p className="text-muted-foreground text-xs">Total Subscribers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                subscribers.filter((s) => s.status === 'ACTIVE').length
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Active (Current Page)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-600">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                subscribers.filter((s) => s.status === 'UNSUBSCRIBED').length
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Unsubscribed (Current Page)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                subscribers.filter(
                  (s) => s.status === 'BOUNCED' || s.status === 'COMPLAINED'
                ).length
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Issues (Current Page)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Subscriber List</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
                <Input
                  placeholder="Search subscribers..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-8"
                  disabled={loading}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={handleStatusFilterChange}
                disabled={loading}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
                  <SelectItem value="BOUNCED">Bounced</SelectItem>
                  <SelectItem value="COMPLAINED">Complained</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="text-muted-foreground mt-2">
                      Loading subscribers...
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                subscribers.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell className="font-medium">
                      {subscriber.email}
                    </TableCell>
                    <TableCell>
                      {subscriber.firstName || subscriber.lastName
                        ? `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim()
                        : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(subscriber.status)}</TableCell>
                    <TableCell>
                      {new Date(subscriber.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateSubscriber(subscriber.id, {
                                status:
                                  subscriber.status === 'ACTIVE'
                                    ? 'UNSUBSCRIBED'
                                    : 'ACTIVE',
                              })
                            }
                          >
                            {subscriber.status === 'ACTIVE'
                              ? 'Unsubscribe'
                              : 'Resubscribe'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleDeleteSubscriber(subscriber.id)
                            }
                            className="text-red-600"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!loading && subscribers.length === 0 && (
            <div className="text-muted-foreground py-8 text-center">
              {searchTerm || statusFilter !== 'all'
                ? 'No subscribers match your filters'
                : 'No subscribers yet. Add some subscribers to get started.'}
            </div>
          )}

          {/* Pagination */}
          {!loading && pagination.totalPages > 1 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={handlePageChange}
              totalCount={pagination.totalCount}
              itemsPerPage={pagination.limit}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}