// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

// Public home of the Locatour wiki. Deployed as a static site to
// docs.locatour.com.au (separate from the Laravel API and the Expo app).
// Content lives as Markdown in src/content/docs/**.
export default defineConfig({
  site: 'https://docs.locatour.com.au',
  integrations: [
    starlight({
      title: 'Locatour',
      favicon: '/favicon.png',
      tagline: 'Creating memorable experiences.',
      description:
        'Locatour is a real-world exploration game: visit public parks, lookouts, ' +
        'beaches and hidden places, check in with a photo, and level up. This is the ' +
        'official guide to how it works, plus our privacy and trust commitments.',
      logo: {
        src: './src/assets/logo-mark.svg',
        alt: 'Locatour',
        replacesTitle: false,
      },
      customCss: ['./src/styles/brand.css'],
      // Site-wide structured data so search/answer engines understand the brand.
      head: [
        // Rounded, friendly type to match locatour.com.au
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;500;600;700;800&display=swap',
          },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Locatour',
            url: 'https://docs.locatour.com.au',
            slogan: 'Creating memorable experiences.',
            description:
              'A real-world exploration game that rewards visiting public outdoor places.',
          }),
        },
      ],
      social: [],
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { label: 'What is Locatour?', slug: 'start/what-is-locatour' },
            {
              label: 'Creating Memorable Experiences',
              slug: 'start/memorable-experiences',
            },
          ],
        },
        {
          label: 'How to Play',
          items: [
            { label: 'Getting started', slug: 'play/getting-started' },
            { label: 'Finding & unlocking locations', slug: 'play/locations' },
            { label: 'Hidden locations', slug: 'play/hidden-locations' },
            { label: 'Photo check-ins', slug: 'play/photo-checkins' },
            { label: 'Nearby alerts', slug: 'play/nearby-alerts' },
            { label: 'Levels, tiers & progression', slug: 'play/progression' },
            { label: 'Rewards & recognition', slug: 'play/rewards' },
            { label: 'Becoming a contributor', slug: 'play/contributors' },
          ],
        },
        {
          label: 'Tech & Trust',
          items: [
            { label: 'Why we built it this way', slug: 'trust/why' },
            { label: 'How photo check-in works', slug: 'trust/photo-checkin-tech' },
            { label: 'Your data & security', slug: 'trust/data-and-security' },
          ],
        },
        {
          label: 'Help',
          items: [{ label: 'FAQ', slug: 'help/faq' }],
        },
        {
          label: 'Legal',
          items: [
            { label: 'Privacy Policy', slug: 'legal/privacy' },
            { label: 'Terms & Conditions', slug: 'legal/terms' },
            { label: 'Delete Your Account & Data', slug: 'legal/data-deletion' },
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
