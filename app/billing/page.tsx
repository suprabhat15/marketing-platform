'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sidebar } from '@/components/layout/sidebar';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Package,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SubscriptionCard } from '@/components/billing/subscription-card';
import type {
  BillingPortalData,
  BillingSubscription,
  BillingOrder,
  BillingMeter,
} from '@/lib/polar/polar-customer.service';

function mapSubscriptionToCardProps(s: BillingSubscription) {
  return {
    id: s.id,
    status: s.status as 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete',
    product: { id: s.productId, name: s.productName },
    price: {
      id: s.id,
      amount: s.amount,
      currency: s.currency,
      recurring: { interval: s.recurringInterval as 'month' | 'year' },
    },
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd ?? s.currentPeriodStart,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  };
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function OrderStatusBadge({ status, paid }: { status: string; paid: boolean }) {
  if (paid) {
    return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
  }
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-red-100 text-red-800',
  };
  return (
    <Badge className={colors[status] ?? 'bg-gray-100 text-gray-800'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function MeterCard({ meter }: { meter: BillingMeter }) {
  const usedPct = meter.creditedUnits > 0
    ? Math.min(100, Math.round((meter.consumedUnits / meter.creditedUnits) * 100))
    : 0;
  const remaining = Math.max(0, meter.balance);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            {meter.meterName}
          </CardTitle>
          <Badge className={remaining > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
            {remaining > 0 ? 'Active' : 'Exhausted'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{meter.creditedUnits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Credits</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{meter.consumedUnits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Used</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{remaining.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{usedPct}% used</span>
            <span>{remaining.toLocaleString()} left</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BillingPage() {
  const [data, setData] = useState<BillingPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/customer-portal');

      if (response.status === 404) {
        setError('no-customer');
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || body.error || 'Failed to load billing data');
      }

      const result = await response.json();
      setData(result.data);
    } catch (err) {
      console.error('Error fetching billing data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load billing portal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading billing data...</p>
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Billing & Payments</h1>
              <p className="text-muted-foreground">
                Manage your subscription, usage, and order history.
              </p>
            </div>
            {data && (
              <Button variant="outline" size="sm" onClick={fetchBillingData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>

          {error === 'no-customer' ? (
            <Card>
              <CardHeader>
                <CardTitle>No Billing Account Found</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  You don&apos;t have a billing account yet. Make your first purchase to access the billing portal.
                </p>
                <Button onClick={() => router.push('/pricing')}>Browse Plans</Button>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="border-destructive">
              <CardContent className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button variant="outline" onClick={fetchBillingData}>Try Again</Button>
              </CardContent>
            </Card>
          ) : data ? (
            <Tabs defaultValue="credits" className="space-y-6">
              <TabsList>
                <TabsTrigger value="credits">Credits Usage</TabsTrigger>
                <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                <TabsTrigger value="orders">Order History</TabsTrigger>
              </TabsList>

              {/* Credits Usage */}
              <TabsContent value="credits">
                {data.meters.length > 0 ? (
                  <div className="space-y-4">
                    {data.meters.map((meter: BillingMeter) => (
                      <MeterCard key={meter.id} meter={meter} />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground mb-4">No credit meters found.</p>
                      <Button onClick={() => router.push('/pricing')}>Browse Plans</Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Subscriptions */}
              <TabsContent value="subscriptions">
                {data.subscriptions.length > 0 ? (
                  <div className="space-y-4">
                    {data.subscriptions.map((sub) => (
                      <SubscriptionCard
                        key={sub.id}
                        subscription={mapSubscriptionToCardProps(sub)}
                        onUpdate={fetchBillingData}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground mb-4">
                        You don&apos;t have any active subscriptions.
                      </p>
                      <Button onClick={() => router.push('/pricing')}>Browse Plans</Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Order History */}
              <TabsContent value="orders">
                {data.orders.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Order History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {data.orders.map((order: BillingOrder) => (
                          <div
                            key={order.id}
                            className="flex items-center justify-between p-4 border rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{order.productName}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(order.createdAt).toLocaleDateString()} &middot;{' '}
                                {order.billingReason.replace('_', ' ')}
                              </p>
                            </div>
                            <div className="flex items-center space-x-4">
                              <OrderStatusBadge status={order.status} paid={order.paid} />
                              <span className="font-semibold">
                                {formatAmount(order.totalAmount, order.currency)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">No orders yet.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </div>
    </div>
  );
}
