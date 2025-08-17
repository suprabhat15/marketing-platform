'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Monitor, 
  Smartphone, 
  Tablet,
  Eye,
  Code,
  Send,
  RefreshCw
} from 'lucide-react';
import { z } from 'zod';

const devicePresets = {
  desktop: { width: 600, height: 800, name: 'Desktop' },
  tablet: { width: 768, height: 1024, name: 'Tablet' },
  mobile: { width: 375, height: 667, name: 'Mobile' },
};

const previewSchema = z.object({
  subject: z.string(),
  htmlContent: z.string(),
  textContent: z.string().optional(),
  previewText: z.string().optional(),
});

type EmailPreview = z.infer<typeof previewSchema>;

interface EmailPreviewProps {
  email: EmailPreview;
  sampleData?: Record<string, string>;
  onSendTest?: (testEmail: string) => void;
  isLoading?: boolean;
}

export function EmailPreview({
  email,
  sampleData = {},
  onSendTest,
  isLoading = false,
}: EmailPreviewProps) {
  const [selectedDevice, setSelectedDevice] = useState<keyof typeof devicePresets>('desktop');
  const [testEmail, setTestEmail] = useState('');
  const [activeTab, setActiveTab] = useState('visual');

  const defaultSampleData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    company: 'Acme Corp',
    unsubscribeUrl: '#unsubscribe',
    ...sampleData,
  };

  const replaceVariables = (content: string) => {
    let processedContent = content;
    Object.entries(defaultSampleData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedContent = processedContent.replace(regex, String(value));
    });
    return processedContent;
  };

  const processedHtml = replaceVariables(email.htmlContent);
  const processedText = email.textContent ? replaceVariables(email.textContent) : '';
  const processedSubject = replaceVariables(email.subject);
  const processedPreviewText = email.previewText ? replaceVariables(email.previewText) : '';

  const currentDevice = devicePresets[selectedDevice];

  const handleSendTest = () => {
    if (testEmail && onSendTest) {
      onSendTest(testEmail);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Email Preview</h2>
        <div className="flex items-center gap-2">
          {onSendTest && (
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              />
              <Button
                onClick={handleSendTest}
                disabled={!testEmail || isLoading}
                size="sm"
                className="flex items-center gap-2"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Test
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Email Details</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                Variables: {Object.keys(defaultSampleData).length}
              </Badge>
              <Badge variant="secondary">
                {selectedDevice.charAt(0).toUpperCase() + selectedDevice.slice(1)} View
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Subject Line</label>
              <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">
                {processedSubject}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Preview Text</label>
              <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
                {processedPreviewText || 'No preview text set'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="visual" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visual
              </TabsTrigger>
              <TabsTrigger value="html" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                HTML
              </TabsTrigger>
              {processedText && (
                <TabsTrigger value="text">
                  Text
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex items-center gap-2">
              <Select
                value={selectedDevice}
                onValueChange={(value) => setSelectedDevice(value as keyof typeof devicePresets)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Desktop
                    </div>
                  </SelectItem>
                  <SelectItem value="tablet">
                    <div className="flex items-center gap-2">
                      <Tablet className="h-4 w-4" />
                      Tablet
                    </div>
                  </SelectItem>
                  <SelectItem value="mobile">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Mobile
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="visual" className="mt-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex justify-center">
                  <div 
                    className="border rounded-lg shadow-lg bg-white overflow-hidden transition-all duration-300"
                    style={{
                      width: `${currentDevice.width}px`,
                      maxWidth: '100%',
                      minHeight: '400px',
                    }}
                  >
                    <div className="bg-gray-100 p-3 border-b text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="ml-4 text-gray-600">{processedSubject}</span>
                      </div>
                    </div>
                    <div 
                      className="email-preview-content"
                      style={{
                        maxHeight: '600px',
                        overflowY: 'auto',
                      }}
                      dangerouslySetInnerHTML={{ __html: processedHtml }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="html" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>HTML Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                    <code>{processedHtml}</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {processedText && (
            <TabsContent value="text" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Plain Text Version</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap text-sm font-mono">
                      {processedText}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sample Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(defaultSampleData).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                <span className="text-sm font-medium text-gray-700">
                  {`{{${key}}}`}
                </span>
                <span className="text-sm text-gray-600">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <style jsx>{`
        .email-preview-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .email-preview-content img {
          max-width: 100%;
          height: auto;
        }
        .email-preview-content table {
          border-collapse: collapse;
          width: 100%;
        }
        .email-preview-content a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}