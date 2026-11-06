import { defineConfig } from 'wxt';
import { EXTENSION_PUBLIC_KEY, OAUTH_CLIENT_ID, OAUTH_SCOPES } from './src/config';

// `--mode bridge` adds the development bridge. Store builds must never contain it;
// scripts/check-store-build.mjs fails the build if any trace of it ships.
const BRIDGE_ENTRYPOINTS = new Set(['bridge']);

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
  manifest: ({ mode }) => ({
    name: mode === 'bridge' ? 'Ministering Buddy (dev bridge)' : 'Ministering Buddy',
    description: 'Makes ministering changes easier for an elders quorum presidency. Not an official Church application.',
    key: EXTENSION_PUBLIC_KEY,
    permissions: ['identity', ...(mode === 'bridge' ? ['alarms'] : [])],
    host_permissions: [
      'https://firestore.googleapis.com/*',
      ...(mode === 'bridge' ? ['https://lcr.churchofjesuschrist.org/*', 'http://127.0.0.1:8766/*'] : []),
    ],
    ...(OAUTH_CLIENT_ID ? { oauth2: { client_id: OAUTH_CLIENT_ID, scopes: OAUTH_SCOPES } } : {}),
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
