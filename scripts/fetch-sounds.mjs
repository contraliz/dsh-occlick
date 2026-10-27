/**
 * Download the OpenCode sound library into `assets/audio`.
 *
 * The files come from the `anomalyco/opencode` monorepo at
 * `packages/ui/src/assets/audio`, which is MIT-licensed. This script is a
 * maintainer tool: the downloaded files are committed, so a normal build never
 * needs the network.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '..', 'assets', 'audio');
const repo = 'anomalyco/opencode';
const source = 'packages/ui/src/assets/audio';

const headers = { 'user-agent': 'dsh-occlick-build' };
// Optional: a token lifts GitHub's unauthenticated rate limit. Never committed.
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function github(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const entries = await github(`https://api.github.com/repos/${repo}/contents/${source}?ref=dev`);
const sounds = entries
  .filter((entry) => entry.name.endsWith('.mp3'))
  .sort((left, right) => left.name.localeCompare(right.name));

mkdirSync(output, { recursive: true });
let written = 0;
for (const sound of sounds) {
  const destination = join(output, sound.name);
  if (existsSync(destination)) continue;
  const blob = await github(`https://api.github.com/repos/${repo}/git/blobs/${sound.sha}`);
  const bytes = Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8');
  writeFileSync(destination, bytes);
  written += 1;
  console.log(`${sound.name} ${bytes.length} bytes`);
}
console.log(`downloaded ${written} of ${sounds.length} sounds into ${output}`);
