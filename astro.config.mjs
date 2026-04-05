import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dewanggogte.com/games/bugs',
  integrations: [
    sitemap({
      filter: (page) => page.includes('/games/bugs/'),
      customPages: [
        'https://dewanggogte.com/games/bugs/',
        'https://dewanggogte.com/games/bugs/play/',
        'https://dewanggogte.com/games/bugs/leaderboard/',
      ],
    }),
  ],
  build: {
    assets: '_wtb',
  },
});
