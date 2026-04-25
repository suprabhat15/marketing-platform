import { z } from 'zod';

export const subscriberSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  status: z.enum(['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED']).optional(),
});

export const createSubscriberSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const addSubscriberSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const updateSubscriberSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  status: z.enum(['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED']).optional(),
  campaignId: z.string().optional(),
});

export const bulkSubscribersSchema = z.array(subscriberSchema);
export const importSubscribersSchema = z.object({
  subscribers: bulkSubscribersSchema,
});

export type SubscriberData = z.infer<typeof subscriberSchema>;
export type CreateSubscriberData = z.infer<typeof createSubscriberSchema>;
export type UpdateSubscriberData = z.infer<typeof updateSubscriberSchema>;
export type AddSubscriberData = z.infer<typeof addSubscriberSchema>;
