import { z } from 'zod';

export const createListSchema = z.object({
  name: z.string().min(1, 'List name is required'),
  description: z.string().optional(),
  subscribers: z.array(z.object({
    email: z.string().email('Invalid email address'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    status: z.enum(['ACTIVE', 'UNSUBSCRIBED']).optional(),
  })).optional(),
});

export const editListSchema = z.object({
  name: z.string().min(1, 'List name is required'),
  description: z.string().optional(),
});

export const updateListSchema = z.object({
  name: z.string().min(1, 'List name is required'),
  description: z.string().optional(),
  subscribers: z.array(z.object({
    id: z.string().optional(),
    email: z.string().email('Invalid email address'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    status: z.enum(['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED']),
  })).optional(),
});

export const updateListBasicSchema = z.object({
  name: z.string().min(1, 'List name is required'),
  description: z.string().optional(),
});

export type CreateListData = z.infer<typeof createListSchema>;
export type UpdateListData = z.infer<typeof updateListSchema>;