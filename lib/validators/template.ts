import { z } from 'zod';

export const createTemplateSchema = z.object({
    name: z.string().min(1).max(100),
    subject: z.string().min(1).max(200),
    content: z.string().min(1),
    attachments: z.array(z.object({
      name: z.string(),
      size: z.number(),
      type: z.string(),
      url: z.string(),
    })).optional(),
});

export const templateUpdateSchema = z.object({
    name: z.string().min(1, 'Template name is required'),
    subject: z.string().min(1, 'Subject is required'),
    content: z.string().min(1, 'Content is required'),
    attachments: z.array(z.object({
      name: z.string(),
      size: z.number(),
      type: z.string(),
      url: z.string(),
    })).optional(),
});

export const templateSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Template name is required'),
    subject: z.string().min(1, 'Subject is required'),
    htmlContent: z.string().min(1, 'HTML content is required'),
    textContent: z.string().optional(),
});


export type Template = z.infer<typeof templateSchema>;
