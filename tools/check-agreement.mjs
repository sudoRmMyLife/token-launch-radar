// Agreement check: the dashboard's own copy of the model (the section of dashboard/app.js
// between the model markers) must reproduce, for every row of the board, the implied value
// lib/model.ts computed and the farm plan lib/model.ts wrote to board.json. Run:
//   node tools/check-agreement.mjs [snapshot.json]
import { readFileSync } from 'node:fs';
import { buildRadar, farmSteps, parseSnapshot, stepText } from '../lib/model.ts';

const snapshotPath = process.argv[2] ?? new URL('../../token-radar-01-kit/input/snapshot.json', import.meta.url).pathname;
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

const appJs = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
const begin = appJs.indexOf('/* == model == */');
const end = appJs.indexOf('/* == end model == */');
if (begin < 0 || end < 0 || end <= begin) {
  process.stderr.write('check-agreement: the model markers are missing from dashboard/app.js\n');
  process.exit(1);
}
const section = appJs.slice(begin, end);
const jsModel = new Function(`${section}; return { impliedOf, farmSteps };`)();

let badValues = 0;
let badSteps = 0;
for (const row of board) {
  const radarRow = radar.rows.find((r) => r.slug === row.slug);
  const recomputed = jsModel.impliedOf(radarRow);
  if (recomputed !== row.implied_value_usd) {
    if (badValues < 5) process.stderr.write(`check-agreement: ${row.slug}: page recomputes ${recomputed}, board carries ${row.implied_value_usd}\n`);
    badValues++;
  }
  const tsSteps = farmSteps(bySlug.get(row.slug), row.age_days).map(stepText);
  const jsSteps = jsModel.farmSteps(radarRow, radarRow.age_days);
  if (JSON.stringify(tsSteps) !== JSON.stringify(jsSteps)) {
    if (badSteps < 5) {
      process.stderr.write(`check-agreement: ${row.slug}: farm plans differ\n  board: ${tsSteps[1]}\n  page:  ${jsSteps[1]}\n`);
    }
    badSteps++;
  }
}
if (badValues > 0 || badSteps > 0) {
  process.stderr.write(`check-agreement: ${badValues} value mismatches, ${badSteps} farm-plan mismatches over ${board.length} rows\n`);
  process.exit(1);
}
process.stdout.write(`check-agreement: page and board agree on all ${board.length} rows (values and farm plans)\n`);
