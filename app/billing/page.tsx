'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sidebar } from '@/components/layout/sidebar';
import { SubscriptionCard } from '@/components/billing/subscription-card';
import { 
  CreditCard, 
  Download, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';

interface PaymentHistory {
  id: string;
  date: string;
  description: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  invoice?: string;
}

interface Subscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  product: {
    id: string;
    name: string;
  };
  price: {
    id: string;
    amount: number;
    currency: string;
    recurring?: {
      interval: 'month' | 'year';
    };
  };
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, string>;
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [creditBalance, setCreditBalance] = useState<any>(null);

  const fetchBillingData = async () => {
    try {
      // Fetch subscription sync status and credit balance
      const syncResponse = await fetch('/api/billing/sync');
      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        setCreditBalance(syncData.creditBalance);
      }

      // Fetch subscriptions separately with proper transformation
      const subscriptionsResponse = await fetch('/api/billing/subscriptions');
      if (subscriptionsResponse.ok) {
        const subscriptionsData = await subscriptionsResponse.json();
        setSubscriptions(subscriptionsData.subscriptions || []);
      }

      // Simulate payment history for now
      setPaymentHistory([
        {
          id: '1',
          date: '2024-01-15',
          description: 'Email Credits Package',
          amount: '$50.00',
          status: 'paid',
          invoice: 'INV-001',
        },
        {
          id: '2',
          date: '2023-12-15',
          description: 'Email Credits Package',
          amount: '$20.00',
          status: 'paid',
          invoice: 'INV-002',
        },
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching billing data:', error);
      setLoading(false);
    }
  };

  const syncFromPolar = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/billing/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Sync current user's credit balance
      });

      if (response.ok) {
        const data = await response.json();
        setCreditBalance(data.creditBalance);
        
        // Refresh subscription data separately
        const subscriptionsResponse = await fetch('/api/billing/subscriptions');
        if (subscriptionsResponse.ok) {
          const subscriptionsData = await subscriptionsResponse.json();
          setSubscriptions(subscriptionsData.subscriptions || []);
        }
      } else {
        console.error('Failed to sync from Polar');
      }
    } catch (error) {
      console.error('Error syncing from Polar:', error);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'failed':
      case 'canceled':
      case 'past_due':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'canceled':
      case 'past_due':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading billing information...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold mb-2">Billing & Payments</h1>
            <p className="text-muted-foreground">
              Manage your subscription, payment methods, and billing history.
            </p>
          </div>

          {/* Credit Balance & Sync Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creditBalance ? creditBalance.totalCredits.toLocaleString() : '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Available email credits
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Used Credits</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creditBalance ? creditBalance.usedCredits.toLocaleString() : '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Credits consumed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Remaining Credits</CardTitle>
                {creditBalance?.hasActiveSubscription ? 
                  <CheckCircle className="h-4 w-4 text-green-500" /> : 
                  <XCircle className="h-4 w-4 text-red-500" />
                }
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creditBalance ? creditBalance.remainingCredits.toLocaleString() : '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Credits left to use
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncFromPolar}
                  disabled={syncing}
                  className="h-6 w-16"
                >
                  {syncing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Sync'
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">
                  {creditBalance?.hasActiveSubscription ? 'Active' : 'No Subscription'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {creditBalance?.meterId ? `Meter: ${creditBalance.meterName}` : 'No meter configured'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for different billing sections */}
          <Tabs defaultValue="history" className="space-y-6">
            <TabsList>
              <TabsTrigger value="history">Payment History</TabsTrigger>
              <TabsTrigger value="subscription">Subscription</TabsTrigger>
              <TabsTrigger value="methods">Payment Methods</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>

            {/* Payment History Tab */}
            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>
                    View all your past transactions and payments.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {paymentHistory.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center space-x-4">
                          {getStatusIcon(payment.status)}
                          <div>
                            <p className="font-medium">{payment.description}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(payment.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <Badge className={getStatusColor(payment.status)}>
                            {payment.status}
                          </Badge>
                          <span className="font-semibold">{payment.amount}</span>
                          {payment.invoice && (
                            <Button variant="outline" size="sm">
                              <Download className="h-4 w-4 mr-2" />
                              Invoice
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Subscription Management Tab */}
            <TabsContent value="subscription">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Subscription Management</CardTitle>
                    <CardDescription>
                      Manage your current subscriptions and billing preferences.
                    </CardDescription>
                  </CardHeader>
                </Card>

                {subscriptions.length > 0 ? (
                  <div className="space-y-4">
                    {subscriptions.map((subscription) => (
                      <SubscriptionCard
                        key={subscription.id}
                        subscription={subscription}
                        onUpdate={fetchBillingData}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <p className="text-muted-foreground mb-4">
                        You don't have any active subscriptions.
                      </p>
                      <Button onClick={() => window.location.href = '/pricing'}>
                        Browse Plans
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Payment Methods Tab */}
            <TabsContent value="methods">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>
                    Manage your payment methods and billing information.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <CreditCard className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium">•••• •••• •••• 4242</p>
                          <p className="text-sm text-muted-foreground">Expires 12/2025</p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Badge>Default</Badge>
                        <Button variant="outline" size="sm">Edit</Button>
                      </div>
                    </div>
                    
                    <Button variant="outline" className="w-full">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Add Payment Method
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices">
              <Card>
                <CardHeader>
                  <CardTitle>Invoices & Receipts</CardTitle>
                  <CardDescription>
                    Download your invoices and receipts for accounting purposes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {paymentHistory.filter(p => p.invoice).map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center space-x-4">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{payment.invoice}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(payment.date).toLocaleDateString()} • {payment.amount}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}