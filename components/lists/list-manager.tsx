'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Users, 
  Mail, 
  MoreHorizontal, 
  Edit, 
  Trash2,
  UserPlus,
  Settings
} from 'lucide-react';
import { z } from 'zod';

const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  subscriberCount: z.number(),
  activeSubscribers: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type EmailList = z.infer<typeof listSchema>;

interface ListManagerProps {
  lists: EmailList[];
  onCreateList: (list: Omit<EmailList, 'id' | 'subscriberCount' | 'activeSubscribers' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateList: (id: string, updates: Partial<EmailList>) => void;
  onDeleteList: (id: string) => void;
  onViewSubscribers: (listId: string) => void;
  onCreateCampaign: (listId: string) => void;
}

export function ListManager({
  lists,
  onCreateList,
  onUpdateList,
  onDeleteList,
  onViewSubscribers,
  onCreateCampaign,
}: ListManagerProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingList, setEditingList] = useState<EmailList | null>(null);
  const [newList, setNewList] = useState({
    name: '',
    description: '',
  });

  const handleCreateList = () => {
    if (newList.name.trim()) {
      onCreateList(newList);
      setNewList({ name: '', description: '' });
      setShowCreateDialog(false);
    }
  };

  const handleUpdateList = () => {
    if (editingList && editingList.name.trim()) {
      onUpdateList(editingList.id, {
        name: editingList.name,
        description: editingList.description,
      });
      setEditingList(null);
    }
  };

  const totalSubscribers = lists.reduce((sum, list) => sum + list.subscriberCount, 0);
  const totalActiveSubscribers = lists.reduce((sum, list) => sum + list.activeSubscribers, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Email Lists</h2>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create List
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Email List</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="list-name">List Name *</Label>
                <Input
                  id="list-name"
                  value={newList.name}
                  onChange={(e) => setNewList(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Newsletter Subscribers"
                />
              </div>
              <div>
                <Label htmlFor="list-description">Description</Label>
                <Textarea
                  id="list-description"
                  value={newList.description}
                  onChange={(e) => setNewList(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Main newsletter subscription list for weekly updates"
                  rows={3}
                />
              </div>
              <Button onClick={handleCreateList} className="w-full">
                Create List
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Total Lists</span>
            </div>
            <div className="text-2xl font-bold mt-2">{lists.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Total Subscribers</span>
            </div>
            <div className="text-2xl font-bold mt-2">{totalSubscribers.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <UserPlus className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">Active Subscribers</span>
            </div>
            <div className="text-2xl font-bold mt-2">{totalActiveSubscribers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalSubscribers > 0 ? ((totalActiveSubscribers / totalSubscribers) * 100).toFixed(1) : 0}% active
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lists.map((list) => (
          <Card key={list.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{list.name}</CardTitle>
                  {list.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {list.description}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewSubscribers(list.id)}>
                      <Users className="h-4 w-4 mr-2" />
                      View Subscribers
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateCampaign(list.id)}>
                      <Mail className="h-4 w-4 mr-2" />
                      Create Campaign
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingList(list)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit List
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onDeleteList(list.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete List
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">Subscribers</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {list.subscriberCount.toLocaleString()} total
                  </Badge>
                  <Badge variant="default">
                    {list.activeSubscribers.toLocaleString()} active
                  </Badge>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Active Rate</span>
                  <span>
                    {list.subscriberCount > 0 
                      ? ((list.activeSubscribers / list.subscriberCount) * 100).toFixed(1)
                      : 0
                    }%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ 
                      width: `${list.subscriberCount > 0 
                        ? (list.activeSubscribers / list.subscriberCount) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onViewSubscribers(list.id)}
                  className="flex-1"
                >
                  <Users className="h-4 w-4 mr-1" />
                  Manage
                </Button>
                <Button 
                  size="sm"
                  onClick={() => onCreateCampaign(list.id)}
                  className="flex-1"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Campaign
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                Created {new Date(list.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {lists.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No email lists yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first email list to start collecting and managing subscribers.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First List
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={editingList !== null} onOpenChange={() => setEditingList(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Email List</DialogTitle>
          </DialogHeader>
          {editingList && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-list-name">List Name *</Label>
                <Input
                  id="edit-list-name"
                  value={editingList.name}
                  onChange={(e) => setEditingList(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                  placeholder="Newsletter Subscribers"
                />
              </div>
              <div>
                <Label htmlFor="edit-list-description">Description</Label>
                <Textarea
                  id="edit-list-description"
                  value={editingList.description || ''}
                  onChange={(e) => setEditingList(prev => prev ? ({ ...prev, description: e.target.value }) : null)}
                  placeholder="Main newsletter subscription list for weekly updates"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdateList} className="flex-1">
                  Update List
                </Button>
                <Button variant="outline" onClick={() => setEditingList(null)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}