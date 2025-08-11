'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Users,
  Download,
  Info
} from 'lucide-react';

interface List {
  id: string;
  name: string;
}

interface ParsedSubscriber {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  status: 'ACTIVE' | 'UNSUBSCRIBED';
  isValid: boolean;
  error?: string;
}

interface ImportSubscribersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: List;
  onSubscribersImported: () => void;
}

export function ImportSubscribersDialog({ 
  open, 
  onOpenChange, 
  list, 
  onSubscribersImported 
}: ImportSubscribersDialogProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedSubscribers, setParsedSubscribers] = useState<ParsedSubscriber[]>([]);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'parsed' | 'importing' | 'success'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setImportStatus('parsing');
    setParseError(null);
    setParsedSubscribers([]);

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      setParsedSubscribers(parsed);
      setImportStatus('parsed');
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to parse CSV file');
      setImportStatus('idle');
    }
  };

  const parseCSV = (csvText: string): ParsedSubscriber[] => {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must contain at least a header row and one data row');
    }

    // Parse header row
    const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
    const emailIndex = headers.findIndex(h => h.includes('email'));
    const nameIndex = headers.findIndex(h => h.includes('name') && !h.includes('email'));

    if (emailIndex === -1) {
      throw new Error('CSV file must contain an "email" column');
    }

    const subscribers: ParsedSubscriber[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      const row = parseCsvRow(line);
      
      if (row.length <= emailIndex || (nameIndex >= 0 && row.length <= nameIndex)) {
        continue; // Skip incomplete rows
      }

      const email = (row[emailIndex] || '').trim().toLowerCase();
      const name = nameIndex >= 0 ? (row[nameIndex] || '').trim() : '';

      const subscriber: ParsedSubscriber = {
        email,
        name,
        status: 'ACTIVE',
        isValid: true,
      };

      // Split name into first and last name
      if (name) {
        const nameParts = name.trim().split(' ');
        subscriber.firstName = nameParts[0] || '';
        subscriber.lastName = nameParts.slice(1).join(' ') || '';
      }

      // Validate email
      if (!email || !isValidEmail(email)) {
        subscriber.isValid = false;
        subscriber.error = 'Invalid email address';
      }

      subscribers.push(subscriber);
    }

    if (subscribers.length === 0) {
      throw new Error('No valid subscribers found in CSV file');
    }

    // Check for duplicates within the CSV
    const emailCounts = new Map<string, number>();
    subscribers.forEach(subscriber => {
      const email = subscriber.email.toLowerCase();
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    });

    // Mark duplicates
    subscribers.forEach(subscriber => {
      const email = subscriber.email.toLowerCase();
      if (emailCounts.get(email)! > 1) {
        subscriber.isValid = false;
        subscriber.error = 'Duplicate email in CSV';
      }
    });

    return subscribers;
  };

  // Helper function to parse a CSV row handling quoted values
  const parseCsvRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < row.length) {
      const char = row[i];
      
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // Handle escaped quotes
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    
    result.push(current.trim());
    return result;
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleImport = async () => {
    if (parsedSubscribers.length === 0) return;

    setImporting(true);
    setImportStatus('importing');

    try {
      const validSubscribers = parsedSubscribers.filter(sub => sub.isValid);
      
      const response = await fetch(`/api/lists/${list.id}/subscribers/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribers: validSubscribers.map(sub => ({
            email: sub.email,
            firstName: sub.firstName || '',
            lastName: sub.lastName || '',
            status: sub.status,
          })),
        }),
      });

      if (response.ok) {
        setImportStatus('success');
        setTimeout(() => {
          resetDialog();
          onSubscribersImported();
        }, 2000);
      } else {
        const error = await response.json();
        setParseError(error.message || 'Failed to import subscribers');
        setImportStatus('parsed');
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to import subscribers');
      setImportStatus('parsed');
    } finally {
      setImporting(false);
    }
  };

  const resetDialog = () => {
    setCsvFile(null);
    setParsedSubscribers([]);
    setParseError(null);
    setImportStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetDialog();
    onOpenChange(false);
  };

  const validSubscribers = parsedSubscribers.filter(sub => sub.isValid);
  const invalidSubscribers = parsedSubscribers.filter(sub => !sub.isValid);

  const downloadSampleCSV = () => {
    const sampleCSV = `email,name
john.doe@example.com,John Doe
jane.smith@example.com,Jane Smith
alex.johnson@example.com,Alex Johnson`;
    
    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Subscribers to "{list.name}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Instructions */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>CSV Format Requirements:</strong></p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Must contain an "email" column</li>
                  <li>Optional "name" column (will be split into first and last name)</li>
                  <li>First row should contain column headers</li>
                  <li>Each subsequent row represents one subscriber</li>
                </ul>
                <Button 
                  variant="link" 
                  className="h-auto p-0 text-sm"
                  onClick={downloadSampleCSV}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download Sample CSV
                </Button>
              </div>
            </AlertDescription>
          </Alert>

          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload CSV File</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Select a CSV file to upload
                    </p>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importStatus === 'parsing' || importStatus === 'importing'}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                  </div>
                </div>

                {csvFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parse Error */}
          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Parsing Status */}
          {importStatus === 'parsing' && (
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
                  <span>Parsing CSV file...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview Parsed Data */}
          {importStatus === 'parsed' && parsedSubscribers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Preview ({parsedSubscribers.length} subscribers found)</span>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {validSubscribers.length} valid
                    </Badge>
                    {invalidSubscribers.length > 0 && (
                      <Badge variant="secondary" className="bg-red-100 text-red-800">
                        {invalidSubscribers.length} invalid
                      </Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {parsedSubscribers.map((subscriber, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        subscriber.isValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {subscriber.isValid ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <div>
                          <div className="font-medium">{subscriber.email}</div>
                          {subscriber.name && (
                            <div className="text-sm text-muted-foreground">
                              {subscriber.firstName} {subscriber.lastName}
                            </div>
                          )}
                          {subscriber.error && (
                            <div className="text-sm text-red-600">{subscriber.error}</div>
                          )}
                        </div>
                      </div>
                      <Badge variant={subscriber.isValid ? 'default' : 'destructive'}>
                        {subscriber.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Status */}
          {importStatus === 'importing' && (
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
                  <span>Importing subscribers...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success Status */}
          {importStatus === 'success' && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Successfully imported {validSubscribers.length} subscribers to "{list.name}"
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={handleClose}>
            {importStatus === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {importStatus === 'parsed' && validSubscribers.length > 0 && (
            <Button 
              onClick={handleImport} 
              disabled={importing}
              className="bg-green-600 hover:bg-green-700"
            >
              <Users className="h-4 w-4 mr-2" />
              {importing ? 'Importing...' : `Import ${validSubscribers.length} Subscribers`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}