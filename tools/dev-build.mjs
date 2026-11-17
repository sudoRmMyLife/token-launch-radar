// Dev build for screenshots: writes board.json, data.js and a copy of dashboard/ into the
// directory named by the first argument, without screenshots or a dossier, so the page can be
// rendered and photographed before the real handoff run. Not part of the entry's run.
//   node tools/dev-build.mjs /tmp/radar-out [snapshot.json]
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadar, dataScript, parseSnapshot } from '../lib/model.ts';

const out = process.argv[2];
if (!out) {
  process.stderr.write('dev-build: name an output directory\n');
  process.exit(2);
}
const snapshotPath = process.argv[3] ?? new URL('../../token-radar-01-kit/input/snapshot.json', import.meta.url).pathname;
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
mkdirSync(join(out, 'dashboard'), { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
const dashDir = new URL('../dashboard/', import.meta.url).pathname;
for (const name of readdirSync(dashDir)) copyFileSync(join(dashDir, name), join(out, 'dashboard', name));
process.stdout.write(`dev-build: ${board.length} rows, top is ${board[0].slug} at $${board[0].implied_value_usd.toLocaleString('en-US')}\n`);
