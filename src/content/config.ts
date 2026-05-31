// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    image: z.string().optional(),
  }),
});

const changelog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tag: z.enum(['Multiplayer', 'Daily', 'Learning', 'Modes', 'Profile', 'UI']).optional(),
  }),
});

export const collections = { blog, changelog };
