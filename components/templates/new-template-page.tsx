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
  Code, 
  Save, 
  Type, 
  Paperclip, 
  X, 
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  Link,
  List,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

const templateCreateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  attachments: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
    url: z.string(),
  })).optional(),
});

type Template = z.infer<typeof templateCreateSchema>;

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
  const [textContent, setTextContent] = useState('');
  const [activeTab, setActiveTab] = useState('wysiwyg');
  const [isWysiwygMode, setIsWysiwygMode] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const availableVariables = [
    '{{name}}',
    '{{firstName}}',
    '{{lastName}}',
    '{{email}}',
    '{{companyName}}',
    '{{unsubscribeUrl}}',
  ];

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

      setAttachments(prev => [...prev, attachment]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const insertVariable = (variable: string) => {
    if (isWysiwygMode) {
      // For WYSIWYG mode, we would need to integrate with the editor
      setContent(prev => prev + variable);
    } else {
      // For text mode, insert at cursor position
      setContent(prev => prev + variable);
    }
  };

  const validateForm = (): boolean => {
    try {
      // Determine which content to validate based on active tab
      const finalContent = activeTab === 'text' ? textContent : content;
      
      const templateData = {
        name: name.trim(),
        subject: subject.trim(),
        content: finalContent.trim(),
        attachments: attachments.map(att => ({
          name: att.name,
          size: att.size,
          type: att.type,
          url: att.url,
        })),
      };

      templateCreateSchema.parse(templateData);
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

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      // Send the appropriate content based on selected tab
      const finalContent = activeTab === 'text' ? textContent : content;
      
      const templateData = {
        name,
        subject,
        content: finalContent,
        attachments: attachments.map(att => ({
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

  // WYSIWYG Editor Component
  const WysiwygEditor = () => {
    const editorRef = useRef<HTMLDivElement>(null);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      setContent(e.currentTarget.innerHTML);
    };

    const executeCommand = (command: string, value?: string) => {
      document.execCommand(command, false, value);
      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
        editorRef.current.focus();
      }
    };

    const insertVariable = (variable: string) => {
      if (editorRef.current) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const span = document.createElement('span');
          span.className = 'bg-blue-100 text-blue-800 px-1 rounded text-sm';
          span.textContent = variable;
          range.insertNode(span);
          range.setStartAfter(span);
          range.setEndAfter(span);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Fallback: append at the end
          const span = document.createElement('span');
          span.className = 'bg-blue-100 text-blue-800 px-1 rounded text-sm';
          span.textContent = variable;
          editorRef.current.appendChild(span);
        }
        setContent(editorRef.current.innerHTML);
        editorRef.current.focus();
      }
    };

    // Set initial content only once
    useEffect(() => {
      if (editorRef.current && !editorRef.current.innerHTML) {
        editorRef.current.innerHTML = content || '<p>Start typing your email content...</p>';
      }
    }, []);

    return (
      <div className="border rounded-lg">
        {/* Toolbar */}
        <div className="border-b p-2 flex items-center gap-1 flex-wrap">
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('bold')}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('italic')}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('underline')}
          >
            <Underline className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('justifyLeft')}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('justifyCenter')}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('justifyRight')}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const url = prompt('Enter URL:');
              if (url) executeCommand('createLink', url);
            }}
          >
            <Link className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeCommand('insertUnorderedList')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const color = prompt('Enter color (hex):');
              if (color) executeCommand('foreColor', color);
            }}
          >
            <Palette className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Editor Content */}
        <div
          ref={editorRef}
          contentEditable
          className="min-h-[300px] p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          style={{ whiteSpace: 'pre-wrap' }}
          onInput={handleInput}
          onPaste={(e) => {
            // Handle paste to maintain formatting
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
        />
        
        {/* Variable insertion toolbar */}
        <div className="border-t p-2 bg-gray-50">
          <p className="text-xs text-gray-600 mb-2">Insert variables:</p>
          <div className="flex flex-wrap gap-1">
            {availableVariables.map((variable) => (
              <Button
                key={variable}
                variant="outline"
                size="sm"
                className="text-xs h-6"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVariable(variable)}
              >
                {variable}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create New Template</h1>
          <p className="text-muted-foreground">
            Build reusable email templates with text or WYSIWYG editor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
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
                  <p className="text-sm text-red-500 mt-1">{errors.name}</p>
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
                  <p className="text-sm text-red-500 mt-1">{errors.subject}</p>
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
                  <Label htmlFor="editor-mode" className="text-sm">
                    WYSIWYG Mode
                  </Label>
                  <Switch
                    id="editor-mode"
                    checked={isWysiwygMode}
                    onCheckedChange={setIsWysiwygMode}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="wysiwyg" className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    {isWysiwygMode ? 'Visual Editor' : 'HTML Editor'}
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Plain Text
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="wysiwyg" className="mt-4">
                  {isWysiwygMode ? (
                    <WysiwygEditor />
                  ) : (
                    <div>
                      <Label htmlFor="html-content">HTML Content</Label>
                      <Textarea
                        id="html-content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Enter HTML content"
                        className={`min-h-[300px] font-mono ${errors.content ? 'border-red-500' : ''}`}
                      />
                    </div>
                  )}
                  {errors.content && (
                    <p className="text-sm text-red-500 mt-1">{errors.content}</p>
                  )}
                </TabsContent>

                <TabsContent value="preview" className="mt-4">
                  <div className="border rounded-lg p-4 min-h-[300px] bg-gray-50">
                    <div className="bg-white p-4 rounded shadow-sm">
                      <div className="border-b pb-2 mb-4">
                        <strong>Subject:</strong> {subject || 'No subject'}
                      </div>
                      <div 
                        dangerouslySetInnerHTML={{ __html: content || textContent || '<p>No content</p>' }}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="text" className="mt-4">
                  <div>
                    <Label htmlFor="text-content">Plain Text Content</Label>
                    <Textarea
                      id="text-content"
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Enter plain text content"
                      className={`min-h-[300px] ${errors.content && activeTab === 'text' ? 'border-red-500' : ''}`}
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Plain text version for email clients that don&apos;t support HTML
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
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
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      Drag and drop files here, or click to select files
                    </p>
                    <Input
                      type="file"
                      multiple
                      onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                      className="hidden"
                      id="file-upload"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('file-upload')?.click()}
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
                        className="flex items-center gap-3 p-3 border rounded-lg"
                      >
                        {getFileIcon(attachment.type)}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{attachment.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(attachment.size)} • {attachment.type}
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
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Email
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Email Preview</DialogTitle>
                  </DialogHeader>
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="bg-white p-4 rounded shadow-sm">
                      <div className="border-b pb-2 mb-4">
                        <strong>Subject:</strong> {subject || 'No subject'}
                      </div>
                      <div 
                        dangerouslySetInnerHTML={{ __html: content || textContent || '<p>No content</p>' }}
                      />
                      {attachments.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium mb-2">Attachments:</p>
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

          {/* Variables */}
          <Card>
            <CardHeader>
              <CardTitle>Template Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-3">
                  Click to insert variables into your template:
                </p>
                {availableVariables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="cursor-pointer hover:bg-gray-100 mr-1 mb-1"
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