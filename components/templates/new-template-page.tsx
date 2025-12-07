'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Eye,
  Save,
  Paperclip,
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  ArrowLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createTemplateSchema } from '@/lib/validators';
import { ZodError } from 'zod';
import dynamic from 'next/dynamic';

const TiptapEditor = dynamic(
  () =>
    import('@/components/email-editor/tiptap-editor').then((mod) => ({
      default: mod.TiptapEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border">
        <div className="h-12 animate-pulse border-b bg-gray-50 p-2" />
        <div className="min-h-[300px] animate-pulse bg-gray-50 p-4" />
        <div className="h-16 animate-pulse border-t bg-gray-50 p-3" />
      </div>
    ),
  }
);

interface Attachment {
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
}

export function NewTemplatePage() {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  const [editorMode, setEditorMode] = useState<'notion' | 'code'>('notion');

  const [showModeSwitch, setShowModeSwitch] = useState(false);
  const [pendingMode, setPendingMode] = useState<'notion' | 'code'>('notion');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const availableVariables = [
    '{{firstName}}',
    '{{lastName}}',
    '{{email}}',
    '{{companyName}}',
    '{{unsubscribeUrl}}',
  ];

  // Load default editor mode from localStorage on mount
  useEffect(() => {
    try {
      const editorModes = JSON.parse(
        localStorage.getItem('template-editor-modes') || '{}'
      );
      const savedMode = editorModes['new-template-default'];
      if (savedMode === 'notion' || savedMode === 'code') {
        setEditorMode(savedMode);
      }
    } catch (error) {
      console.error('Error loading editor mode:', error);
    }
  }, []);

  const handleFileUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`);
        continue;
      }

      // Create attachment object
      const attachment: Attachment = {
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
        file: file,
      };

      setAttachments((prev) => [...prev, attachment]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleModeSwitch = (mode: 'notion' | 'code') => {
    if (mode === editorMode) return;

    if (content.trim()) {
      setPendingMode(mode);
      setShowModeSwitch(true);
    } else {
      setEditorMode(mode);
    }
  };

  const confirmModeSwitch = () => {
    setContent('');
    setEditorMode(pendingMode);
    setShowModeSwitch(false);
  };

  const insertVariable = (variable: string) => {
    if (editorMode === 'notion') {
      // For Notion editor, let the TiptapEditor handle it directly
      // The TiptapEditor component will handle this through its own insertVariable function
      return;
    } else {
      // For code editor, insert at cursor position and preserve scroll
      const textarea = document.getElementById(
        'code-content'
      ) as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentContent = textarea.value;
        const scrollTop = textarea.scrollTop;

        const newContent =
          currentContent.substring(0, start) +
          variable +
          currentContent.substring(end);

        setContent(newContent);

        // Preserve scroll position and cursor
        setTimeout(() => {
          textarea.focus();
          textarea.scrollTop = scrollTop;
          textarea.setSelectionRange(
            start + variable.length,
            start + variable.length
          );
        }, 0);
      } else {
        // Fallback: append to end
        setContent((prev) => prev + variable);
      }
    }
  };

  const validateForm = (): boolean => {
    try {
      const templateData = {
        name: name.trim(),
        subject: subject.trim(),
        content: content.trim(),
        attachments: attachments.map((att) => ({
          name: att.name,
          size: att.size,
          type: att.type,
          url: att.url,
        })),
      };

      createTemplateSchema.parse(templateData);
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

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const templateData = {
        name,
        subject,
        content,
        attachments: attachments.map((att) => ({
          name: att.name,
          size: att.size,
          type: att.type,
          url: att.url, // In production, this would be the uploaded URL
        })),
      };

      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData),
      });

      if (response.ok) {
        const data = await response.json();
        const templateId = data.template?.id;

        // Save editor mode for this template and as default for new templates
        if (templateId) {
          const editorModes = JSON.parse(
            localStorage.getItem('template-editor-modes') || '{}'
          );
          editorModes[templateId] = editorMode;
          editorModes['new-template-default'] = editorMode;
          localStorage.setItem(
            'template-editor-modes',
            JSON.stringify(editorModes)
          );
        }

        router.push('/templates');
      } else {
        const error = await response.json();
        console.error('Error saving template:', error);
      }
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setSaving(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (type.includes('pdf')) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Create New Template
          </h1>
          <p className="text-muted-foreground">
            Build reusable email templates with text or WYSIWYG editor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-3">
          {/* Template Details */}
          <Card>
            <CardHeader>
              <CardTitle>Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter template name"
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                  className={errors.subject ? 'border-red-500' : ''}
                />
                {errors.subject && (
                  <p className="mt-1 text-sm text-red-500">{errors.subject}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Content Editor */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Email Content</CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Editor Mode:</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={editorMode === 'notion' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleModeSwitch('notion')}
                    >
                      Notion
                    </Button>
                    <Button
                      variant={editorMode === 'code' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleModeSwitch('code')}
                    >
                      Code
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editorMode === 'notion' ? (
                <div>
                  <TiptapEditor
                    content={content}
                    onChange={setContent}
                    placeholder="Start writing your email content..."
                    availableVariables={availableVariables}
                    onInsertVariable={insertVariable}
                  />
                  {errors.content && (
                    <p className="mt-1 text-sm text-red-500">
                      {errors.content}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="code-content">HTML/CSS Code</Label>
                  <Textarea
                    id="code-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter your HTML/CSS code here..."
                    className={`min-h-[400px] font-mono text-sm ${errors.content ? 'border-red-500' : ''}`}
                    style={{
                      background: `linear-gradient(transparent, transparent), 
                        repeating-linear-gradient(
                          0deg,
                          transparent,
                          transparent 1ch,
                          transparent 1ch,
                          transparent 2ch
                        )`,
                    }}
                  />

                  <div className="mt-2 flex flex-wrap gap-1">
                    <p className="mr-2 text-xs text-gray-600">
                      Insert variables:
                    </p>
                    {availableVariables.map((variable) => (
                      <Button
                        key={variable}
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => insertVariable(variable)}
                      >
                        {variable}
                      </Button>
                    ))}
                  </div>
                  {errors.content && (
                    <p className="mt-1 text-sm text-red-500">
                      {errors.content}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center">
                  <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      Drag and drop files here, or click to select files
                    </p>
                    <Input
                      type="file"
                      multiple
                      onChange={(e) =>
                        e.target.files && handleFileUpload(e.target.files)
                      }
                      className="hidden"
                      id="file-upload"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById('file-upload')?.click()
                      }
                    >
                      Select Files
                    </Button>
                    <p className="text-xs text-gray-500">
                      Maximum file size: 10MB per file
                    </p>
                  </div>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    <Label>Attached Files ({attachments.length})</Label>
                    {attachments.map((attachment, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        {getFileIcon(attachment.type)}
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(attachment.size)} •{' '}
                            {attachment.type}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Email
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Email Preview</DialogTitle>
                  </DialogHeader>
                  <div className="rounded-lg border bg-gray-50 p-4">
                    <div className="rounded bg-white p-4 shadow-sm">
                      <div className="mb-4 border-b pb-2">
                        <strong>Subject:</strong> {subject || 'No subject'}
                      </div>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: content || '<p>No content</p>',
                        }}
                      />
                      {attachments.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <p className="mb-2 text-sm font-medium">
                            Attachments:
                          </p>
                          {attachments.map((attachment, index) => (
                            <div key={index} className="text-sm text-gray-600">
                              📎 {attachment.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Mode Switch Confirmation Dialog */}
          <Dialog open={showModeSwitch} onOpenChange={setShowModeSwitch}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Switch Editor Mode</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Switching from {editorMode} mode to {pendingMode} mode will
                  clear all current content. Are you sure you want to continue?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowModeSwitch(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={confirmModeSwitch}>Switch Mode</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Variables */}
          <Card>
            <CardHeader>
              <CardTitle>Template Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="mb-3 text-sm text-gray-600">
                  Click to insert variables into your template:
                </p>
                {availableVariables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="mr-1 mb-1 cursor-pointer hover:bg-gray-100"
                    onClick={() => insertVariable(variable)}
                  >
                    {variable}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}