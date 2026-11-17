// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token and is not a wrapped, staked or bridged
// product of a token that already trades (the watchlist's own product filters, applied to the whole
// snapshot instead of only above its $50M floor). Protocols whose token already trades are set
// aside as the comparable set: they are the evidence the model prices from, never rows of the board.
//
// Implied value is a comparable-companies estimate, in the open:
//
//   multiple(category) = (n x category median + 6 x global median) / (n + 6)
//     over the comparable set's market-cap / TVL ratios, so a category with many traded peers
//     speaks for itself and a thin one is shrunk toward the whole market's 0.25x. Each ratio is
//     capped at the market's 90th percentile first: above it a token's cap is set by something
//     other than the protocol's TVL and cannot price a launch.
//   implied = round( tvl_usd x multiple x momentum x maturity x breadth )
//     momentum = 1 + clamp(change_7d, -40, 60) / 200      (a hot week is worth up to +30%)
//     maturity = 0.85 + 0.30 x min(age_days, 1095) / 1095 (time survived with no token counts)
//     breadth  = 1 + 0.025 x min(chains - 1, 6)           (distribution is worth up to +15%)
//
// Every row also carries the range the same arithmetic gives at the category's 25th and 75th
// percentile multiples, and a confidence grade from the size of its comparable set, so a reader
// can see which numbers rest on nine traded peers and which rest on two. No protocol name is
// special-cased anywhere: the same functions score every row, and the dashboard recomputes each
// row from the figures data.js carries and shows the check.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, stated on the dashboard. */
export const MODEL_VERSION = 'launch-radar-2';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 40;

/** Prior weight of the global median in a category's shrunk multiple: n real peers outweigh it. */
export const SHRINK_PRIOR = 6;

/** A comparable's market-cap/TVL ratio is capped at this quantile of the market's own ratios
 * before any median is taken. Above that line a token's cap is set by something other than the
 * protocol's TVL — a platform token, a legacy entry whose TVL left while its token stayed — and
 * such a ratio cannot price another protocol's launch. In this snapshot the uncapped top ratio
 * is 400x; the cap sits near 3x. */
export const RATIO_CAP_QUANTILE = 0.9;

/** Categories that are products of another protocol's token, never launches of their own. */
export const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a launch candidate: pre-token and not a product of a traded token. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || PRODUCT_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

// ------------------------------------------------------------------ comparables

/** One category's comparable evidence: how many traded peers, and their value/TVL spread. */
export interface CategoryStats {
  category: string;
  comps: number;
  median: number;
  p25: number;
  p75: number;
  multiple: number;
  confidence: 'High' | 'Medium' | 'Low';
}

/** The comparable set: protocols whose token trades, with a market cap and TVL to ratio. */
export function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** A quantile of a sorted array, by linear interpolation between closest ranks. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Every category's stats, plus the market-wide fallback under the key ''. Each comparable's
 * ratio is first capped at the market's RATIO_CAP_QUANTILE, so one broken ratio cannot set a
 * category's price. */
export function categoryStats(snapshot: Snapshot): Map<string, CategoryStats> {
  const byCategory = new Map<string, number[]>();
  const raw: number[] = [];
  for (const p of comparables(snapshot)) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    raw.push(ratio);
    const key = p.category ?? '';
    const list = byCategory.get(key);
    if (list) list.push(ratio);
    else byCategory.set(key, [ratio]);
  }
  const cap = quantile([...raw].sort((a, b) => a - b), RATIO_CAP_QUANTILE);
  const all = raw.map((r) => Math.min(r, cap));
  for (const [key, ratios] of byCategory) byCategory.set(key, ratios.map((r) => Math.min(r, cap)));
  all.sort((a, b) => a - b);
  const globalMedian = quantile(all, 0.5);
  const globalP25 = quantile(all, 0.25);
  const globalP75 = quantile(all, 0.75);
  const make = (category: string, ratios: number[]): CategoryStats => {
    const sorted = [...ratios].sort((a, b) => a - b);
    const n = sorted.length;
    const median = n > 0 ? quantile(sorted, 0.5) : globalMedian;
    const multiple = (n * median + SHRINK_PRIOR * globalMedian) / (n + SHRINK_PRIOR);
    return {
      category,
      comps: n,
      median: round4(median),
      p25: round4(n > 0 ? quantile(sorted, 0.25) : globalP25),
      p75: round4(n > 0 ? quantile(sorted, 0.75) : globalP75),
      multiple: round4(multiple),
      confidence: n >= 8 ? 'High' : n >= 4 ? 'Medium' : 'Low',
    };
  };
  const out = new Map<string, CategoryStats>();
  out.set('', make('', all));
  for (const [key, ratios] of byCategory) out.set(key, make(key, ratios));
  return out;
}

/** The stats a protocol prices from: its category's, or the market's when it names none. */
export function statsFor(stats: Map<string, CategoryStats>, category: string | null): CategoryStats {
  return stats.get(category ?? '') ?? stats.get('')!;
}

// ------------------------------------------------------------------ valuation

const DAY_MS = 86_400_000;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** One protocol's full valuation: the point estimate, its range, and every factor that made it. */
export interface Valuation {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  momentum: number;
  maturity: number;
  breadth: number;
  age: number | null;
  stats: CategoryStats;
}

/** The model's arithmetic for one protocol, exactly as the dashboard states and recomputes it. */
export function valueProtocol(p: SnapshotProtocol, asOf: string, stats: Map<string, CategoryStats>): Valuation {
  const st = statsFor(stats, p.category);
  const age = ageDays(asOf, p.listed_at);
  const chg = p.change_7d === null ? 0 : Math.min(60, Math.max(-40, p.change_7d));
  const momentum = 1 + chg / 200;
  const ageForModel = age ?? 365;
  const maturity = 0.85 + 0.3 * (Math.min(Math.max(ageForModel, 0), 1095) / 1095);
  const breadth = 1 + 0.025 * Math.min(Math.max(p.chains.length - 1, 0), 6);
  const factors = momentum * maturity * breadth;
  const implied = Math.max(1, Math.round(p.tvl_usd * st.multiple * factors));
  // The range is the same arithmetic at the category's 25th and 75th percentile multiples,
  // shrunk toward the market's percentiles exactly as the median is shrunk — an unshrunk range
  // would sit outside the shrunk point estimate it is meant to bracket — and clamped so the
  // estimate always sits inside it. A category with one traded peer has no spread to show, and
  // its range honestly collapses onto the estimate; the confidence grade carries that warning.
  const g = stats.get('')!;
  const n = st.comps;
  const shrunkP25 = (n * st.p25 + SHRINK_PRIOR * g.p25) / (n + SHRINK_PRIOR);
  const shrunkP75 = (n * st.p75 + SHRINK_PRIOR * g.p75) / (n + SHRINK_PRIOR);
  const low = Math.min(implied, Math.max(1, Math.round(p.tvl_usd * shrunkP25 * factors)));
  const high = Math.max(implied, Math.max(1, Math.round(p.tvl_usd * shrunkP75 * factors)));
  return {
    implied,
    low,
    high,
    multiple: st.multiple,
    momentum: round4(momentum),
    maturity: round4(maturity),
    breadth: round4(breadth),
    age,
    stats: st,
  };
}

// ------------------------------------------------------------------ farm plans

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and recheck it weekly.`;
  return s;
}

/** Estimated gas for one on-chain action, in dollars, by the chain it happens on. */
export function gasFor(chain: string): number {
  switch (chain) {
    case 'Ethereum': return 6;
    case 'Solana': return 0.05;
    case 'Base': return 0.15;
    case 'Arbitrum': return 0.25;
    case 'Optimism': return 0.25;
    case 'BNB Chain': return 0.4;
    case 'Polygon': return 0.05;
    case 'Avalanche': return 0.3;
    case 'zkSync Era': return 0.2;
    case 'Linea': return 0.2;
    case 'Scroll': return 0.25;
    case 'Mantle': return 0.1;
    case 'Blast': return 0.15;
    default: return 1;
  }
}

/** The first chain a protocol names, or a neutral phrase. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  return 100;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

const money = (n: number): string => (n < 1 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`);

/** The category's core qualifying action, in words a farmer can follow. */
export function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply ${money(capital)} of USDC as collateral to ${n} on ${chain}, borrow ${money(Math.round(capital / 2))} against it at under 55% loan-to-value, and re-supply the borrowed funds so both sides of the market see your wallet`;
  }
  if (c.includes('derivative') || c.includes('perpetual')) {
    return `Deposit ${money(capital)} of USDC margin on ${n} (${chain}) and run a hedged pair, one long and one short of equal size, so the account builds real trading volume without directional risk`;
  }
  if (c.includes('dex')) {
    return `Add ${money(capital)} of liquidity to ${n}'s busiest stablecoin pool on ${chain}, split evenly across the pool's two assets, and leave the LP position in place`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Split ${money(capital)} across two of ${n}'s curated vaults on ${chain}, about 60/40, and keep the vault shares in the wallet that deposited them`;
  }
  if (c.includes('basis')) {
    return `Deposit ${money(capital)} of USDC into ${n}'s basis vault on ${chain} and hold the delta-neutral position it opens for you`;
  }
  if (c.includes('rwa')) {
    return `Subscribe ${money(capital)} to ${n}'s tokenised yield asset on ${chain} and hold the asset in your wallet rather than moving it on`;
  }
  if (c.includes('chain')) {
    return `Bridge ${money(capital)} to ${n}'s chain, keep a small balance of its gas token, and put the rest to work in the chain's own lending market or DEX`;
  }
  if (c.includes('prediction')) {
    return `Fund ${n} with ${money(capital)} on ${chain} and take positions in its most liquid markets, trading both sides over the week rather than one outright bet`;
  }
  if (c.includes('insurance')) {
    return `Buy ${money(capital)} of cover from ${n} on ${chain} against a lending position you actually hold, and keep the policy to term`;
  }
  if (c.includes('index')) {
    return `Mint ${money(capital)} of ${n}'s index basket on ${chain} and hold the basket token in your wallet`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake ${money(capital)} of ${chain}'s staking asset through ${n} and keep the staking receipt in the same wallet`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Deposit ${money(capital)} with ${n} on ${chain} and route your ordinary spending or transfers through it, a few real transactions each week`;
  }
  if (c.includes('stable')) {
    return `Mint ${money(capital)} of ${n}'s stable asset on ${chain} against your collateral and hold or lend the minted asset inside the same product`;
  }
  if (c.includes('btc')) {
    return `Deposit ${money(capital)} of bitcoin-side collateral with ${n} on ${chain} and hold the position it issues against it`;
  }
  return `Deposit ${money(capital)} of USDC into ${n}'s main product on ${chain} and keep the position open`;
}

/** The recurring weekly action that keeps a farm position qualifying, by category. */
export function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `adjust the borrow once a week so the health factor stays above 1.8, and vote in ${n}'s governance when a vote is open`;
  if (c.includes('derivative') || c.includes('perpetual')) return `roll the hedged pair once a week, which adds about five times your margin in fresh volume`;
  if (c.includes('dex')) return `make two or three swaps a week through ${n}'s own interface, a tenth of your position each, so the wallet shows trading activity as well as liquidity`;
  if (c.includes('prediction')) return `trade at least two markets a week on ${n}, closing each position before it settles`;
  if (c.includes('chain')) return `use two of the chain's native apps each week, one swap and one lend, from the same wallet`;
  return `make one small qualifying action a week in ${n}, a deposit top-up, a claim or a governance vote, so the wallet never looks dormant`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) by the same function the dashboard runs.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weekly = weeklyAction(p);
  return [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it on ${chain}, and keep its seed phrase offline; never farm from a wallet that holds your main funds`,
      cost: `about ${money(gas * 2)} of gas to fund and make the first transaction`,
      time: '10 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `${money(capital)} of capital plus about ${money(gas * 2)} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: `Every week, ${weekly}`,
      cost: `about ${money(gas * 3)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days; a position opened and closed inside one week is the pattern points programs filter out first, and the capital is at smart-contract risk the whole time`,
      cost: `the ${money(capital)} stays in the position, and only farm what you can afford to lose`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, open ${p.name}'s own points or rewards page from its official site and read what it counts; claim only from a link the protocol itself publishes, and never pay a fee or sign a blind approval to claim`,
      cost: 'no fee to check',
      time: '10 minutes a month',
    },
    {
      text: `Keep a farm log with the wallet, dates and transaction hashes, and set your exit: withdraw if ${p.name}'s TVL falls more than 30% in a week twice running, or hold to the date if the team announces a snapshot`,
      cost: 'nothing but the log',
      time: '5 minutes to keep',
    },
  ];
}

// ------------------------------------------------------------------ the board

/** One row of board.json: the ranked board's row, with the model's working shown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    comp_multiple: number;
    comp_count: number;
    comp_median: number;
    confidence: 'High' | 'Medium' | 'Low';
    momentum_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row: everything the page renders, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  comp_multiple: number;
  comp_count: number;
  confidence: 'High' | 'Medium' | 'Low';
  momentum_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the page shows the market's own figures. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  multiple: number | null;
  change_7d: number | null;
}

/** One category's evidence, for the dashboard's methodology table. */
export interface CategoryRow {
  category: string;
  comps: number;
  median: number;
  multiple: number;
  board_rows: number;
}

/** Everything the dashboard needs: the board, the live set, the category evidence and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  shrink_prior: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comp_size: number;
  global_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryRow[];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const stats = categoryStats(snapshot);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => ({ p, v: valueProtocol(p, snapshot.as_of, stats), watch: watch.has(p.slug) }));
  scored.sort(
    (a, b) =>
      b.v.implied - a.v.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    model: {
      comp_multiple: s.v.multiple,
      comp_count: s.v.stats.comps,
      comp_median: s.v.stats.median,
      confidence: s.v.stats.confidence,
      momentum_multiplier: s.v.momentum,
      maturity_multiplier: s.v.maturity,
      breadth_multiplier: s.v.breadth,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watch: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    comp_multiple: row.model.comp_multiple,
    comp_count: row.model.comp_count,
    confidence: row.model.confidence,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist: watch.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const stats = categoryStats(snapshot);
  const watch = new Set(snapshot.watchlist);
  const boardByCategory = new Map<string, number>();
  for (const r of board) boardByCategory.set(r.category ?? '', (boardByCategory.get(r.category ?? '') ?? 0) + 1);
  const categories: CategoryRow[] = [...stats.entries()]
    .filter(([key]) => key !== '')
    .map(([category, st]) => ({
      category,
      comps: st.comps,
      median: st.median,
      multiple: st.multiple,
      board_rows: boardByCategory.get(category) ?? 0,
    }))
    .filter((c) => c.board_rows > 0)
    .sort((a, b) => b.board_rows - a.board_rows || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    shrink_prior: SHRINK_PRIOR,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    comp_size: comparables(snapshot).length,
    global_multiple: stats.get('')!.multiple,
    rows: board.map((r) => radarRow(r, watch)),
    live,
    categories,
  };
  return { board, radar };
}

// ------------------------------------------------------------------ the snapshot

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
