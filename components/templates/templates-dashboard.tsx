'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Trash2,
  Copy,
  Edit,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { z } from 'zod';

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string(),
});

type Template = z.infer<typeof templateSchema>;

export function TemplatesDashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (templateId: string) => {
    router.push(`/templates/${templateId}/edit`);
  };

  const handleDuplicate = async (template: Template) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          subject: template.subject,
          content: template.content,
        }),
      });

      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error duplicating template:', error);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground">
            Create and manage reusable email templates
          </p>
        </div>
        <Button onClick={() => router.push('/templates/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Templates
            </CardTitle>
            <FileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Templates List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              All Templates ({filteredTemplates.length})
            </CardTitle>

            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {templates.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No templates
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first email template.
                </p>
                <Button
                  onClick={() => router.push('/templates/new')}
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="py-12 text-center">
                <Search className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No templates found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Try adjusting your search criteria.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="mt-3"
                >
                  Clear search
                </Button>
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="hover:bg-background rounded-lg border p-4 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">
                          {template.name}
                        </h3>
                      </div>

                      <p className="text-muted-foreground text-sm">
                        Subject: {template.subject}
                      </p>

                      <div className="text-muted-foreground flex items-center gap-6 text-sm">
                        <span>
                          Created:{' '}
                          {format(new Date(template.createdAt), 'MMM d, yyyy')}
                        </span>
                        <span>
                          Updated:{' '}
                          {format(new Date(template.updatedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(template.id)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(template)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(template.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}