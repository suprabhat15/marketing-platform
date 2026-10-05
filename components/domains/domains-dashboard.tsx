'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Copy, Check, Unlink2, RefreshCw, Trash2, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DnsRecord {
  key: string;
  value: string;
}

interface DomainData {
  id: string;
  domain: string;
  email?: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  createdAt: string;
  verifiedAt?: string;
}

interface VerificationResponse {
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  records: {
    txt: DnsRecord;
    mx: DnsRecord;
    cname: DnsRecord[];
  };
  message?: string;
}

interface DomainsDashboardProps {
  initialDomains?: DomainData[];
}

export default function DomainsDashboard({ initialDomains = [] }: DomainsDashboardProps) {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [domains, setDomains] = useState<DomainData[]>(initialDomains);
  const [verificationData, setVerificationData] = useState<VerificationResponse | null>(null);
  const [copiedRecords, setCopiedRecords] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Only fetch domains if no initial domains provided (for backward compatibility)
    if (initialDomains.length === 0) {
      fetchDomains();
    }
  }, [initialDomains.length]);

  const fetchDomains = async () => {
    try {
      const response = await fetch('/api/domains');
      const data = await response.json();
      
      if (response.ok) {
        setDomains(data.domains);
      } else {
        alert(data.error || 'Failed to fetch domains');
      }
    } catch (error) {
      alert('Failed to fetch domains');
    }
  };

  const validateDomain = (domain: string): boolean => {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain) && domain.includes('.');
  };

  const handleVerifyDomain = async () => {
    if (!domain) {
      alert('Please enter a domain name');
      return;
    }

    if (!validateDomain(domain)) {
      alert('Please enter a valid domain name (e.g., example.com)');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/domains/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchDomains(); // Refresh domains list
        // Redirect to domain detail page
        router.push(`/domains/${data.id}`);
      } else {
        alert(data.error || 'Failed to verify domain');
      }
    } catch (error) {
      alert('Failed to verify domain');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckVerification = async (domain: string) => {
    setIsVerifying(true);

    try {
      const response = await fetch(`/api/domains/verify?domain=${encodeURIComponent(domain)}`);
      const data = await response.json();

      if (response.ok) {
        await fetchDomains(); // Refresh domains list
        alert(data.status === 'VERIFIED' 
          ? 'Domain verification successful!' 
          : 'Domain verification is still pending');
      } else {
        alert(data.error || 'Failed to check verification');
      }
    } catch (error) {
      alert('Failed to check verification');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleViewDomain = (domainId: string) => {
    router.push(`/domains/${domainId}`);
  };

  const handleDeleteDomain = async (domainId: string, domainName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    
    if (!confirm(`Are you sure you want to delete ${domainName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/domains?id=${domainId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDomains(); // Refresh domains list
        alert('Domain deleted successfully');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete domain');
      }
    } catch (error) {
      alert('Failed to delete domain');
    }
  };

  const copyToClipboard = async (text: string, recordKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRecords(prev => new Set(prev).add(recordKey));
      
      setTimeout(() => {
        setCopiedRecords(prev => {
          const newSet = new Set(prev);
          newSet.delete(recordKey);
          return newSet;
        });
      }, 2000);

      // Visual feedback handled by check icon
    } catch (error) {
      alert('Failed to copy to clipboard');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return <Badge className="bg-green-100 text-green-800">Verified</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'FAILED':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getDomainCounts = () => {
    const total = domains.length;
    const verified = domains.filter(d => d.status === 'VERIFIED').length;
    const pending = domains.filter(d => d.status === 'PENDING').length;
    return { total, verified, pending };
  };

  const { total, verified, pending } = getDomainCounts();

  return (
    <div className="flex h-screen bg-background">
      <main className="flex-1 overflow-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Domains</h1>
              <p className="text-muted-foreground">
                By sending emails from your own domain you build up domain authority and trust.
              </p>
            </div>
            <Button 
              onClick={() => router.push('/domains/verify')} 
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Verify Domain
            </Button>
          </div>

          {/* Domain Statistics */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <div className="h-4 w-4 rounded-full bg-blue-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{total}</div>
                    <p className="text-muted-foreground text-xs">Total Domains</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <div className="h-4 w-4 rounded-full bg-green-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{verified}</div>
                    <p className="text-muted-foreground text-xs">Verified</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
                    <div className="h-4 w-4 rounded-full bg-yellow-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{pending}</div>
                    <p className="text-muted-foreground text-xs">Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>


          {/* Domains Table */}
          <Card>
            <CardHeader>
              <CardTitle>Your Domains</CardTitle>
            </CardHeader>
            <CardContent>
              {domains.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No domains added yet</p>
                  <Button 
                    onClick={() => router.push('/domains/verify')} 
                    className="bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Domain
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {domains.map((domain) => (
                    <div 
                      key={domain.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => router.push(`/domains/${domain.id}`)}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-lg">{domain.domain}</div>
                        <div className="text-sm text-muted-foreground">
                          Added {new Date(domain.createdAt).toLocaleDateString()}
                          {domain.verifiedAt && (
                            <span className="ml-2">
                              • Verified {new Date(domain.verifiedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(domain.status)}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDomain(domain.id);
                          }}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleDeleteDomain(domain.id, domain.domain, e)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>

  );
}