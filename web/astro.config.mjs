import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://locatour.com.au',
  output: 'static',
  integrations: [sitemap()],
});
