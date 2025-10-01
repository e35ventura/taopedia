import { defineCollection, z } from 'astro:content';

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    categories: z.array(z.string()).default([]),
    summary: z.string().optional(),
    redirects: z.array(z.string()).optional(),
    draft: z.boolean().optional().default(false),
    featured: z.boolean().optional().default(false),
  }),
});

const categories = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
  }),
});

export const collections = { pages, categories };
