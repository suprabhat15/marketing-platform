'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Users, UserPlus } from 'lucide-react';
import { createListSchema } from '@/lib/validators';
import { ZodError } from 'zod';

interface Subscriber {
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'UNSUBSCRIBED';
}

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListCreated: () => void;
}

export function CreateListDialog({
  open,
  onOpenChange,
  onListCreated,
}: CreateListDialogProps) {
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

  const validateForm = (): boolean => {
    try {
      createListSchema.parse({ name, description });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof ZodError) {
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
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          subscribers,
        }),
      });

      if (response.ok) {
        setName('');
        setDescription('');
        setSubscribers([]);
        setNewSubscriber({
          email: '',
          firstName: '',
          lastName: '',
          status: 'ACTIVE' as 'ACTIVE' | 'UNSUBSCRIBED',
        });
        onListCreated();
      } else {
        const error = await response.json();
        console.error('Error creating list:', error);
      }
    } catch (error) {
      console.error('Error creating list:', error);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
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
                {subscribers.length} subscribers added
              </div>
            </CardContent>
          </Card>

          {/* Add Subscribers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Subscribers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="email">Email</Label>
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
                    placeholder="email@example.com"
                    onKeyPress={handleKeyPress}
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
                    onChange={(e) =>
                      setNewSubscriber((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                    placeholder="Doe"
                    onKeyPress={handleKeyPress}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newSubscriber.status}
                    onValueChange={(value: 'ACTIVE' | 'UNSUBSCRIBED') =>
                      setNewSubscriber((prev) => ({ ...prev, status: value }))
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
                <UserPlus className="mr-2 h-4 w-4" />
                Add Subscriber
              </Button>
            </CardContent>
          </Card>

          {/* Subscribers List */}
          {subscribers.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">
                  Added Subscribers ({subscribers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {subscribers.map((subscriber, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium">{subscriber.email}</div>
                          <div className="text-sm text-gray-500">
                            {subscriber.firstName} {subscriber.lastName}
                          </div>
                        </div>
                        <Badge
                          variant={
                            subscriber.status === 'ACTIVE'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {subscriber.status === 'ACTIVE'
                            ? 'Subscribed'
                            : 'Unsubscribed'}
                        </Badge>
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

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Creating...' : 'Create List'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}