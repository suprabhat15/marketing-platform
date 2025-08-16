'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Clock, 
  Play, 
  Pause, 
  Edit, 
  Trash2, 
  Plus,
  Calendar,
  Mail,
  Users
} from 'lucide-react';
import { z } from 'zod';

const automationTriggerSchema = z.object({
  type: z.enum(['time_based', 'action_based', 'date_based']),
  config: z.object({
    interval: z.string().optional(),
    time: z.string().optional(),
    action: z.string().optional(),
    date: z.string().optional(),
  }).catchall(z.any()),
});

const automationActionSchema = z.object({
  type: z.enum(['send_email', 'add_to_list', 'remove_from_list', 'wait']),
  config: z.object({
    templateId: z.string().optional(),
    listId: z.string().optional(),
    duration: z.string().optional(),
    unit: z.string().optional(),
  }).catchall(z.any()),
});

const automationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'draft']),
  trigger: automationTriggerSchema,
  actions: z.array(automationActionSchema),
  createdAt: z.string(),
  lastRun: z.string().optional(),
  subscribers: z.number(),
});

type Automation = z.infer<typeof automationSchema>;

interface AutomationBuilderProps {
  automations: Automation[];
  templates: { id: string; name: string }[];
  lists: { id: string; name: string }[];
  onCreateAutomation: (automation: Omit<Automation, 'id' | 'createdAt' | 'subscribers'>) => void;
  onUpdateAutomation: (id: string, updates: Partial<Automation>) => void;
  onDeleteAutomation: (id: string) => void;
  onToggleAutomation: (id: string, status: 'active' | 'paused') => void;
}

export function AutomationBuilder({
  automations,
  templates,
  lists,
  onCreateAutomation,
  onUpdateAutomation,
  onDeleteAutomation,
  onToggleAutomation,
}: AutomationBuilderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAutomation, setNewAutomation] = useState({
    name: '',
    description: '',
    status: 'draft' as 'draft' | 'active' | 'paused',
    trigger: {
      type: 'time_based' as 'time_based' | 'action_based' | 'date_based',
      config: {} as any,
    },
    actions: [
      {
        type: 'send_email' as 'send_email' | 'add_to_list' | 'remove_from_list' | 'wait',
        config: {} as any,
      },
    ],
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      draft: 'bg-gray-100 text-gray-800',
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  const getTriggerDescription = (trigger: Automation['trigger']) => {
    switch (trigger.type) {
      case 'time_based':
        return `Every ${trigger.config.interval || 'day'} at ${trigger.config.time || '9:00 AM'}`;
      case 'action_based':
        return `When ${trigger.config.action || 'subscriber joins list'}`;
      case 'date_based':
        return `On ${trigger.config.date || 'specific date'}`;
      default:
        return 'Custom trigger';
    }
  };

  const handleCreateAutomation = () => {
    if (newAutomation.name) {
      onCreateAutomation(newAutomation);
      setNewAutomation({
        name: '',
        description: '',
        status: 'draft' as 'draft' | 'active' | 'paused',
        trigger: { type: 'time_based' as 'time_based' | 'action_based' | 'date_based', config: {} as any },
        actions: [{ type: 'send_email' as 'send_email' | 'add_to_list' | 'remove_from_list' | 'wait', config: {} as any }],
      });
      setShowCreateDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Email Automation</h2>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Automation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Automation</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="automation-name">Automation Name</Label>
                  <Input
                    id="automation-name"
                    value={newAutomation.name}
                    onChange={(e) => setNewAutomation(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Welcome Series"
                  />
                </div>
                <div>
                  <Label htmlFor="automation-description">Description (Optional)</Label>
                  <Input
                    id="automation-description"
                    value={newAutomation.description}
                    onChange={(e) => setNewAutomation(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Send welcome emails to new subscribers"
                  />
                </div>
              </div>

              <Tabs defaultValue="trigger" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="trigger">Trigger</TabsTrigger>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                </TabsList>
                
                <TabsContent value="trigger" className="space-y-4">
                  <div>
                    <Label htmlFor="trigger-type">Trigger Type</Label>
                    <Select
                      value={newAutomation.trigger.type}
                      onValueChange={(value) => setNewAutomation(prev => ({
                        ...prev,
                        trigger: { type: value as any, config: {} as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time_based">Time Based</SelectItem>
                        <SelectItem value="action_based">Action Based</SelectItem>
                        <SelectItem value="date_based">Date Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newAutomation.trigger.type === 'time_based' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="interval">Interval</Label>
                        <Select
                          value={newAutomation.trigger.config.interval || 'day'}
                          onValueChange={(value) => setNewAutomation(prev => ({
                            ...prev,
                            trigger: {
                              ...prev.trigger,
                              config: { ...prev.trigger.config, interval: value }
                            }
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hour">Every Hour</SelectItem>
                            <SelectItem value="day">Daily</SelectItem>
                            <SelectItem value="week">Weekly</SelectItem>
                            <SelectItem value="month">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="time">Time</Label>
                        <Input
                          id="time"
                          type="time"
                          value={newAutomation.trigger.config.time || '09:00'}
                          onChange={(e) => setNewAutomation(prev => ({
                            ...prev,
                            trigger: {
                              ...prev.trigger,
                              config: { ...prev.trigger.config, time: e.target.value }
                            }
                          }))}
                        />
                      </div>
                    </div>
                  )}

                  {newAutomation.trigger.type === 'action_based' && (
                    <div>
                      <Label htmlFor="action">Trigger Action</Label>
                      <Select
                        value={newAutomation.trigger.config.action || 'subscriber_joins'}
                        onValueChange={(value) => setNewAutomation(prev => ({
                          ...prev,
                          trigger: {
                            ...prev.trigger,
                            config: { ...prev.trigger.config, action: value }
                          }
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subscriber_joins">Subscriber joins list</SelectItem>
                          <SelectItem value="email_opened">Email opened</SelectItem>
                          <SelectItem value="link_clicked">Link clicked</SelectItem>
                          <SelectItem value="birthday">Birthday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="actions" className="space-y-4">
                  <div>
                    <Label htmlFor="action-type">Action Type</Label>
                    <Select
                      value={newAutomation.actions[0]?.type || 'send_email'}
                      onValueChange={(value) => setNewAutomation(prev => ({
                        ...prev,
                        actions: [{ type: value as any, config: {} as any }]
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="send_email">Send Email</SelectItem>
                        <SelectItem value="add_to_list">Add to List</SelectItem>
                        <SelectItem value="remove_from_list">Remove from List</SelectItem>
                        <SelectItem value="wait">Wait/Delay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newAutomation.actions[0]?.type === 'send_email' && (
                    <div>
                      <Label htmlFor="email-template">Email Template</Label>
                      <Select
                        value={newAutomation.actions[0].config.templateId || ''}
                        onValueChange={(value) => setNewAutomation(prev => ({
                          ...prev,
                          actions: [{
                            ...prev.actions[0],
                            config: { ...prev.actions[0].config, templateId: value }
                          }]
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(newAutomation.actions[0]?.type === 'add_to_list' || newAutomation.actions[0]?.type === 'remove_from_list') && (
                    <div>
                      <Label htmlFor="target-list">Target List</Label>
                      <Select
                        value={newAutomation.actions[0].config.listId || ''}
                        onValueChange={(value) => setNewAutomation(prev => ({
                          ...prev,
                          actions: [{
                            ...prev.actions[0],
                            config: { ...prev.actions[0].config, listId: value }
                          }]
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select list" />
                        </SelectTrigger>
                        <SelectContent>
                          {lists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {newAutomation.actions[0]?.type === 'wait' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="wait-duration">Duration</Label>
                        <Input
                          id="wait-duration"
                          type="number"
                          value={newAutomation.actions[0].config.duration || '1'}
                          onChange={(e) => setNewAutomation(prev => ({
                            ...prev,
                            actions: [{
                              ...prev.actions[0],
                              config: { ...prev.actions[0].config, duration: e.target.value }
                            }]
                          }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="wait-unit">Unit</Label>
                        <Select
                          value={newAutomation.actions[0].config.unit || 'days'}
                          onValueChange={(value) => setNewAutomation(prev => ({
                            ...prev,
                            actions: [{
                              ...prev.actions[0],
                              config: { ...prev.actions[0].config, unit: value }
                            }]
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Button onClick={handleCreateAutomation} className="w-full">
                Create Automation
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Play className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Active</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-green-600">
              {automations.filter(a => a.status === 'active').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Pause className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium">Paused</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-yellow-600">
              {automations.filter(a => a.status === 'paused').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Edit className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium">Draft</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-gray-600">
              {automations.filter(a => a.status === 'draft').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Subscribers</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation) => (
                <TableRow key={automation.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{automation.name}</div>
                      {automation.description && (
                        <div className="text-sm text-muted-foreground">
                          {automation.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(automation.status)}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {getTriggerDescription(automation.trigger)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {automation.subscribers.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    {automation.lastRun ? (
                      new Date(automation.lastRun).toLocaleDateString()
                    ) : (
                      'Never'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleAutomation(
                          automation.id,
                          automation.status === 'active' ? 'paused' : 'active'
                        )}
                      >
                        {automation.status === 'active' ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteAutomation(automation.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {automations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No automations created yet. Create your first automation to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}