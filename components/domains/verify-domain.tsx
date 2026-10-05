'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DnsRecord {
  key: string;
  value: string;
}

interface VerificationResponse {
  id: string;
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  records: {
    txt: DnsRecord;
    mx: DnsRecord;
    cname: DnsRecord[];
    mailFromMx: DnsRecord;
    mailFromTxt: DnsRecord;
  };
}

export default function VerifyDomain() {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationResponse | null>(null);
  const [copiedRecords, setCopiedRecords] = useState<Set<string>>(new Set());

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
        setVerificationData(data);
        // Don't redirect, show DNS records on the same page
      } else {
        alert(data.error || 'Failed to verify domain');
      }
    } catch (error) {
      alert('Failed to verify domain');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleVerifyDomain();
    }
  };

  const handleCheckVerification = async () => {
    if (!verificationData) return;
    
    setIsVerifying(true);
    try {
      const response = await fetch(`/api/domains/${verificationData.id}`);
      const data = await response.json();

      if (response.ok) {
        setVerificationData(data);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Verify Domain</h1>
          <p className="text-muted-foreground">
            Add your domain to start sending emails and build domain authority.
          </p>
        </div>
      </div>

      {/* Back to Domains Button */}
      <div className="flex justify-start">
        <Button variant="outline" onClick={() => router.push('/domains')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Domains
        </Button>
      </div>

      {/* Verify Domain Form */}
      {!verificationData && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Column 1: Add Domain */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Domain
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="domain"
                    className="text-foreground mb-2 block text-sm font-medium"
                  >
                    Domain Name
                  </label>
                  <Input
                    id="domain"
                    type="text"
                    placeholder="example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="text-lg"
                    disabled={isLoading}
                  />
                  <p className="text-muted-foreground mt-2 text-sm">
                    Enter your domain without "http://" or "www" (e.g.,
                    example.com)
                  </p>
                </div>

                <Button
                  onClick={handleVerifyDomain}
                  disabled={isLoading || !domain}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Verify Domain
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Column 2: What happens next */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-2 font-semibold">What happens next?</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• We'll generate DNS records for your domain</li>
                <li>• Add these records to your domain's DNS settings</li>
                <li>• We'll verify ownership and enable email sending</li>
                <li>• Start sending emails from your verified domain</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DNS Records Section */}
      {verificationData && (
        <>
          {/* Domain Status */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    {verificationData.domain}
                  </h2>
                  <div className="mt-1 flex items-center gap-2">
                    {getStatusBadge(verificationData.status)}
                  </div>
                </div>
                <Button
                  onClick={() => setVerificationData(null)}
                  variant="outline"
                  size="sm"
                >
                  Add Another Domain
                </Button>
              </div>

              {verificationData.status === 'PENDING' && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-yellow-800">
                    Add these DNS records to your domain to verify ownership.
                    Once added, click "Check Verification Status" below.
                  </p>
                </div>
              )}

              {verificationData.status === 'VERIFIED' && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-green-800">
                    🎉 Your domain has been successfully verified! You can now
                    send emails from this domain.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DNS Records */}
          <Card>
            <CardHeader>
              <CardTitle>DNS Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Table Header */}
                <div className="bg-muted grid grid-cols-3 gap-4 rounded-lg p-4 font-medium">
                  <div>Type</div>
                  <div>Name</div>
                  <div>Value</div>
                </div>

                {/* MAIL FROM Section Header */}
                {/* <div className="pt-4 pb-2">
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
                        {verificationData.records.mailFromMx.key}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            verificationData.records.mailFromMx.key,
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
                        {verificationData.records.mailFromMx.value}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            verificationData.records.mailFromMx.value,
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
                        {verificationData.records.mailFromTxt.key}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            verificationData.records.mailFromTxt.key,
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
                        {verificationData.records.mailFromTxt.value}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            verificationData.records.mailFromTxt.value,
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
                {verificationData.records.cname.map((record, index) => (
                  <div key={index} className="rounded-lg border p-4">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <div>
                        <Badge className="bg-purple-100 text-purple-800">
                          CNAME
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-sm break-all">
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
                        <div className="flex-1 font-mono text-sm break-all">
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

          {/* Check Verification Button */}
          <div className="text-center">
            <Button
              onClick={handleCheckVerification}
              disabled={isVerifying}
              size="lg"
            >
              {isVerifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Check Verification Status
            </Button>
          </div>
        </>
      )}
    </div>
  );
}