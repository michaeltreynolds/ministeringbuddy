import { defineConfig } from 'wxt';

// `--mode bridge` adds the development bridge. Store builds must never contain it;
// scripts/check-store-build.mjs fails the build if any trace of it ships.
const BRIDGE_ENTRYPOINTS = new Set(['background', 'bridge']);

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
  manifest: ({ mode }) => ({
    name: 'Ministering Buddy',
    description: 'Makes ministering changes easier for an elders quorum presidency. Not an official Church application.',
    ...(mode === 'bridge'
      ? {
          name: 'Ministering Buddy (dev bridge)',
          permissions: ['alarms'],
          host_permissions: ['https://lcr.churchofjesuschrist.org/*', 'http://127.0.0.1:8766/*'],
        }
      : {}),
  }),
  hooks: {
    'entrypoints:resolved': (wxt, entrypoints) => {
      if (wxt.config.mode === 'bridge') return;
      for (let i = entrypoints.length - 1; i >= 0; i--) {
        if (BRIDGE_ENTRYPOINTS.has(entrypoints[i].name)) entrypoints.splice(i, 1);
      }
    },
  },
});
