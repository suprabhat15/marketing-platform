'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  title: string;
  description: string;
  price: string;
  period?: string;
  features: string[];
  buttonText: string;
  buttonVariant?: 'default' | 'outline';
  popular?: boolean;
  onSelect: () => void;
  loading?: boolean;
}

export function PricingCard({
  title,
  description,
  price,
  period = '/month',
  features,
  buttonText,
  buttonVariant = 'default',
  popular = false,
  onSelect,
  loading = false,
}: PricingCardProps) {
  return (
    <Card className={cn(
      'relative h-full flex flex-col',
      popular && 'border-primary shadow-lg scale-105'
    )}>
      {popular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3 py-1">
            <Zap className="h-3 w-3 mr-1" />
            Most Popular
          </Badge>
        </div>
      )}
      
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold">{price}</span>
          {period && <span className="text-muted-foreground ml-1">{period}</span>}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1">
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      
      <CardFooter>
        <Button 
          variant={buttonVariant}
          className="w-full"
          onClick={onSelect}
          disabled={loading}
        >
          {loading ? 'Processing...' : buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
}