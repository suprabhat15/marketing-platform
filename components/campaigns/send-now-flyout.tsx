'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X, Send, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Domain {
  id: string;
  domain: string;
  status: 'VERIFIED' | 'PENDING' | 'FAILED';
}

interface SendNowFlyoutProps {
  open: boolean;
  onClose: () => void;
  onSend: (senderConfig: { fromEmail: string; fromName: string; replyTo: string; domain: string }) => Promise<void>;
}

export default function SendNowFlyout({ open, onClose, onSend }: SendNowFlyoutProps) {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDomains, setIsFetchingDomains] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      fetchVerifiedDomains();
    }
  }, [open]);

  useEffect(() => {
    if (selectedDomain && fromEmail.includes('@')) {
      const emailParts = fromEmail.split('@');
      setFromEmail(`${emailParts[0]}@${selectedDomain}`);
    }
  }, [selectedDomain]);

  const fetchVerifiedDomains = async () => {
    setIsFetchingDomains(true);
    try {
      const response = await fetch('/api/domains');
      if (response.ok) {
        const data = await response.json();
        const verifiedDomains = data.domains?.filter((domain: Domain) => domain.status === 'VERIFIED') || [];
        setDomains(verifiedDomains);
        
        if (verifiedDomains.length === 0) {
          setError('No verified domains found. Please verify a domain first.');
        }
      } else {
        setError('Failed to fetch domains');
      }
    } catch (error) {
      setError('Failed to fetch domains');
    } finally {
      setIsFetchingDomains(false);
    }
  };

  const handleFromEmailChange = (value: string) => {
    if (selectedDomain) {
      const localPart = value.split('@')[0];
      setFromEmail(`${localPart}@${selectedDomain}`);
    } else {
      setFromEmail(value);
    }
  };

  const handleDomainSelect = (domain: string) => {
    setSelectedDomain(domain);
    if (fromEmail) {
      const localPart = fromEmail.split('@')[0];
      setFromEmail(`${localPart}@${domain}`);
    }
  };

  const handleVerifyDomain = () => {
    router.push('/domains/verify');
    onClose();
  };

  const handleSend = async () => {
    if (!selectedDomain || !fromEmail || !fromName) {
      setError('All required fields must be filled');
      return;
    }

    if (!fromEmail.includes('@') || !fromEmail.endsWith(`@${selectedDomain}`)) {
      setError('Please enter a valid email address for the selected domain');
      return;
    }

    if (replyTo && !replyTo.includes('@')) {
      setError('Please enter a valid reply-to email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onSend({
        fromEmail,
        fromName,
        replyTo,
        domain: selectedDomain
      });
      onClose();
    } catch (error) {
      setError('Failed to send campaign');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedDomain('');
    setFromEmail('');
    setFromName('');
    setReplyTo('');
    setError('');
    onClose();
  };

  const isFormValid = selectedDomain && fromEmail && fromName && fromEmail.endsWith(`@${selectedDomain}`);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-6">
        <SheetHeader className="space-y-3">
          <SheetTitle className="text-xl font-semibold">Send Campaign Now</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            Configure sender details to send your campaign immediately.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="mt-8 space-y-8">
            {isFetchingDomains ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading domains...</span>
              </div>
            ) : domains.length === 0 ? (
              <div className="space-y-6">
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    No verified domains found. You need to verify a domain before sending campaigns.
                  </div>
                </div>
                <Button onClick={handleVerifyDomain} className="w-full h-11">
                  Verify Domain
                </Button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-3">
                  <Label htmlFor="domain-select" className="text-sm font-medium">
                    Select Verified Domain *
                  </Label>
                  <Select value={selectedDomain} onValueChange={handleDomainSelect}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Choose a verified domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain.id} value={domain.domain}>
                          {domain.domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="from-email" className="text-sm font-medium">
                    From Email *
                  </Label>
                  <div className="flex">
                    <Input
                      id="from-email"
                      value={fromEmail.split('@')[0] || ''}
                      onChange={(e) => handleFromEmailChange(`${e.target.value}@${selectedDomain || ''}`)}
                      placeholder="example"
                      className="rounded-r-none border-r-0 h-11"
                    />
                    <div className="flex items-center px-4 bg-muted border border-l-0 rounded-r-md text-sm text-muted-foreground min-w-0">
                      @{selectedDomain || 'domain.com'}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter the local part of your email address (before @)
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="from-name" className="text-sm font-medium">
                    Sender Name *
                  </Label>
                  <Input
                    id="from-name"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Your Name or Company"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This will appear as the sender name in the recipient's inbox
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="reply-to" className="text-sm font-medium">
                    Reply To
                  </Label>
                  <Input
                    id="reply-to"
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="example@gmail.com"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter email id where you want to receive replies for this campaign
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-red-800">{error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom buttons */}
        {domains.length > 0 && (
          <div className="border-t pt-6 mt-6">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 h-11"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!isFormValid || isLoading}
                className="flex-1 h-11"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}