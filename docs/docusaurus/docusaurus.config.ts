import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Proforma Platform Docs',
  tagline: 'Documentacao tecnica e de governanca da Proforma Platform',
  favicon: 'img/brand/mark.svg',
  future: {
    v4: true,
  },
  url: 'https://docs.proforma.net.br',
  baseUrl: '/',
  organizationName: 'proforma',
  projectName: 'proforma-platform',
  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    image: 'img/brand/logo.svg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Proforma Docs',
      logo: {
        alt: 'Proforma Logo',
        src: 'img/brand/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentacao',
          items: [
            {
              label: 'Introducao',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Plataforma',
          items: [
            {
              label: 'Site Institucional',
              href: 'https://proforma.net.br',
            },
            {
              label: 'Portal',
              href: 'https://portal.proforma.net.br',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Proforma Platform.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
