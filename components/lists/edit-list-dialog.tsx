'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Users, UserPlus, Edit } from 'lucide-react';
import { z } from 'zod';

const editListSchema = z.object({
  name: z.string().min(1, 'List name is required'),
  description: z.string().optional(),
});

interface List {
  id: string;
  name: string;
  description: string;
}

interface Subscriber {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED';
}

interface EditListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: List;
  onListUpdated: () => void;
}

export function EditListDialog({ open, onOpenChange, list, onListUpdated }: EditListDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [newSubscriber, setNewSubscriber] = useState({
    email: '',
    firstName: '',
    lastName: '',
    status: 'ACTIVE' as 'ACTIVE' | 'UNSUBSCRIBED',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && list) {
      setName(list.name);
      setDescription(list.description || '');
      fetchSubscribers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list]);

  const fetchSubscribers = async () => {
    try {
      const response = await fetch(`/api/lists/${list.id}/subscribers`);
      if (response.ok) {
        const data = await response.json();
        setSubscribers(data.subscribers);
      }
    } catch (error) {
      console.error('Error fetching subscribers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubscriber = () => {
    if (!newSubscriber.email) {
      return;
    }

    // Check if email already exists
    if (subscribers.some(sub => sub.email === newSubscriber.email)) {
      return;
    }

    setSubscribers([...subscribers, newSubscriber]);
    setNewSubscriber({
      email: '',
      firstName: '',
      lastName: '',
      status: 'ACTIVE' as 'ACTIVE' | 'UNSUBSCRIBED',
    });
  };

  const handleRemoveSubscriber = (index: number) => {
    setSubscribers(subscribers.filter((_, i) => i !== index));
  };

  const handleUpdateSubscriberStatus = (index: number, status: Subscriber['status']) => {
    const updatedSubscribers = [...subscribers];
    updatedSubscribers[index].status = status;
    setSubscribers(updatedSubscribers);
  };

  const validateForm = (): boolean => {
    try {
      editListSchema.parse({ name, description });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const field = err.path[0] as string;
          newErrors[field] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/lists/${list.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          subscribers,
        }),
      });

      if (response.ok) {
        onListUpdated();
      } else {
        const error = await response.json();
        console.error('Error updating list:', error);
      }
    } catch (error) {
      console.error('Error updating list:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newSubscriber.email) {
      e.preventDefault();
      handleAddSubscriber();
    }
  };

  const getStatusBadgeVariant = (status: Subscriber['status']) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'UNSUBSCRIBED':
        return 'secondary';
      case 'BOUNCED':
      case 'COMPLAINED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusLabel = (status: Subscriber['status']) => {
    switch (status) {
      case 'ACTIVE':
        return 'Subscribed';
      case 'UNSUBSCRIBED':
        return 'Unsubscribed';
      case 'BOUNCED':
        return 'Bounced';
      case 'COMPLAINED':
        return 'Complained';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit List</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* List Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">List Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">List Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter list name"
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your list..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                {subscribers.length} subscribers
              </div>
            </CardContent>
          </Card>

          {/* Add New Subscribers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add New Subscribers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newSubscriber.email}
                    onChange={(e) => setNewSubscriber(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@example.com"
                    onKeyPress={handleKeyPress}
                  />
                </div>
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={newSubscriber.firstName}
                    onChange={(e) => setNewSubscriber(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="John"
                    onKeyPress={handleKeyPress}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={newSubscriber.lastName}
                    onChange={(e) => setNewSubscriber(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Doe"
                    onKeyPress={handleKeyPress}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newSubscriber.status}
                    onValueChange={(value: 'ACTIVE' | 'UNSUBSCRIBED') => 
                      setNewSubscriber(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Subscribed</SelectItem>
                      <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleAddSubscriber}
                disabled={!newSubscriber.email}
                className="w-full"
                variant="outline"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Subscriber
              </Button>
            </CardContent>
          </Card>

          {/* Existing Subscribers */}
          {subscribers.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Subscribers ({subscribers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {subscribers.map((subscriber, index) => (
                    <div key={subscriber.id || index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex-1">
                          <div className="font-medium">{subscriber.email}</div>
                          <div className="text-sm text-gray-500">
                            {subscriber.firstName} {subscriber.lastName}
                          </div>
                        </div>
                        <Select
                          value={subscriber.status}
                          onValueChange={(value: Subscriber['status']) => 
                            handleUpdateSubscriberStatus(index, value)
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Subscribed</SelectItem>
                            <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
                            <SelectItem value="BOUNCED">Bounced</SelectItem>
                            <SelectItem value="COMPLAINED">Complained</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSubscriber(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            <Edit className="h-4 w-4 mr-2" />
            {saving ? 'Updating...' : 'Update List'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}