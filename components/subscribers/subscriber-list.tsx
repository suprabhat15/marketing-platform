'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, MoreHorizontal, Download, Upload, UserPlus } from 'lucide-react';
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

interface SubscriberListProps {
  listId: string;
  subscribers: Subscriber[];
  onAddSubscriber: (subscriber: Omit<Subscriber, 'id' | 'createdAt'>) => void;
  onUpdateSubscriber: (id: string, updates: Partial<Subscriber>) => void;
  onDeleteSubscriber: (id: string) => void;
  onImportCsv: (file: File) => void;
  onExportCsv: () => void;
}

export function SubscriberList({
  subscribers,
  onAddSubscriber,
  onUpdateSubscriber,
  onDeleteSubscriber,
  onImportCsv,
  onExportCsv,
}: SubscriberListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSubscriber, setNewSubscriber] = useState({
    email: '',
    firstName: '',
    lastName: '',
    status: 'ACTIVE' as const,
  });

  const filteredSubscribers = subscribers.filter((subscriber) => {
    const matchesSearch = 
      subscriber.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subscriber.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subscriber.lastName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || subscriber.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

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

  const handleAddSubscriber = () => {
    if (newSubscriber.email) {
      onAddSubscriber(newSubscriber);
      setNewSubscriber({ email: '', firstName: '', lastName: '', status: 'ACTIVE' });
      setShowAddDialog(false);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportCsv(file);
    }
  };

  const statusCounts = subscribers.reduce((acc, subscriber) => {
    acc[subscriber.status] = (acc[subscriber.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Subscribers</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onExportCsv}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => document.getElementById('csv-import')?.click()}
            className="flex items-center gap-2"
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

      <input
        id="csv-import"
        type="file"
        accept=".csv"
        onChange={handleFileImport}
        className="hidden"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{subscribers.length}</div>
            <p className="text-xs text-muted-foreground">Total Subscribers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{statusCounts.ACTIVE || 0}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-600">{statusCounts.UNSUBSCRIBED || 0}</div>
            <p className="text-xs text-muted-foreground">Unsubscribed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{(statusCounts.BOUNCED || 0) + (statusCounts.COMPLAINED || 0)}</div>
            <p className="text-xs text-muted-foreground">Issues</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Subscriber List</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search subscribers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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
              {filteredSubscribers.map((subscriber) => (
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
                          onClick={() => onUpdateSubscriber(subscriber.id, { 
                            status: subscriber.status === 'ACTIVE' ? 'UNSUBSCRIBED' : 'ACTIVE' 
                          })}
                        >
                          {subscriber.status === 'ACTIVE' ? 'Unsubscribe' : 'Resubscribe'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDeleteSubscriber(subscriber.id)}
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
          {filteredSubscribers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilter !== 'all' 
                ? 'No subscribers match your filters' 
                : 'No subscribers yet. Add some subscribers to get started.'
              }
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}