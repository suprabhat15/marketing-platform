'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SubscriptionCardProps {
  subscription: {
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
  };
  onUpdate: () => void;
}

export function SubscriptionCard({ subscription, onUpdate }: SubscriptionCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  const getStatusIcon = () => {
    switch (subscription.status) {
      case 'active':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'trialing':
        return <Calendar className="h-5 w-5 text-blue-500" />;
      case 'past_due':
      case 'incomplete':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'canceled':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    const variants = {
      active: 'bg-green-100 text-green-800',
      trialing: 'bg-blue-100 text-blue-800',
      past_due: 'bg-yellow-100 text-yellow-800',
      incomplete: 'bg-yellow-100 text-yellow-800',
      canceled: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={variants[subscription.status as keyof typeof variants]}>
        {subscription.status.replace('_', ' ')}
      </Badge>
    );
  };

  const formatAmount = () => {
    const amount = subscription.price.amount / 100; // Convert from cents
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: subscription.price.currency.toUpperCase(),
    }).format(amount);
  };

  const handleCancel = async () => {
    if (loading) return;
    
    setLoading('cancel');
    try {
      const response = await fetch('/api/billing/subscriptions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId: subscription.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      alert('Subscription canceled successfully');
      onUpdate();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      alert(error instanceof Error ? error.message : 'Failed to cancel subscription');
    } finally {
      setLoading(null);
    }
  };


  const getStatusMessage = () => {
    switch (subscription.status) {
      case 'active':
        if (subscription.cancelAtPeriodEnd) {
          return `Your subscription will end on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`;
        }
        return `Your next payment of ${formatAmount()} is due on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`;
      
      case 'trialing':
        return `Your trial ends on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}. Add a payment method to continue.`;
      
      case 'past_due':
        return `Your payment failed. Please update your payment method to continue service.`;
      
      case 'incomplete':
        return `Your subscription setup is incomplete. Please complete the payment process.`;
      
      case 'canceled':
        return `Your subscription was canceled on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`;
      
      default:
        return '';
    }
  };

  const getActionButtons = () => {
    switch (subscription.status) {
      case 'active':
        return (
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push('/pricing')}
              disabled={loading !== null}
            >
              {loading === 'upgrade' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Plan
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleCancel}
              disabled={loading !== null}
            >
              {loading === 'cancel' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Subscription
            </Button>
          </div>
        );

      case 'trialing':
      case 'past_due':
      case 'incomplete':
        return (
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="default" 
              size="sm"
              onClick={() => router.push('/billing/payment-methods')}
            >
              Update Payment Method
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCancel}
              disabled={loading !== null}
            >
              {loading === 'cancel' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel
            </Button>
          </div>
        );
      
      case 'canceled':
        return (
          <Button 
            variant="default" 
            size="sm"
            onClick={() => router.push('/pricing')}
          >
            Reactivate Subscription
          </Button>
        );
      
      default:
        return null;
    }
  };

  // if(!subscription?.product?.id) return <div>No Active Subscription!</div>
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-xl">{subscription.product.name}</CardTitle>
              <CardDescription>
                {formatAmount()} /{' '}
                {subscription.price.recurring?.interval || 'month'}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Subscription Details */}
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          {/* <div>
            <span className="font-medium text-muted-foreground">Subscription ID:</span>
            <p className="font-mono text-xs">{subscription.id}</p>
          </div> */}
          <div>
            <span className="text-muted-foreground font-medium">
              Billing Cycle:
            </span>
            <p className="capitalize">
              {subscription.price.recurring?.interval || 'month'}ly
            </p>
          </div>
          <div>
            <span className="text-muted-foreground font-medium">
              Current Period:
            </span>
            <p>
              {new Date(subscription.currentPeriodStart).toLocaleDateString()} -{' '}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Amount:</span>
            <p>{formatAmount()}</p>
          </div>
        </div>

        {/* Status Message */}
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-start space-x-2">
            <CreditCard className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {getStatusMessage()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2">
          {getActionButtons()}
        </div>
      </CardContent>
    </Card>
  );
}