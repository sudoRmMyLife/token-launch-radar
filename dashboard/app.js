// Launch Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board with its filters, a live-token view set apart from the ranking, the model's
// method with the category evidence behind it, and a detail view per protocol. No network:
// every byte it shows is in data.js.
//
// The section between the model markers is the model itself, in the page's own copy: the detail
// view recomputes a row's implied value and its whole farm plan from the figures data.js
// carries, so what the page shows and what board.json holds are the same arithmetic, checked
// line by line against lib/model.ts by tools/check-agreement.mjs.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', band: 'all', tab: 'pre', sort: 'rank', dir: 1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }

  /* == model == */
  // The model's arithmetic, recomputed in the page from a row's own figures.
  function impliedOf(row) {
    var chg = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(60, Math.max(-40, row.change_7d));
    var momentum = 1 + chg / 200;
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var maturity = 0.85 + 0.3 * (Math.min(Math.max(age, 0), 1095) / 1095);
    var breadth = 1 + 0.025 * Math.min(Math.max((row.chains ? row.chains.length : 0) - 1, 0), 6);
    return Math.max(1, Math.round(row.tvl_usd * row.comp_multiple * momentum * maturity * breadth));
  }

  function gasFor(chain) {
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
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1000000000) return 500;
    if (p.tvl_usd >= 250000000) return 250;
    if (p.tvl_usd >= 50000000) return 150;
    return 100;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 75;
    if (age < 365) return 60;
    if (age < 730) return 45;
    return 30;
  }
  function money(n) { return n < 1 ? '$' + n.toFixed(2) : '$' + Math.round(n); }
  function coreAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return 'Supply ' + money(capital) + ' of USDC as collateral to ' + n + ' on ' + chain + ', borrow ' + money(Math.round(capital / 2)) + ' against it at under 55% loan-to-value, and re-supply the borrowed funds so both sides of the market see your wallet';
    }
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) {
      return 'Deposit ' + money(capital) + ' of USDC margin on ' + n + ' (' + chain + ') and run a hedged pair, one long and one short of equal size, so the account builds real trading volume without directional risk';
    }
    if (c.indexOf('dex') >= 0) {
      return 'Add ' + money(capital) + " of liquidity to " + n + "'s busiest stablecoin pool on " + chain + ", split evenly across the pool's two assets, and leave the LP position in place";
    }
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) {
      return 'Split ' + money(capital) + " across two of " + n + "'s curated vaults on " + chain + ', about 60/40, and keep the vault shares in the wallet that deposited them';
    }
    if (c.indexOf('basis') >= 0) {
      return 'Deposit ' + money(capital) + " of USDC into " + n + "'s basis vault on " + chain + ' and hold the delta-neutral position it opens for you';
    }
    if (c.indexOf('rwa') >= 0) {
      return 'Subscribe ' + money(capital) + " to " + n + "'s tokenised yield asset on " + chain + ' and hold the asset in your wallet rather than moving it on';
    }
    if (c.indexOf('chain') >= 0) {
      return 'Bridge ' + money(capital) + " to " + n + "'s chain, keep a small balance of its gas token, and put the rest to work in the chain's own lending market or DEX";
    }
    if (c.indexOf('prediction') >= 0) {
      return 'Fund ' + n + ' with ' + money(capital) + ' on ' + chain + ' and take positions in its most liquid markets, trading both sides over the week rather than one outright bet';
    }
    if (c.indexOf('insurance') >= 0) {
      return 'Buy ' + money(capital) + ' of cover from ' + n + ' on ' + chain + ' against a lending position you actually hold, and keep the policy to term';
    }
    if (c.indexOf('index') >= 0) {
      return 'Mint ' + money(capital) + " of " + n + "'s index basket on " + chain + ' and hold the basket token in your wallet';
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return 'Stake ' + money(capital) + " of " + chain + "'s staking asset through " + n + ' and keep the staking receipt in the same wallet';
    }
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) {
      return 'Deposit ' + money(capital) + ' with ' + n + ' on ' + chain + ' and route your ordinary spending or transfers through it, a few real transactions each week';
    }
    if (c.indexOf('stable') >= 0) {
      return 'Mint ' + money(capital) + " of " + n + "'s stable asset on " + chain + ' against your collateral and hold or lend the minted asset inside the same product';
    }
    if (c.indexOf('btc') >= 0) {
      return 'Deposit ' + money(capital) + ' of bitcoin-side collateral with ' + n + ' on ' + chain + ' and hold the position it issues against it';
    }
    return 'Deposit ' + money(capital) + " of USDC into " + n + "'s main product on " + chain + ' and keep the position open';
  }
  function weeklyAction(p) {
    var c = (p.category || '').toLowerCase();
    var n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return "adjust the borrow once a week so the health factor stays above 1.8, and vote in " + n + "'s governance when a vote is open";
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'roll the hedged pair once a week, which adds about five times your margin in fresh volume';
    if (c.indexOf('dex') >= 0) return "make two or three swaps a week through " + n + "'s own interface, a tenth of your position each, so the wallet shows trading activity as well as liquidity";
    if (c.indexOf('prediction') >= 0) return 'trade at least two markets a week on ' + n + ', closing each position before it settles';
    if (c.indexOf('chain') >= 0) return "use two of the chain's native apps each week, one swap and one lend, from the same wallet";
    return 'make one small qualifying action a week in ' + n + ', a deposit top-up, a claim or a governance vote, so the wallet never looks dormant';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Keep the position open and recheck it weekly.';
    return s;
  }
  function farmSteps(p, age) {
    var chain = chainOf(p);
    var gas = gasFor(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(age);
    var weekly = weeklyAction(p);
    return [
      {
        text: 'Set up a fresh wallet for ' + p.name + ' alone, fund it on ' + chain + ', and keep its seed phrase offline; never farm from a wallet that holds your main funds',
        cost: 'about ' + money(gas * 2) + ' of gas to fund and make the first transaction',
        time: '10 minutes'
      },
      {
        text: coreAction(p, capital, chain),
        cost: money(capital) + ' of capital plus about ' + money(gas * 2) + ' of gas',
        time: '20 minutes to set up'
      },
      {
        text: 'Every week, ' + weekly,
        cost: 'about ' + money(gas * 3) + ' of gas a week',
        time: '10 minutes a week'
      },
      {
        text: 'Hold the position for at least ' + hold + ' days; a position opened and closed inside one week is the pattern points programs filter out first, and the capital is at smart-contract risk the whole time',
        cost: 'the ' + money(capital) + ' stays in the position, and only farm what you can afford to lose',
        time: hold + ' days'
      },
      {
        text: "Once a month, open " + p.name + "'s own points or rewards page from its official site and read what it counts; claim only from a link the protocol itself publishes, and never pay a fee or sign a blind approval to claim",
        cost: 'no fee to check',
        time: '10 minutes a month'
      },
      {
        text: 'Keep a farm log with the wallet, dates and transaction hashes, and set your exit: withdraw if ' + p.name + "'s TVL falls more than 30% in a week twice running, or hold to the date if the team announces a snapshot",
        cost: 'nothing but the log',
        time: '5 minutes to keep'
      }
    ].map(stepText);
  }
  /* == end model == */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('band')) state.band = params.get('band');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.band !== 'all') params.set('band', state.band);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function inBand(tvl) {
    if (state.band === '1b') return tvl >= 1e9;
    if (state.band === '250m') return tvl >= 2.5e8 && tvl < 1e9;
    if (state.band === '50m') return tvl >= 5e7 && tvl < 2.5e8;
    if (state.band === 'sub50') return tvl < 5e7;
    return true;
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!inBand(r.tvl_usd)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.comp_multiple; bv = b.comp_multiple; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Model ' + DATA.model_version }),
        el('span', { text: DATA.comp_size + ' traded comparables' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.board_size + ' protocols with no token yet, ', el('span', { class: 'accent', text: 'ranked by what a token would be worth' })),
        el('p', { text: 'Every protocol in the snapshot that records no token and is not a wrapped or staked product of one that trades, priced from the ' + DATA.comp_size + ' protocols whose tokens do trade: TVL times the value-to-TVL multiple of its traded peers, adjusted for the week it is having, the years it has survived and the chains it runs on. The snapshot watchlist of ' + DATA.watchlist_size + ' is the floor, not the ceiling: ' + DATA.early_size + ' rows sit below its $50M line. An implied value is a model estimate, not a price and not a promise that a token will exist.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market multiple' }), el('b', { text: fmtMult(DATA.global_multiple) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, onchange) {
      var sel = el('select', { id: id, 'aria-label': label },
        values.map(function (v) {
          var o = el('option', { value: v[0], text: v[1] });
          if (v[0] === current) o.setAttribute('selected', 'selected');
          return o;
        })
      );
      sel.addEventListener('change', function () { onchange(sel.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
    }
    var catSel = select('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
    var chainSel = select('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c + ' (' + chainCounts[c] + ')']; })), state.chain, function (v) { state.chain = v; });
    var bandSel = select('band', 'TVL band', [['all', 'Any TVL'], ['1b', '$1B and up'], ['250m', '$250M to $1B'], ['50m', '$50M to $250M'], ['sub50', 'Under $50M']], state.band, function (v) { state.band = v; });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      catSel, chainSel, bandSel,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
        render();
      } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null)
    );
  }

  function confTag(r) {
    var cls = r.confidence === 'High' ? 'tag high' : r.confidence === 'Medium' ? 'tag med' : 'tag';
    return el('span', { class: cls, text: r.confidence + ' · ' + r.comp_count + ' peers' });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.band = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    max = max || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'no chain named') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.comp_multiple) }),
        el('td', null, el('div', null,
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, confTag(r), r.watchlist ? el('span', { class: 'tag watch', text: ' watchlist' }) : null)
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. Select any row for its valuation breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Peer multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Evidence' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorised') + (r.symbol ? ' · ' + r.symbol : '') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('span', { class: 'tag', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Set aside, not ranked: these protocols already have a token, so their market cap is a fact rather than a model. Their value-to-TVL multiples are the evidence the board prices from.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Value / TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var tbody = el('tbody');
    DATA.categories.slice(0, 14).forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { class: 'num', text: String(c.board_rows) })
      ));
    });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How the board prices a protocol that has no token' }),
      el('p', { text: 'A row is ranked if the snapshot records no token for it (no market cap, no CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product of a token that already trades: bridge, liquid staking and restaking wrappers, exchange products and versioned pools of other protocols are out, at any size. The watchlist applies the same test above a $50M floor; this board applies it to the whole snapshot, which is where the early rows come from.' }),
      el('div', { class: 'formula', text: 'implied = TVL x category multiple x momentum x maturity x breadth' }),
      el('p', { text: 'The category multiple is the median market-cap-to-TVL ratio of the category\'s traded protocols, shrunk toward the market-wide median (' + fmtMult(DATA.global_multiple) + ') with a prior of ' + DATA.shrink_prior + ' phantom peers, so a category with two traded names cannot price a board on two observations. Each peer\'s ratio is first capped at the market\'s 90th percentile: above it a token\'s cap is set by something other than the protocol\'s own TVL (one uncapped ratio in this snapshot is 400x, a platform token against $5M of TVL), and a ratio like that cannot price a launch. Momentum is 1 + the seven-day TVL change (clamped to -40%..+60%) divided by 200. Maturity runs from 0.85 to 1.15 over the first three years a protocol has run with no token. Breadth adds 2.5% per extra chain, up to six. The detail view of every row shows its range: the same arithmetic at the category\'s 25th and 75th percentile multiples, and a confidence grade from the number of traded peers behind it.' }),
      el('p', { text: 'Nothing here predicts that a token will be issued, or when. The implied value is what the snapshot\'s own figures support if the record stayed as it is; the farm plan under each protocol is how a reader positions for the possibility, with the cost and the time stated on every step.' }),
      el('table', null,
        el('caption', { text: 'The evidence table: traded peers behind the board\'s biggest categories.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Traded peers' }),
          el('th', { scope: 'col', text: 'Median value/TVL' }),
          el('th', { scope: 'col', text: 'Multiple used' }),
          el('th', { scope: 'col', text: 'Board rows' })
        )),
        tbody
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function eqCell(label, value, cls) {
    return el('div', cls ? { class: cls } : null, el('span', { text: label }), el('b', { text: value }));
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row, row.age_days);
    var check = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · on the snapshot watchlist' : ' · early row, below the watchlist floor') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'no chain named') + ' · records no token in the snapshot of ' + DATA.as_of })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The figures' }),
      el('div', { class: 'equation' },
        eqCell('TVL', fmtUsd(row.tvl_usd)),
        eqCell('Seven-day change', fmtPct(row.change_7d)),
        eqCell('Age with no token', fmtAge(row.age_days)),
        eqCell('Chains', row.chains && row.chains.length ? row.chains.join(', ') : 'none named'),
        eqCell('First tracked', row.listed_at || 'not recorded'),
        eqCell('Implied range', fmtUsd(row.implied_low_usd) + ' to ' + fmtUsd(row.implied_high_usd))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, step by step' }),
      el('div', { class: 'equation' },
        eqCell('TVL', fmtUsd(row.tvl_usd)),
        eqCell('Category multiple', fmtMult(row.comp_multiple)),
        eqCell('Momentum x', String(row.momentum_multiplier)),
        eqCell('Maturity x', String(row.maturity_multiplier)),
        eqCell('Breadth x', String(row.breadth_multiplier)),
        eqCell('Implied value', fmtUsd(row.implied_value_usd), 'total')
      ),
      el('p', { class: 'note', text: 'The multiple is the shrunk median of ' + row.comp_count + ' traded ' + (row.category || 'uncategorised') + ' peer' + (row.comp_count === 1 ? '' : 's') + ' (confidence: ' + row.confidence.toLowerCase() + '). The range is the same arithmetic at the peers\' 25th and 75th percentile multiples, shrunk toward the market\'s the same way; with a single peer there is no spread, and the range sits on the estimate itself. This page recomputes the row from these figures as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate, not a price, and not a forecast that a token will be issued.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: 'Costs are estimates from the protocol\'s main chain gas and the position size its TVL suggests; the plan is generated from the row\'s own category, chains, TVL and age, the same function that wrote board.json.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') shell.appendChild(methodPanel());
    shell.appendChild(el('footer', { class: 'colophon', text: 'Data: ' + DATA.source + '. Model ' + DATA.model_version + ': one function of the snapshot figures scores every row; no protocol name is special-cased. Implied values are model estimates, not prices, promises or investment advice.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
