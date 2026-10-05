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

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).catch(25).default(25),
});

export type PaginationParams = z.infer<typeof paginationSchema>;