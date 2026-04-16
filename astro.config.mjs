import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dewanggogte.com/games/bugs',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      serialize(item) {
        // The sitemap plugin uses only the origin from the site config,
        // but the site is deployed at /games/bugs/. Prepend the base path.
        item.url = item.url.replace(
          'https://dewanggogte.com/',
          'https://dewanggogte.com/games/bugs/'
        );
        return item;
      },
    }),
  ],
  build: {
    assets: '_wtb',
  },
});
