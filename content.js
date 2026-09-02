(() => {
  const PAGE = 10, WINDOW = 730 * 86400;
  const color = { very_bullish: '#2f7d45', bullish: '#8acb8c', neutral: '#f8df63', bearish: '#ed7474', very_bearish: '#a63232' };
  const defaultPriceColor = '#75838a';
  const s = { slug: '', page: 0, articles: [], cards: [], done: false, loading: false, histories: new Map(), label: null, financialLabel: null, authorLink: null, articleTicker: null, financialCache: new Map() };

  function author() {
    return [...document.querySelectorAll('a[href*="/author/"]')].find(a => {
      const path = new URL(a.href).pathname;
      return /^\/author\/[^/]+\/?$/.test(path) && a.textContent.trim().length > 1;
    });
  }
  async function init() {
    if (!location.pathname.startsWith('/article/')) return;
    const link = author(); if (!link) return;
    s.authorLink = link;
    if (s.label) { positionLabel(); return; }
    s.slug = new URL(link.href).pathname.split('/').pop();
    const label = Object.assign(document.createElement('span'), { className: 'saah-label', textContent: 'Rating history' });
    // Keep this outside Seeking Alpha's React-owned byline. It is a separate
    // non-link element, positioned beside the author link.
    document.body.append(label);
    s.label = label;
    const financialLabel = Object.assign(document.createElement('span'), { className: 'saah-label saah-financial-label', textContent: 'Financials' });
    document.body.append(financialLabel);
    s.financialLabel = financialLabel;
    positionLabel();
    requestAnimationFrame(positionLabel);
    s.panel = panel(label);
    s.financialPanel = financialPanel(financialLabel);
    ensure(PAGE).catch(() => {});
  }
  function positionLabel() {
    if (!s.label || !s.financialLabel) return;
    if (!s.authorLink?.isConnected) { s.label.style.display = 'none'; s.financialLabel.style.display = 'none'; return; }
    const r = s.authorLink.getBoundingClientRect();
    s.label.style.display = r.width > 0 && r.bottom > 0 && r.top < innerHeight ? 'inline-flex' : 'none';
    s.label.style.left = `${r.right + 8}px`;
    s.label.style.top = `${r.top + Math.max(0, (r.height - s.label.offsetHeight) / 2)}px`;
    s.financialLabel.style.display = s.label.style.display;
    s.financialLabel.style.left = s.label.style.left;
    s.financialLabel.style.top = `${r.top + Math.max(0, (r.height - s.label.offsetHeight) / 2) + 20}px`;
  }
  function panel(label) {
    const el = document.createElement('section');
    el.className = 'saah-panel';
    el.innerHTML = '<div class="saah-header"><span>Author rating history</span><span class="saah-status">Preparing…</span></div><div class="saah-cards"></div><button class="saah-more" type="button">Load more</button>';
    document.body.append(el);
    const hide = () => setTimeout(() => { if (!el.matches(':hover') && !label.matches(':hover')) el.classList.remove('is-open'); }, 180);
    const show = async () => { el.classList.add('is-open'); place(label); if (!s.cards.length) await more(); };
    label.addEventListener('mouseenter', show); label.addEventListener('mouseleave', hide); el.addEventListener('mouseleave', hide);
    el.querySelector('.saah-more').onclick = more;
    el.addEventListener('wheel', event => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault();
    }, { passive: false });
    return el;
  }
  function place(label) {
    const r = label.getBoundingClientRect(), w = Math.min(820, innerWidth - 24);
    s.panel.style.width = w + 'px'; s.panel.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px'; s.panel.style.top = Math.min(innerHeight - 80, r.bottom + 9) + 'px';
  }
  function financialPanel(label) {
    const el = document.createElement('section');
    el.className = 'saah-panel saah-financial-panel';
    el.innerHTML = '<div class="saah-ratings-block">Loading ratings…</div><div class="saah-snapshot-block">Loading financial snapshot…</div><div class="saah-financial-tabs"><button data-statement="income-statement" type="button" class="is-active">Income statement</button><button data-statement="balance-sheet" type="button">Balance sheet</button><button data-statement="cash-flow-statement" type="button">Cash flow</button></div><div class="saah-financial-period"><span>Period</span><button data-period="quarterly" type="button" class="is-active">Quarterly</button><button data-period="annual" type="button">Annual</button></div><div class="saah-financial-body">Loading financials…</div><div class="saah-financial-scroll" aria-label="Scroll financial table horizontally"><div class="saah-financial-scroll-track"></div></div><div class="saah-resize-handle" aria-hidden="true"></div>';
    document.body.append(el);
    const state = { statement: 'income-statement', period: 'quarterly', financialLoaded: false, ratingsLoaded: false, snapshotLoaded: false };
    const hide = () => setTimeout(() => { if (!el.matches(':hover') && !label.matches(':hover')) el.classList.remove('is-open'); }, 180);
    const show = async () => { el.classList.add('is-open'); placeFinancial(label, el); await Promise.all([state.financialLoaded ? Promise.resolve() : loadFinancials(el, state), state.ratingsLoaded ? Promise.resolve() : loadRatings(el, state), state.snapshotLoaded ? Promise.resolve() : loadSnapshot(el, state)]); };
    label.addEventListener('mouseenter', show); label.addEventListener('mouseleave', hide); el.addEventListener('mouseleave', hide);
    el.querySelectorAll('[data-statement]').forEach(button => button.onclick = async () => {
      state.statement = button.dataset.statement; state.financialLoaded = false;
      el.querySelectorAll('[data-statement]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancials(el, state);
    });
    el.querySelectorAll('[data-period]').forEach(button => button.onclick = async () => {
      state.period = button.dataset.period; state.financialLoaded = false;
      el.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancials(el, state);
    });
    el.addEventListener('wheel', event => {
      const atTop = el.scrollTop <= 0, atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault();
    }, { passive: false });
    const body = el.querySelector('.saah-financial-body'), slider = el.querySelector('.saah-financial-scroll');
    body.addEventListener('scroll', () => { slider.scrollLeft = body.scrollLeft; });
    slider.addEventListener('scroll', () => { body.scrollLeft = slider.scrollLeft; });
    makeResizable(el);
    return el;
  }
  function placeFinancial(label, el) {
    const r = label.getBoundingClientRect(), maxWidth = innerWidth - 24;
    const savedWidth = Number(localStorage.getItem('saah-financial-panel-width'));
    const requested = Number(el.dataset.width) || savedWidth || Math.min(900, maxWidth), w = Math.max(460, Math.min(requested, maxWidth));
    el.dataset.width = w; el.style.width = w + 'px'; el.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px'; el.style.top = Math.min(innerHeight - 80, r.bottom + 9) + 'px';
  }
  function makeResizable(el) {
    const handle = el.querySelector('.saah-resize-handle');
    handle.addEventListener('pointerdown', event => {
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      const startX = event.clientX, startWidth = el.getBoundingClientRect().width;
      const move = moveEvent => {
        const maxWidth = innerWidth - el.getBoundingClientRect().left - 12;
        const width = Math.max(460, Math.min(startWidth + moveEvent.clientX - startX, maxWidth));
        el.dataset.width = width; el.style.width = width + 'px'; localStorage.setItem('saah-financial-panel-width', width); updateHorizontalSlider(el);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
    });
  }
  async function loadFinancials(el, state) {
    const body = el.querySelector('.saah-financial-body'); body.textContent = 'Loading financials…';
    try {
      const ticker = await articleTicker();
      const key = [ticker, state.period, state.statement].join('|');
      let data = s.financialCache.get(key);
      if (!data) {
        // Seeking Alpha routes exchange-qualified symbols (for example VHI:CA)
        // with a literal colon; encoding it as %3A returns a 404.
        const symbolPath = encodeURIComponent(ticker.toLowerCase()).replace(/%3A/gi, ':');
        const path = '/api/v3/symbols/' + symbolPath + '/fundamentals_metrics?period_type=' + state.period + '&statement_type=' + state.statement + '&target_currency=USD';
        data = await get(path); s.financialCache.set(key, data);
      }
      renderFinancials(body, data, state.statement); state.financialLoaded = true;
    } catch (error) { body.textContent = error.message || 'Financial data is unavailable.'; }
  }
  async function loadRatings(el, state) {
    const body = el.querySelector('.saah-ratings-block'); body.textContent = 'Loading ratings…';
    try {
      const ticker = await articleTicker();
      const key = ['ratings', ticker].join('|');
      let data = s.financialCache.get(key);
      if (!data) {
        const symbolPath = encodeURIComponent(ticker.toLowerCase()).replace(/%3A/gi, ':');
        data = await get('/api/v3/symbols/' + symbolPath + '/rating/periods?filter[periods][]=0&filter[periods][]=3&filter[periods][]=6');
        s.financialCache.set(key, data);
      }
      renderRatings(body, data); state.ratingsLoaded = true;
    } catch (error) { body.textContent = error.message || 'Ratings data is unavailable.'; }
  }
  function renderRatings(root, response) {
    const periods = (response?.data || []).map(item => item.attributes?.ratings).filter(Boolean);
    const latest = periods[0];
    if (!latest) { root.textContent = 'Ratings data is unavailable for this selection.'; return; }
    const gradeRows = [
      ['Valuation', 'valueGrade'], ['Growth', 'growthGrade'], ['Profitability', 'profitabilityGrade'],
      ['Momentum', 'momentumGrade'], ['Revisions', 'epsRevisionsGrade']
    ];
    const ratingRows = [['SA Analysts', latest.authorsRating], ['Wall Street', latest.sellSideRating], ['Quant', latest.quantRating]];
    const ratingRow = entry => entry ? '<div class="saah-rating-grid-row"><span>' + entry[0] + '</span><strong class="saah-rating-' + ratingClass(entry[1]) + '">' + ratingLabel(entry[1]) + '</strong><em class="saah-rating-' + ratingClass(entry[1]) + '">' + formatRating(entry[1]) + '</em></div>' : '';
    const factorRow = ([label, key]) => '<div class="saah-factor-grid-row"><span>' + label + '</span>' + [0, 1, 2].map(index => '<b class="saah-grade-' + String(grade(periods[index]?.[key])).replace('+', 'plus').replace('-', 'minus') + '">' + grade(periods[index]?.[key]) + '</b>').join('') + '</div>';
    root.innerHTML = '<section class="saah-ratings-card"><h3>Ratings and factor grades</h3><div class="saah-ratings-columns"><div class="saah-ratings-left"><div class="saah-ratings-grid-head">Ratings</div>' + ratingRows.map(ratingRow).join('') + '</div><div class="saah-ratings-right"><div class="saah-factor-grid-head"><span></span><span>Now</span><span>3M</span><span>6M</span></div>' + gradeRows.map(factorRow).join('') + '</div></div></section>';
  }
  function grade(value) { return ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'][Number(value) - 1] || '—'; }
  function ratingLabel(value) { const score = Number(value); return !Number.isFinite(score) ? '—' : score >= 4.5 ? 'Strong Buy' : score >= 3.5 ? 'Buy' : score >= 2.5 ? 'Hold' : score >= 1.5 ? 'Sell' : 'Strong Sell'; }
  function ratingClass(value) { const score = Number(value); return !Number.isFinite(score) ? 'none' : score >= 4.5 ? 'strong-buy' : score >= 3.5 ? 'buy' : score >= 2.5 ? 'hold' : score >= 1.5 ? 'sell' : 'strong-sell'; }
  function formatRating(value) { const score = Number(value); return Number.isFinite(score) ? score.toFixed(2) : '—'; }
  async function loadSnapshot(el, state) {
    const root = el.querySelector('.saah-snapshot-block'); root.textContent = 'Loading financial snapshot…';
    try {
      const ticker = await articleTicker();
      const [income, balance, cashflow, price] = await Promise.all([
        annualStatement(ticker, 'income-statement'), annualStatement(ticker, 'balance-sheet'), annualStatement(ticker, 'cash-flow-statement'),
        snapshotPrice(ticker).catch(() => null)
      ]);
      renderSnapshot(root, { income, balance, cashflow, quote: null, price }); state.snapshotLoaded = true;
    } catch (error) { root.textContent = error.message || 'Financial snapshot is unavailable.'; }
  }
  async function annualStatement(ticker, statement) {
    const key = [ticker, 'annual', statement].join('|');
    let data = s.financialCache.get(key);
    if (!data) {
      const symbolPath = encodeURIComponent(ticker.toLowerCase()).replace(/%3A/gi, ':');
      data = await get('/api/v3/symbols/' + symbolPath + '/fundamentals_metrics?period_type=annual&statement_type=' + statement + '&target_currency=USD');
      s.financialCache.set(key, data);
    }
    return data;
  }
  function snapshotPrice(symbol) {
    const period1 = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'price-history', symbol, period1 }, response => {
      if (chrome.runtime.lastError || !response?.ok) reject(Error(response?.error || 'Price data unavailable'));
      else resolve(response.points?.at(-1)?.[1]);
    }));
  }
  function renderSnapshot(root, data) {
    const revenue = snapshotMetric(data.income, ['revenues', 'revenue']);
    const grossProfit = snapshotMetric(data.income, ['grossprofit']);
    const operatingIncome = snapshotMetric(data.income, ['operatingincome']);
    const pretaxIncome = snapshotMetric(data.income, ['pretaxincome', 'earningsbeforetax', 'incomebeforetax']);
    const netIncome = snapshotMetric(data.income, ['netincome']);
    const assets = snapshotMetric(data.balance, ['totalassets']);
    const equity = snapshotMetric(data.balance, ['totalcommonequity', 'totalequity']);
    const currentAssets = snapshotMetric(data.balance, ['totalcurrentassets']);
    const currentLiabilities = snapshotMetric(data.balance, ['totalcurrentliabilities']);
    const cash = snapshotMetric(data.balance, ['cashandcashequivalents', 'cashcashequivalents', 'totalcashstinvestments', 'totalcashstinvestment']);
    const receivables = snapshotMetric(data.balance, ['totalreceivables', 'accountsreceivable']);
    const debt = snapshotMetric(data.balance, ['totaldebt', 'longtermdebt']);
    const cashFromOperations = snapshotMetric(data.cashflow, ['cashfromoperations', 'operatingcashflow']);
    const shares = snapshotMetric(data.income, ['weightedaveragesharesoutstanding', 'weightedaveragedilutedsharesoutstanding', 'dilutedweightedaveragesharesoutstanding', 'dilutedsharesoutstanding']) || snapshotMetric(data.balance, ['commonsharesoutstanding', 'sharesoutstanding']);
    const quote = data.quote || {}, price = Number(data.price);
    const reportedMarketCap = Number(quote.marketCap), derivedMarketCap = price * shares;
    const marketCap = Number.isFinite(reportedMarketCap) && reportedMarketCap > 0 ? reportedMarketCap : derivedMarketCap;
    const reportedEnterpriseValue = Number(quote.enterpriseValue);
    const enterpriseValue = Number.isFinite(reportedEnterpriseValue) && reportedEnterpriseValue > 0 ? reportedEnterpriseValue : marketCap + (debt || 0) - (cash || 0);
    const ratio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
    const first = (...values) => values.find(value => Number.isFinite(value)) ?? null;
    const valuation = [
      ['P/E', first(Number(quote.trailingPE), ratio(marketCap, netIncome))],
      ['P/S', first(Number(quote.priceToSalesTrailing12Months), ratio(marketCap, revenue))],
      ['P/B', first(Number(quote.priceToBook), ratio(marketCap, equity))],
      ['P / Cash flow', ratio(marketCap, cashFromOperations)],
      ['EV / Sales', first(Number(quote.enterpriseToRevenue), ratio(enterpriseValue, revenue))]
    ];
    const profitability = [['Gross margin', ratio(grossProfit, revenue)], ['Operating margin', ratio(operatingIncome, revenue)], ['Pretax margin', ratio(pretaxIncome, revenue)], ['Net margin', ratio(netIncome, revenue)], ['Return on assets', ratio(netIncome, assets)], ['Return on equity', ratio(netIncome, equity)]];
    const efficiency = [['Asset turnover', ratio(revenue, assets)]];
    const liquidity = [['Current ratio', ratio(currentAssets, currentLiabilities)], ['Quick ratio', ratio((cash || 0) + (receivables || 0), currentLiabilities)], ['Cash ratio', ratio(cash, currentLiabilities)]];
    const capitalization = [['Debt / equity', ratio(debt, equity)], ['Debt / assets', ratio(debt, assets)], ['Debt / capital', ratio(debt, (debt || 0) + (equity || 0))]];
    const section = (title, rows, percent) => {
      const present = rows.filter(([, value]) => Number.isFinite(value));
      return present.length ? '<section><h3>' + title + '</h3>' + present.map(([label, value]) => '<div><span>' + label + '</span><strong>' + (percent ? snapshotPercent(value) : snapshotNumber(value)) + '</strong></div>').join('') + '</section>' : '';
    };
    const html = section('Valuation', valuation, false) + section('Profitability', profitability, true) + section('Efficiency', efficiency, false) + section('Liquidity', liquidity, false) + section('Capitalization', capitalization, true);
    root.innerHTML = html ? '<div class="saah-snapshot-grid">' + html + '</div>' : 'Financial snapshot is unavailable for this selection.';
  }
  function snapshotMetric(response, names) {
    const rows = (Array.isArray(response) ? response : response?.data || []).flatMap(section => section.rows || []);
    for (const name of names) {
      const row = rows.find(item => normalize(item.value || item.name).includes(name));
      const cells = row?.cells || [], cell = [...cells].reverse().find(item => Number.isFinite(Number(item.raw_value)));
      if (cell) return Number(cell.raw_value);
    }
    return null;
  }
  function snapshotNumber(value) { return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'; }
  function snapshotPercent(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '—'; }
  async function articleTicker() {
    if (s.articleTicker) return s.articleTicker;
    const id = location.pathname.match(/^\/article\/(\d+)/)?.[1];
    if (!id) throw Error('Could not identify this article.');
    const data = await get('/api/v3/articles/' + id + '?include=primaryTickers');
    const related = data.data?.relationships?.primaryTickers?.data || [];
    const included = new Map((data.included || []).map(item => [item.type + ':' + item.id, item]));
    const ticker = related.map(item => included.get(item.type + ':' + item.id)?.attributes?.slug).find(Boolean);
    if (!ticker) throw Error('No primary ticker was found for this article.');
    return s.articleTicker = ticker.toUpperCase();
  }
  function renderFinancials(root, response, statement) {
    // The endpoint returns an array of sections. Each section contains rows,
    // and each row's period values live in cells[] rather than JSON:API data.
    const sections = Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
    const rows = sections.flatMap(section => (section.rows || []).map(row => ({ ...row, section: section.title })));
    const firstRow = rows.find(row => Array.isArray(row.cells) && row.cells.length);
    if (!firstRow) { root.textContent = 'Financial data is unavailable for this selection.'; return; }
    const dates = firstRow.cells.map(cell => cell.name).filter(Boolean).slice(-12).reverse();
    const table = document.createElement('table'); table.className = 'saah-financial-table';
    table.innerHTML = '<thead><tr><th>Line item</th><th class="saah-financial-trend-head">Trend</th>' + dates.map(date => '<th>' + escapeHtml(formatPeriod(date)) + '</th>').join('') + '</tr></thead>';
    const body = document.createElement('tbody');
    let lastSection = '';
    const displayedMetrics = new Set();
    rows.slice(0, 80).forEach(row => {
      const label = row.value || prettyMetric(row.name);
      const metricKey = String(row.item_id || row.name || normalize(label));
      if (displayedMetrics.has(metricKey)) return;
      displayedMetrics.add(metricKey);
      if (row.section && row.section !== lastSection) {
        const section = document.createElement('tr'); section.className = 'saah-financial-section'; section.innerHTML = '<th colspan="' + (dates.length + 2) + '">' + escapeHtml(row.section) + '</th>'; body.append(section); lastSection = row.section;
      }
      lastSection = row.section || lastSection;
      const cells = new Map((row.cells || []).map(cell => [cell.name, cell]));
      const rawValues = dates.map(date => Number(cells.get(date)?.raw_value)).filter(Number.isFinite);
      const maximum = Math.max(1, ...rawValues.map(Math.abs));
      const positiveMaximum = Math.max(1, ...rawValues.filter(value => value > 0));
      const negativeMaximum = Math.max(1, ...rawValues.filter(value => value < 0).map(Math.abs));
      const mixedSigns = rawValues.some(value => value > 0) && rawValues.some(value => value < 0);
      const negativeOnly = !rawValues.some(value => value > 0) && rawValues.some(value => value < 0);
      const key = isKeyMetric(statement, label);
      const tr = document.createElement('tr');
      tr.className = (key ? 'is-key ' : '') + 'is-indented';
      const trend = dates.map(date => {
        const raw = Number(cells.get(date)?.raw_value);
        const height = !Number.isFinite(raw) ? 0 : mixedSigns ? Math.abs(raw) / maximum * 50 : negativeOnly ? Math.abs(raw) / negativeMaximum * 50 : Math.abs(raw) / maximum * 100;
        return '<i class="saah-financial-trend-slot"><b class="' + (raw < 0 ? 'is-negative' : 'is-positive') + '" style="--bar-height:' + height.toFixed(1) + '%"></b></i>';
      }).join('');
      tr.innerHTML = '<th>' + escapeHtml(label) + '</th><td class="saah-financial-trend' + (mixedSigns ? ' is-mixed' : '') + '"><span>' + trend + '</span></td>' + dates.map(date => '<td>' + escapeHtml(formatCell(cells.get(date)?.value ?? cells.get(date)?.raw_value)) + '</td>').join('');
      body.append(tr);
    });
    table.append(body); root.replaceChildren(table);
    requestAnimationFrame(() => updateHorizontalSlider(root.closest('.saah-financial-panel')));
  }
  function updateHorizontalSlider(panel) {
    const body = panel?.querySelector('.saah-financial-body'), slider = panel?.querySelector('.saah-financial-scroll'), track = panel?.querySelector('.saah-financial-scroll-track');
    if (!body || !slider || !track) return;
    track.style.width = Math.max(body.clientWidth, body.scrollWidth) + 'px';
    slider.scrollLeft = body.scrollLeft;
  }
  function prettyMetric(value) { return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
  function normalize(value) { return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase(); }
  function isKeyMetric(statement, value) {
    const metric = normalize(value);
    const priorities = {
      'income-statement': [
        'totalrevenues', 'revenues', 'grossprofit', 'otheroperatingexpensestotal',
        'operatingincome', 'netinterestexpenses', 'ebtinclunusualitems',
        'earningsfromcontinuingoperations', 'netincome', 'nitocommonexclextraitems'
      ],
      'balance-sheet': [
        'totalcashstinvestment', 'totalcashstinvestments', 'totalreceivables', 'totalcurrentassets',
        'netpropertyplantequipment', 'totalassets', 'totalcurrentliabilities',
        'totalliabilities', 'totalcommonequity', 'totalequity', 'totalliabilitiesandequity'
      ],
      'cash-flow-statement': [
        'depreciationamortizationtotal', 'cashfromoperations', 'cashfrominvesting',
        'totaldebtissued', 'totaldebtrepaid', 'cashfromfinancing', 'netchangeincash'
      ]
    };
    return (priorities[statement] || []).includes(metric);
  }
  function formatPeriod(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  function formatCell(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
  function escapeHtml(value) { return String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char])); }
  async function more() {
    if (s.loading) return; s.loading = true; status('Loading ratings…');
    try {
      await ensure(s.cards.length + PAGE);
      const articles = s.articles.slice(s.cards.length, s.cards.length + PAGE);
      await pool(articles, 4, async article => s.cards.push({ ticker: article.ticker, history: await history(article.ticker) }));
      render(); status(s.cards.length + ' analyses');
      s.panel.querySelector('.saah-more').hidden = s.done && s.cards.length >= s.articles.length;
    } catch (e) { status(e.message || 'Could not load ratings'); } finally { s.loading = false; }
  }
  async function ensure(count) {
    while (s.articles.length < count && !s.done) {
      const path = '/api/v3/feed?all[]=' + encodeURIComponent(s.slug) + '&include=primaryTickers,secondaryTickers,otherTags,sentiments&models[]=Article&page[number]=' + (++s.page) + '&page[size]=20';
      const data = await get(path), rows = articles(data);
      s.articles.push(...rows); s.done = !data.links?.next || !rows.length;
    }
  }
  function articles(data) {
    const inc = data.included || [], byId = new Map(inc.map(x => [x.type + ':' + x.id, x]));
    const sentiment = new Map(inc.filter(x => x.type === 'sentiment').map(x => [String(x.attributes?.articleId), x.attributes]));
    return (data.data || []).map(a => {
      const ref = a.relationships?.primaryTickers?.data?.[0], ticker = ref && byId.get(ref.type + ':' + ref.id)?.attributes?.slug;
      return ticker && sentiment.has(String(a.id)) ? { ticker: ticker.toUpperCase() } : null;
    }).filter(Boolean);
  }
  async function history(ticker) {
    if (s.histories.has(ticker)) return s.histories.get(ticker);
    const since = Math.floor(Date.now() / 1000) - WINDOW;
    const data = await get('/api/v3/feed?all[]=' + encodeURIComponent(s.slug) + '&any_primary[]=' + encodeURIComponent(ticker.toLowerCase()) + '&filter[since]=' + since + '&include=primaryTickers,sentiments&models[]=Article');
    const ratings = (data.included || []).filter(x => x.type === 'sentiment').map(x => x.attributes).filter(x => x?.createdAt && x?.type).map(x => ({ time: new Date(x.createdAt).getTime(), type: x.type }));
    const first = Math.min(Date.now() - WINDOW * 1000, ...ratings.map(x => x.time));
    const prices = await price(ticker, Math.floor(first / 1000)).catch(() => []);
    const result = { ratings, price: prices }; s.histories.set(ticker, result); return result;
  }
  async function get(path) { const r = await fetch(path, { credentials: 'include' }); if (!r.ok) throw Error('Seeking Alpha returned ' + r.status); return r.json(); }
  function price(symbol, period1) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'price-history', symbol, period1 }, r => {
      if (chrome.runtime.lastError || !r?.ok) reject(Error(r?.error || 'Price history unavailable')); else resolve(r.points);
    }));
  }
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }
  function render() {
    const root = s.panel.querySelector('.saah-cards');
    root.replaceChildren(...s.cards.map(card => {
      const el = document.createElement('article'); el.className = 'saah-card';
      el.innerHTML = '<div class="saah-ticker">' + card.ticker.replace(/[<>&]/g, '') + '</div><canvas class="saah-chart"></canvas>';
      requestAnimationFrame(() => chart(el.querySelector('canvas'), card.history)); return el;
    }));
  }
  function chart(canvas, h) {
    const box = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = box.width, ht = box.height;
    canvas.width = w * dpr; canvas.height = ht * dpr; const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    const times = [...h.price.map(p => p[0]), ...h.ratings.map(r => r.time)];
    if (!times.length) { c.fillStyle = '#859299'; c.font = '12px system-ui'; c.fillText('Rating history unavailable', 10, ht / 2); return; }
    const prices = h.price.map(p => p[1]), minT = Math.min(...times), maxT = Math.max(...times, Date.now()), minP = Math.min(...prices), maxP = Math.max(...prices);
    const x = t => 8 + (t - minT) / Math.max(1, maxT - minT) * (w - 16), y = p => 12 + (1 - (p - minP) / Math.max(.001, maxP - minP)) * (ht - 24);
    c.strokeStyle = '#263137'; for (let i = 0; i < 3; i++) { const gy = 12 + i * (ht - 24) / 2; c.beginPath(); c.moveTo(8, gy); c.lineTo(w - 8, gy); c.stroke(); }
    if (h.price.length > 1) {
      const ratings = [...h.ratings].sort((a, b) => a.time - b.time);
      let ratingIndex = -1;
      c.lineWidth = 2;
      for (let i = 1; i < h.price.length; i++) {
        const previous = h.price[i - 1], current = h.price[i];
        while (ratingIndex + 1 < ratings.length && ratings[ratingIndex + 1].time <= current[0]) ratingIndex++;
        c.strokeStyle = ratingIndex < 0 ? defaultPriceColor : (color[ratings[ratingIndex].type] || defaultPriceColor);
        c.beginPath(); c.moveTo(x(previous[0]), y(previous[1])); c.lineTo(x(current[0]), y(current[1])); c.stroke();
      }
    }
    h.ratings.forEach(r => { c.fillStyle = color[r.type] || '#f8df63'; c.beginPath(); c.arc(x(r.time), prices.length ? y(nearest(h.price, r.time)) : ht / 2, 5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#101718'; c.lineWidth = 2; c.stroke(); });
  }
  function nearest(points, time) { return points.reduce((a, p) => Math.abs(p[0] - time) < Math.abs(a[0] - time) ? p : a, points[0])[1]; }
  function status(text) { const el = s.panel?.querySelector('.saah-status'); if (el) el.textContent = text; }
  function clearPreview() {
    s.label?.remove();
    s.financialLabel?.remove();
    s.panel?.remove();
    s.financialPanel?.remove();
    Object.assign(s, { slug: '', page: 0, articles: [], cards: [], done: false, loading: false, histories: new Map(), label: null, financialLabel: null, authorLink: null, articleTicker: null, financialCache: new Map(), panel: null, financialPanel: null });
  }
  addEventListener('resize', () => { positionLabel(); if (s.panel?.classList.contains('is-open')) { place(s.label); render(); } if (s.financialPanel?.classList.contains('is-open')) placeFinancial(s.financialLabel, s.financialPanel); });
  addEventListener('scroll', positionLabel, true);
  init();
  // Seeking Alpha can replace the author byline after the initial page paint.
  // Reattach the label if that client-side render removes it.
  let queued = false;
  new MutationObserver(() => {
    if (!location.pathname.startsWith('/article/') || queued || s.label) return;
    queued = true;
    setTimeout(() => { queued = false; init(); }, 250);
  }).observe(document.documentElement || document, { childList: true, subtree: true });
  // A final fallback for articles whose byline is replaced without a normal
  // DOM mutation visible to the isolated extension world.
  let retries = 0;
  const bylineWatch = setInterval(() => {
    init();
    if (++retries === 60 || s.label) clearInterval(bylineWatch);
  }, 500);
  let activeUrl = location.href;
  setInterval(() => {
    if (location.href !== activeUrl) {
      activeUrl = location.href;
      clearPreview();
    }
    if (!location.pathname.startsWith('/article/')) return;
    const currentAuthor = author();
    if (!currentAuthor) return;
    if (!s.label || s.authorLink !== currentAuthor) init();
    else positionLabel();
  }, 250);
})();
