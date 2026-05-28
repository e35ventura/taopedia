import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    categories: z.array(z.string()).default([]),
    summary: z.string().optional(),
    redirects: z.array(z.string()).optional(),
    draft: z.boolean().optional().default(false),
    featured: z.boolean().optional().default(false),
    infoboxTitle: z.string().optional(),
    infoboxImage: z.string().optional(),
    infoboxCaption: z.string().optional(),
    infoboxRows: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      )
      .optional(),
    coverImage: z.string().optional(),
  }),
});

export const collections = { pages };
