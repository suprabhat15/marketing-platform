import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  content: z.string().min(1),
  listId: z.string(),
  templateId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  subscriberIds: z.array(z.string()).min(1, 'At least one subscriber must be selected'),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
  status: z.enum(['DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED']).optional(),
});

export type CreateCampaignData = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignData = z.infer<typeof updateCampaignSchema>;