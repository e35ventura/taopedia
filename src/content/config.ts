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
    // Optional Wikipedia-like infobox metadata
    infoboxTitle: z.string().optional(),
    infoboxImage: z.string().optional(), // URL or public path for now
    infoboxCaption: z.string().optional(),
    infoboxRows: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      )
      .optional(),
    // Optional cover image for infobox when using frontmatter in MD/MDX
    coverImage: z.string().optional(),
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
