'use client';

import { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { Textarea } from '@/components/ui/textarea';

// Lazy load heavy components
const ImportSubscribersDialog = lazy(() => import('@/components/lists/import-subscribers-dialog').then(module => ({ default: module.ImportSubscribersDialog })));
import { 
  Search, 
  MoreHorizontal, 
  Download, 
  Upload, 
  UserPlus, 
  Loader2,
  ArrowLeft,
  Mail,
  Users,
  Check,
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

const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  _count: z.object({
    subscribers: z.number(),
  }).optional(),
});

type Subscriber = z.infer<typeof subscriberSchema>;
type List = z.infer<typeof listSchema>;

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

export default function ListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listId = params.id as string;

  const [list, setList] = useState<List | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
    hasPrevious: false,
  });
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editListData, setEditListData] = useState({ name: '', description: '' });
  const [originalListData, setOriginalListData] = useState({ name: '', description: '' });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [newSubscriber, setNewSubscriber] = useState({
    email: '',
    firstName: '',
    lastName: '',
    status: 'ACTIVE' as const,
  });
  
  // Ref for batching/debouncing
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const response = await fetch(`/api/lists/${listId}`);
      if (response.ok) {
        const data = await response.json();
        setList(data);
        const listData = { name: data.name, description: data.description || '' };
        setEditListData(listData);
        setOriginalListData(listData);
      }
    } catch (error) {
      console.error('Error fetching list:', error);
    }
  }, [listId]);

  // Core fetch function without debouncing
  const fetchSubscribersCore = useCallback(async (page: number = 1, search: string = '', status: string = 'all', limit: number = pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (search.trim()) {
        params.set('search', search.trim());
      }
      
      if (status && status !== 'all') {
        params.set('status', status);
      }

      const response = await fetch(`/api/lists/${listId}/subscribers?${params}`);
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
  }, [listId, pageSize]);

  // Debounced fetch function with 5-second delay
  const fetchSubscribers = useCallback((page: number = 1, search: string = '', status: string = 'all', limit: number = pageSize, immediate: boolean = false) => {
    // Clear existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    if (immediate) {
      // Fetch immediately for certain operations
      setSearchPending(false);
      fetchSubscribersCore(page, search, status, limit);
    } else {
      // Show pending indicator and batch with 5-second delay for search/filter changes
      setSearchPending(true);
      fetchTimeoutRef.current = setTimeout(() => {
        setSearchPending(false);
        fetchSubscribersCore(page, search, status, limit);
      }, 5000);
    }
  }, [fetchSubscribersCore, pageSize]);

  // Initial load effect
  useEffect(() => {
    fetchList();
    fetchSubscribers(1, searchTerm, statusFilter, pageSize, true);
  }, [fetchList]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect for search/filter changes with debouncing
  useEffect(() => {
    if (searchTerm || statusFilter !== 'all') {
      // Use debounced fetch for search/filter changes
      fetchSubscribers(1, searchTerm, statusFilter, pageSize, false);
    }
  }, [searchTerm, statusFilter, fetchSubscribers, pageSize]);

  // Effect for page size changes (immediate)
  useEffect(() => {
    if (pageSize !== 25) { // Only if pageSize changed from default
      fetchSubscribers(1, searchTerm, statusFilter, pageSize, true);
    }
  }, [pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  const handlePageChange = (page: number) => {
    // Pagination should be immediate
    fetchSubscribers(page, searchTerm, statusFilter, pageSize, true);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    // Reset to page 1 when changing page size - immediate
    fetchSubscribers(1, searchTerm, statusFilter, newPageSize, true);
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
          setNewSubscriber({ email: '', firstName: '', lastName: '', status: 'ACTIVE' });
          setShowAddDialog(false);
          fetchSubscribers(pagination.page, searchTerm, statusFilter, pageSize, true); // Immediate
          fetchList(); // Refresh list count
          setHasUnsavedChanges(true); // Mark as having unsaved changes
        }
      } catch (error) {
        console.error('Error adding subscriber:', error);
      }
    }
  };

  const handleUpdateSubscriber = async (id: string, updates: Partial<Subscriber>) => {
    try {
      const response = await fetch(`/api/lists/${listId}/subscribers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (response.ok) {
        fetchSubscribers(pagination.page, searchTerm, statusFilter, pageSize, true); // Immediate
        setHasUnsavedChanges(true); // Mark as having unsaved changes
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
        fetchSubscribers(pagination.page, searchTerm, statusFilter, pageSize, true); // Immediate
        fetchList(); // Refresh list count
        setHasUnsavedChanges(true); // Mark as having unsaved changes
      }
    } catch (error) {
      console.error('Error deleting subscriber:', error);
    }
  };

  const handleExportCsv = async () => {
    try {
      const response = await fetch(`/api/lists/${listId}/subscribers/export`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${list?.name || 'subscribers'}-export.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  const handleSubscribersImported = () => {
    setShowImportDialog(false);
    fetchSubscribers(1, searchTerm, statusFilter, pageSize, true); // Immediate
    fetchList(); // Refresh list count
    setHasUnsavedChanges(true); // Mark as having unsaved changes
  };

  // Check if there are any changes to enable/disable the update button
  const hasChanges = () => {
    const listDataChanged = 
      editListData.name !== originalListData.name ||
      editListData.description !== originalListData.description;
    
    // Always show button if there are any changes or recent subscriber operations
    return listDataChanged || hasUnsavedChanges;
  };

  const handleUpdateList = async () => {
    if (!editListData.name.trim()) return;

    setSaving(true);
    try {
      const listDataChanged = 
        editListData.name !== originalListData.name ||
        editListData.description !== originalListData.description;

      if (listDataChanged) {
        // Save list changes if there are any
        const response = await fetch(`/api/lists/${listId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editListData.name.trim(),
            description: editListData.description.trim(),
          }),
        });

        if (response.ok) {
          const updatedList = await response.json();
          setList(updatedList);
          
          const newListData = { 
            name: updatedList.name, 
            description: updatedList.description || '' 
          };
          setEditListData(newListData);
          setOriginalListData(newListData);
        } else {
          console.error('Failed to update list');
        }
      }

      // Always refresh the list data and reset unsaved changes state
      await fetchList();
      setHasUnsavedChanges(false);
      
    } catch (error) {
      console.error('Error updating list:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!list) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/lists')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Lists
            </Button>
            {hasChanges() && (
              <Button
                onClick={handleUpdateList}
                disabled={!editListData.name.trim() || saving}
                className="flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {saving ? 'Saving...' : (editListData.name !== originalListData.name || editListData.description !== originalListData.description) ? 'Save Changes' : 'Refresh List'}
              </Button>
            )}
          </div>

          {/* List Details Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">List Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="listName">List Name *</Label>
                <Input
                  id="listName"
                  value={editListData.name}
                  onChange={(e) => setEditListData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter list name"
                  className="text-lg"
                />
              </div>
              <div>
                <Label htmlFor="listDescription">Description</Label>
                <Textarea
                  id="listDescription"
                  value={editListData.description}
                  onChange={(e) => setEditListData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your list (optional)"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* List Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">
                      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : pagination.totalCount}
                    </div>
                    <p className="text-xs text-muted-foreground">Total Subscribers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Mail className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : subscribers.filter(s => s.status === 'ACTIVE').length}
                    </div>
                    <p className="text-xs text-muted-foreground">Active (Current Page)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-gray-600">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : subscribers.filter(s => s.status === 'UNSUBSCRIBED').length}
                </div>
                <p className="text-xs text-muted-foreground">Unsubscribed (Current Page)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : subscribers.filter(s => s.status === 'BOUNCED' || s.status === 'COMPLAINED').length}
                </div>
                <p className="text-xs text-muted-foreground">Issues (Current Page)</p>
              </CardContent>
            </Card>
          </div>

          {/* Subscribers Dashboard */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Subscribers Dashboard</h2>
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
                  onClick={() => setShowImportDialog(true)}
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
                          onChange={(e) => setNewSubscriber(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="subscriber@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={newSubscriber.firstName}
                          onChange={(e) => setNewSubscriber(prev => ({ ...prev, firstName: e.target.value }))}
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={newSubscriber.lastName}
                          onChange={(e) => setNewSubscriber(prev => ({ ...prev, lastName: e.target.value }))}
                          placeholder="Doe"
                        />
                      </div>
                      <div>
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={newSubscriber.status}
                          onValueChange={(value) => setNewSubscriber(prev => ({ ...prev, status: value as 'ACTIVE' }))}
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

            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Subscriber List</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      {searchPending ? (
                        <Loader2 className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
                      ) : (
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      )}
                      <Input
                        placeholder={searchPending ? "Search will execute in 5s..." : "Search subscribers..."}
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-8"
                        disabled={loading}
                      />
                      {searchPending && (
                        <div className="absolute right-2 top-2 text-xs text-muted-foreground bg-background px-1 rounded">
                          Pending...
                        </div>
                      )}
                    </div>
                    <Select value={statusFilter} onValueChange={handleStatusFilterChange} disabled={loading}>
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
                        <TableCell colSpan={5} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                          <p className="text-muted-foreground mt-2">Loading subscribers...</p>
                        </TableCell>
                      </TableRow>
                    ) : subscribers.map((subscriber) => (
                      <TableRow key={subscriber.id}>
                        <TableCell className="font-medium">{subscriber.email}</TableCell>
                        <TableCell>
                          {subscriber.firstName || subscriber.lastName
                            ? `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim()
                            : '-'
                          }
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
                                onClick={() => handleUpdateSubscriber(subscriber.id, { 
                                  status: subscriber.status === 'ACTIVE' ? 'UNSUBSCRIBED' : 'ACTIVE' 
                                })}
                              >
                                {subscriber.status === 'ACTIVE' ? 'Unsubscribe' : 'Resubscribe'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteSubscriber(subscriber.id)}
                                className="text-red-600"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!loading && subscribers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'No subscribers match your filters' 
                      : 'No subscribers yet. Add some subscribers to get started.'
                    }
                  </div>
                )}
                
                {/* Pagination and Page Size Controls */}
                {!loading && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Rows per page:</span>
                      <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => handlePageSizeChange(parseInt(value))}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="200">200</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {pagination.totalPages > 1 && (
                      <Pagination
                        currentPage={pagination.page}
                        totalPages={pagination.totalPages}
                        onPageChange={handlePageChange}
                        totalCount={pagination.totalCount}
                        itemsPerPage={pagination.limit}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Import Dialog */}
        {showImportDialog && list && (
          <ImportSubscribersDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            list={list}
            onSubscribersImported={handleSubscribersImported}
          />
        )}
      </main>
    </div>
  );
}