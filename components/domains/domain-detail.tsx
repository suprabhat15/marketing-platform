'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Check, RefreshCw, ArrowLeft, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DnsRecord {
  key: string;
  value: string;
}

interface DomainDetailData {
  id: string;
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  createdAt: string;
  verifiedAt?: string;
  records: {
    txt: DnsRecord;
    mx: DnsRecord;
    cname: DnsRecord[];
    mailFromMx: DnsRecord;
    mailFromTxt: DnsRecord;
  };
}

interface DomainDetailProps {
  domainId: string;
}

export default function DomainDetail({ domainId }: DomainDetailProps) {
  const router = useRouter();
  const [domain, setDomain] = useState<DomainDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedRecords, setCopiedRecords] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchDomainDetail = async () => {
      try {
        const response = await fetch(`/api/domains/${domainId}`);
        const data = await response.json();
        if (response.ok) {
          setDomain(data);
        } else {
          alert(data.error || 'Failed to fetch domain details');
        }
      } catch (error) {
        alert('Failed to fetch domain details');
      } finally {
        setIsLoading(false);
      }
    };

    if (domainId) {
      fetchDomainDetail();
    }
  }, [domainId]);
  

  const handleCheckVerification = async () => {
    if (!domain) return;
    
    setIsVerifying(true);
    try {
      const response = await fetch(`/api/domains/${domainId}`);
      const data = await response.json();

      if (response.ok) {
        setDomain(data);
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

  const handleDeleteDomain = async () => {
    if (!domain) return;
    
    if (!confirm(`Are you sure you want to delete ${domain.domain}? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/domains?id=${domain.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Domain deleted successfully');
        router.push('/domains');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete domain');
      }
    } catch (error) {
      alert('Failed to delete domain');
    } finally {
      setIsDeleting(false);
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

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <main className="flex-1 overflow-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="flex h-screen bg-background">
        <main className="flex-1 overflow-auto">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Domain not found</p>
            <Button onClick={() => router.push('/domains')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Domains
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background flex h-screen">
      <main className="flex-1 overflow-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/domains')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Domains
            </Button>
          </div>

          {/* Domain Details Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{domain.domain}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                {getStatusBadge(domain.status)}
                <span className="text-muted-foreground text-sm">
                  Added: {new Date(domain.createdAt).toLocaleDateString()}
                </span>
                {domain.verifiedAt && (
                  <span className="text-muted-foreground text-sm">
                    Verified: {new Date(domain.verifiedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {domain.status === 'PENDING' && (
                  <Button
                    onClick={handleCheckVerification}
                    disabled={isVerifying}
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {isVerifying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Check Verification
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleDeleteDomain}
                  disabled={isDeleting}
                  className="border-red-200 text-red-600 hover:border-red-300 hover:text-red-700"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete Domain
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status Message */}
          {domain.status === 'PENDING' && (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-yellow-800">
                    Add these DNS records to your domain to verify ownership.
                    Once added, click "Check Verification" above.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {domain.status === 'VERIFIED' && (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-green-800">
                    🎉 Your domain has been successfully verified! You can now
                    send emails from this domain.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DNS Records */}
          <Card>
            <CardHeader>
              <CardTitle>DNS Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Table Header */}
                <div className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4 font-medium">
                  <div>Type</div>
                  <div>Name</div>
                  <div>Value</div>
                </div>

                {/* MAIL FROM Section Header */}
                {/* <div className="pb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">MAIL FROM Domain Records</h3>
              <p className="text-xs text-muted-foreground mt-1">Required for custom MAIL FROM domain and SPF alignment</p>
            </div> */}

                {/* MAIL FROM MX Record */}
                <div className="rounded-lg border p-4">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <div>
                      <Badge className="bg-orange-100 text-orange-800">
                        MX
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm break-all">
                        {domain.records.mailFromMx.key}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            domain.records.mailFromMx.key,
                            'mailfrom-mx-name'
                          )
                        }
                      >
                        {copiedRecords.has('mailfrom-mx-name') ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm break-all">
                        {domain.records.mailFromMx.value}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            domain.records.mailFromMx.value,
                            'mailfrom-mx-value'
                          )
                        }
                      >
                        {copiedRecords.has('mailfrom-mx-value') ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* MAIL FROM TXT (SPF) Record */}
                <div className="rounded-lg border p-4">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <div>
                      <Badge className="bg-teal-100 text-teal-800">TXT</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm break-all">
                        {domain.records.mailFromTxt.key}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            domain.records.mailFromTxt.key,
                            'mailfrom-txt-name'
                          )
                        }
                      >
                        {copiedRecords.has('mailfrom-txt-name') ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm break-all">
                        {domain.records.mailFromTxt.value}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            domain.records.mailFromTxt.value,
                            'mailfrom-txt-value'
                          )
                        }
                      >
                        {copiedRecords.has('mailfrom-txt-value') ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* CNAME Records */}
                {domain.records.cname.map((record, index) => (
                  <div key={index} className="rounded-lg border p-4">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <div>
                        <Badge className="bg-purple-100 text-purple-800">
                          CNAME
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-sm break-all">
                          {record.key}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(record.key, `cname-${index}-name`)
                          }
                        >
                          {copiedRecords.has(`cname-${index}-name`) ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-sm break-all">
                          {record.value}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              record.value,
                              `cname-${index}-value`
                            )
                          }
                        >
                          {copiedRecords.has(`cname-${index}-value`) ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}