'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eye, Code, Save, Type } from 'lucide-react';
import { z } from 'zod';

{/* <EmailTemplateBuilder 
  template={existingTemplate} // optional
  onSave={(template) => {
    // Save template to database or state
    console.log('Saving template:', template);
  }}
/> */}

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  htmlContent: z.string().min(1, 'HTML content is required'),
  textContent: z.string().optional(),
});

type Template = z.infer<typeof templateSchema>;

interface TemplateBuilderProps {
  template?: Partial<Template>;
  onSave: (template: Template) => void;
}

export function EmailTemplateBuilder({
  template,
  onSave,
}: TemplateBuilderProps) {
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [htmlContent, setHtmlContent] = useState(template?.htmlContent ?? '');
  const [textContent, setTextContent] = useState(template?.textContent ?? '');
  const [activeTab, setActiveTab] = useState('html');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const availableVariables = [
    '{{firstName}}',
    '{{lastName}}',
    '{{email}}',
    '{{unsubscribeUrl}}',
  ];

  const insertVariable = (variable: string) => {
    if (activeTab === 'html') {
      setHtmlContent((prev) => prev + variable);
    } else {
      setTextContent((prev) => prev + variable);
    }
  };

  const handleSave = () => {
    try {
      const templateData = templateSchema.parse({
        id: template?.id,
        name,
        subject,
        htmlContent,
        textContent,
      });
      
      setErrors({});
      onSave(templateData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
    }
  };

  const generatePreview = () => {
    const sampleData = {
      '{{firstName}}': 'John',
      '{{lastName}}': 'Doe',
      '{{email}}': 'john.doe@example.com',
      '{{unsubscribeUrl}}': '#unsubscribe',
    };

    let content = activeTab === 'html' ? htmlContent : textContent;
    Object.entries(sampleData).forEach(([key, value]) => {
      content = content.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return content;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Template Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
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
            <Label htmlFor="template-subject">Subject Line</Label>
            <Input
              id="template-subject"
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Email Content</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="html" className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="text" className="flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="html" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="html-content">HTML Content</Label>
                  <Textarea
                    id="html-content"
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                    placeholder="Enter HTML email content..."
                    className={`min-h-[400px] font-mono text-sm ${
                      errors.htmlContent ? 'border-red-500' : ''
                    }`}
                  />
                  {errors.htmlContent && (
                    <p className="text-sm text-red-500 mt-1">{errors.htmlContent}</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="text" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="text-content">Plain Text Content</Label>
                  <Textarea
                    id="text-content"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Enter plain text email content..."
                    className="min-h-[400px] font-mono text-sm"
                  />
                  <p className="text-sm text-gray-600">
                    Plain text version is optional but recommended for better email deliverability.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium mb-2">Preview with Sample Data</h4>
                    <div className="space-y-2">
                      <div className="text-sm">
                        <strong>Subject:</strong> {subject.replace(/{{(\w+)}}/g, (match, key) => {
                          const sampleData: Record<string, string> = {
                            firstName: 'John',
                            lastName: 'Doe',
                            email: 'john.doe@example.com',
                          };
                          return sampleData[key] || match;
                        })}
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-4 bg-white">
                    {activeTab === 'html' ? (
                      <div 
                        className="prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: generatePreview() }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm">
                        {generatePreview()}
                      </pre>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Available Variables</Label>
              <p className="text-sm text-gray-600 mb-3">
                Click to insert into your {activeTab === 'html' ? 'HTML' : 'text'} content:
              </p>
              <div className="space-y-2">
                {availableVariables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="cursor-pointer hover:bg-blue-50 hover:border-blue-300 w-full justify-center py-2"
                    onClick={() => insertVariable(variable)}
                  >
                    {variable}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={handleSave}
                className="w-full flex items-center gap-2"
                size="sm"
              >
                <Save className="h-4 w-4" />
                Save Template
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}