'use client';

import { CheckoutButton } from '@/components/payments/checkout-button';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const creditOptions = [
  ...(process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_3K
    ? [{ credits: 3000, price: 1.00, productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_3K, slug: 'Credits-3000' }]
    : []),
  ...(process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K
    ? [{ credits: 10000, price: 10.00, productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K, slug: 'Credits-10000' }]
    : []),
  ...(process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K
    ? [{ credits: 20000, price: 20.00, productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K, slug: 'Credits-20000' }]
    : []),
];

export default function PricingPage() {
  const [selectedCredits, setSelectedCredits] = useState<number>(creditOptions[0]?.credits ?? 10000);

  const selectedOption = creditOptions.find(option => option.credits === selectedCredits) || creditOptions[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Credit Package
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Pay only for the email credits you need. No monthly commitments, just flexible credit-based pricing.
          </p>
        </div>

        {/* Credit Selection */}
        <div className="max-w-md mx-auto mb-12">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Credit Package
          </label>
          <Select value={selectedCredits.toString()} onValueChange={(value) => setSelectedCredits(parseInt(value))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose credit package" />
            </SelectTrigger>
            <SelectContent>
              {creditOptions.map((option) => (
                <SelectItem key={option.credits} value={option.credits.toString()}>
                  {option.credits.toLocaleString()} credits - ${option.price.toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pricing Card */}
        <div className="max-w-md mx-auto">
          <div className="relative">
            {selectedCredits === 50000 && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                  <span>⚡</span>
                  Most Popular
                </div>
              </div>
            )}
            <div className={`bg-white rounded-xl border-2 p-8 shadow-lg ${selectedCredits === 50000 ? 'border-primary scale-105' : 'border-gray-200'}`}>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Email Credits</h3>
                <p className="text-gray-600 mb-4">Pay-as-you-need email credit system</p>
                <div className="text-4xl font-bold text-gray-900">
                  ${selectedOption.price.toFixed(2)}
                </div>
              </div>
              
              <ul className="space-y-3 mb-8">
                {[
                  `${selectedOption.credits.toLocaleString()} email credits`,
                  'Credits never expire',
                  'Use credits for any email campaigns',
                  'Advanced analytics and tracking',
                  'Priority email support',
                  'Custom templates included',
                ].map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <CheckoutButton
                productId={selectedOption.productId}
                successUrl="/billing?success=true"
                cancelUrl="/pricing?cancelled=true"
                metadata={{
                  credits: selectedOption.credits,
                  slug: selectedOption.slug,
                }}
                className="w-full"
              >
                Purchase {selectedOption.credits.toLocaleString()} Credits
              </CheckoutButton>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-20 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            Frequently Asked Questions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold mb-2">How do email credits work?</h3>
              <p className="text-gray-600">
                Each email sent consumes one credit. Buy credits in bulk and use them as needed - they never expire.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
              <p className="text-gray-600">
                We accept all major credit cards and PayPal through our secure payment processor Polar.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold mb-2">Do credits expire?</h3>
              <p className="text-gray-600">
                No, your email credits never expire. Buy once and use them whenever you need to send campaigns.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold mb-2">Can I buy more credits anytime?</h3>
              <p className="text-gray-600">
                Yes, you can purchase additional credit packages anytime to top up your account balance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}