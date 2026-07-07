import { Home as HomeIcon, FileText, Languages, Users, FlaskConical } from 'lucide-react';

// SINGLE SOURCE OF TRUTH for built-in landing pages.
// Used by the Pages tab (directory + CMS) AND the Split Test tab. Any page added
// here automatically becomes available to A/B split-test — no other edits needed.
// `editor` marks pages with an inline content CMS (preview + publish).
export const PAGE_GROUPS = [
  {
    title: 'Home Pages',
    pages: [
      { key: 'home', label: 'Home (Main Landing)', path: '/', icon: HomeIcon, desc: 'Primary English landing page.', editor: 'home' },
      { key: 'sp', label: 'Spanish Landing', path: '/sp', icon: Languages, desc: 'Full Spanish funnel (source = sp).', editor: 'sp' },
    ],
  },
  {
    title: 'PA Pages',
    pages: [
      { key: 'pa', label: 'PA Advertorial (English)', path: '/pa', icon: FileText, desc: 'Presell / advertorial page (source = lapa).', editor: 'pa' },
      { key: 'spa', label: 'PA Advertorial (Spanish)', path: '/spa', icon: Languages, desc: 'Spanish presell / advertorial page (source = laspa).', editor: 'spa' },
    ],
  },
  {
    title: 'Demand Gen Pages',
    pages: [
      { key: 'dg', label: 'Demand Gen Video Calls (English)', path: '/dg', icon: FileText, desc: 'Demand Gen video-calls advertorial · calls (833) 240-9312 · source = dg.', editor: 'dg' },
      { key: 'dgs', label: 'Demand Gen Spanish Video Calls', path: '/dgs', icon: Languages, desc: 'Spanish Demand Gen video-calls advertorial · calls (833) 868-1802 · source = dgs.', editor: 'dgs' },
    ],
  },
  {
    title: 'Team Pages',
    pages: [
      { key: 'tm', label: 'Team Attorneys — Overlay', path: '/tm', icon: Users, desc: 'Full-bleed attorney team hero · "See If You Qualify" · source = tm.', editor: 'tm' },
      { key: 'tm2', label: 'Team Attorneys — Split', path: '/tm2', icon: Users, desc: 'Split attorney team hero · "Check Your Vehicle" · source = tm2.', editor: 'tm2' },
    ],
  },
  {
    title: 'Split Tests',
    pages: [
      { key: 'split', label: 'A/B Split Test Entry', path: '/split', icon: FlaskConical, desc: 'Routes visitors between pages by your split weight (managed in the Split Test tab).' },
    ],
  },
];

// Flat list of real landing pages that can be A/B split-tested (excludes the
// /split entry itself, which is the router — not a testable destination).
export const SPLIT_TESTABLE_PAGES = PAGE_GROUPS
  .flatMap((g) => g.pages)
  .filter((p) => p.key !== 'split')
  .map((p) => ({ label: p.label, path: p.path }));
