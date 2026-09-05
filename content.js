if (!globalThis.__saahContentLoaded) {
globalThis.__saahContentLoaded = true;
(() => {
  const PAGE = 10, WINDOW = 365 * 86400;
  const color = { very_bullish: '#2f7d45', bullish: '#8acb8c', neutral: '#f8df63', bearish: '#ed7474', very_bearish: '#a63232' };
  const defaultPriceColor = '#75838a';
  const s = { slug: '', page: 0, articles: [], articleLoad: null, graphPreload: null, cards: [], done: false, loading: false, histories: new Map(), historyLoads: new Map(), label: null, financialLabel: null, authorLink: null, articleTicker: null, financialCache: new Map() };
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== 'open-financial-modal' && message?.type !== 'open-financial-modal-v2') return;
    openFinancialModal(String(message.ticker || '').toUpperCase());
    respond({ ok: true });
  });

  function author() {
    return [...document.querySelectorAll('a[href*="/author/"]')].find(a => {
      const path = new URL(a.href).pathname;
      if (!/^\/author\/[^/]+\/?$/.test(path) || a.textContent.trim().length <= 1) return false;
      const rect = a.getBoundingClientRect(), style = getComputedStyle(a);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }
  async function init() {
    if (!location.pathname.startsWith('/article/')) return;
    const link = author(); if (!link) return;
    if (s.label && (!s.label.isConnected || !s.financialLabel?.isConnected)) clearPreview();
    s.authorLink = link;
    if (s.label) { positionLabel(); return; }
    s.slug = new URL(link.href).pathname.split('/').pop();
    const label = Object.assign(document.createElement('span'), { className: 'saah-label is-loading', textContent: 'Rating history' });
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
    financialLabel.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openFinancialSearch(); });
    ensure().then(() => preloadGraphs(PAGE)).then(() => label.classList.remove('is-loading')).catch(() => {});
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
    el.innerHTML = '<div class="saah-author-ratings-block">Loading recent analyst ratings…</div><div class="saah-ratings-block">Loading ratings…</div><div class="saah-snapshot-block">Loading financial snapshot…</div><h3 class="saah-section-title">Insider actions</h3><section class="saah-insider-block"><p>Total insider purchases and sales reported in each period.</p><div class="saah-insider-summary">Loading recent insider activity…</div></section><div class="saah-financial-quick"><div class="saah-financial-quick-heading"><h3 class="saah-section-title">Financial Statement Highlights</h3><div class="saah-quick-period"><button data-highlight-period="quarterly" type="button" class="is-active">Quarterly</button><button data-highlight-period="annual" type="button">Annual</button></div></div><div class="saah-financial-quick-content">Loading statement highlights…</div></div><h3 class="saah-section-title">Financial statements</h3><div class="saah-financial-tabs saah-quick-period"><button data-statement="income-statement" type="button" class="is-active">Income statement</button><button data-statement="balance-sheet" type="button">Balance sheet</button><button data-statement="cash-flow-statement" type="button">Cash flow</button></div><div class="saah-quick-period saah-statement-period"><button data-statement-period="quarterly" type="button" class="is-active">Quarterly</button><button data-statement-period="annual" type="button">Annual</button></div><div class="saah-financial-body">Loading financials…</div><div class="saah-financial-scroll" aria-label="Scroll financial table horizontally"><div class="saah-financial-scroll-track"></div></div><div class="saah-resize-handle" aria-hidden="true"></div>';
    document.body.append(el);
    const state = { statement: 'income-statement', statementPeriod: 'quarterly', highlightPeriod: 'quarterly', financialLoaded: false, authorRatingsLoaded: false, ratingsLoaded: false, snapshotLoaded: false, insiderLoaded: false, quickPeriod: null };
    const hide = () => setTimeout(() => { if (!el.matches(':hover') && !label.matches(':hover')) el.classList.remove('is-open'); }, 180);
    const show = async () => { el.classList.add('is-open'); placeFinancial(label, el); await Promise.all([state.financialLoaded ? Promise.resolve() : loadFinancials(el, state), state.authorRatingsLoaded ? Promise.resolve() : loadAuthorRatings(el, state), state.ratingsLoaded ? Promise.resolve() : loadRatings(el, state), state.snapshotLoaded ? Promise.resolve() : loadSnapshot(el, state), state.insiderLoaded ? Promise.resolve() : loadInsiders(el, state), state.quickPeriod === state.highlightPeriod ? Promise.resolve() : loadFinancialHighlights(el, state)]); };
    label.addEventListener('mouseenter', show); label.addEventListener('mouseleave', hide); el.addEventListener('mouseleave', hide);
    el.querySelectorAll('[data-statement]').forEach(button => button.onclick = async () => {
      state.statement = button.dataset.statement; state.financialLoaded = false;
      el.querySelectorAll('[data-statement]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancials(el, state);
    });
    el.querySelectorAll('[data-highlight-period]').forEach(button => button.onclick = async () => {
      state.highlightPeriod = button.dataset.highlightPeriod; state.quickPeriod = null;
      el.querySelectorAll('[data-highlight-period]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancialHighlights(el, state);
    });
    el.querySelectorAll('[data-statement-period]').forEach(button => button.onclick = async () => {
      state.statementPeriod = button.dataset.statementPeriod; state.financialLoaded = false;
      el.querySelectorAll('[data-statement-period]').forEach(item => item.classList.toggle('is-active', item === button));
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
  function openFinancialSearch() {
    document.querySelector('.saah-modal-backdrop')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'saah-modal-backdrop';
    overlay.innerHTML = '<form class="saah-ticker-search"><button type="button" class="saah-modal-close" aria-label="Close">×</button><h2>Financials</h2><p>Enter a ticker to open its financial preview.</p><input name="ticker" autocomplete="off" autocapitalize="characters" placeholder="e.g. NVDA or VHI:CA" required><button type="submit">Open financials</button></form>';
    const close = () => overlay.remove();
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.saah-modal-close').onclick = close;
    overlay.querySelector('form').onsubmit = event => {
      event.preventDefault();
      const ticker = String(new FormData(event.currentTarget).get('ticker') || '').trim().toUpperCase();
      if (/^[A-Z0-9.-]+(?::[A-Z0-9.-]+)?$/.test(ticker)) openFinancialModal(ticker);
    };
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.querySelector('input').focus());
  }
  function openFinancialModal(ticker) {
    document.querySelector('.saah-modal-backdrop')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'saah-modal-backdrop';
    const el = document.createElement('section');
    el.className = 'saah-panel saah-financial-panel saah-financial-modal is-open';
    el.innerHTML = '<div class="saah-modal-title"><strong>' + escapeHtml(ticker) + ' financials</strong><button type="button" class="saah-modal-close" aria-label="Close">×</button></div><div class="saah-author-ratings-block">Loading recent analyst ratings…</div><div class="saah-ratings-block">Loading ratings…</div><div class="saah-snapshot-block">Loading financial snapshot…</div><h3 class="saah-section-title">Insider actions</h3><section class="saah-insider-block"><p>Total insider purchases and sales reported in each period.</p><div class="saah-insider-summary">Loading recent insider activity…</div></section><div class="saah-financial-quick"><div class="saah-financial-quick-heading"><h3 class="saah-section-title">Financial Statement Highlights</h3><div class="saah-quick-period"><button data-highlight-period="quarterly" type="button" class="is-active">Quarterly</button><button data-highlight-period="annual" type="button">Annual</button></div></div><div class="saah-financial-quick-content">Loading statement highlights…</div></div><h3 class="saah-section-title">Financial statements</h3><div class="saah-financial-tabs saah-quick-period"><button data-statement="income-statement" type="button" class="is-active">Income statement</button><button data-statement="balance-sheet" type="button">Balance sheet</button><button data-statement="cash-flow-statement" type="button">Cash flow</button></div><div class="saah-quick-period saah-statement-period"><button data-statement-period="quarterly" type="button" class="is-active">Quarterly</button><button data-statement-period="annual" type="button">Annual</button></div><div class="saah-financial-body">Loading financials…</div>';
    overlay.append(el); document.body.append(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    el.querySelector('.saah-modal-close').onclick = close;
    const state = { ticker, statement: 'income-statement', statementPeriod: 'quarterly', highlightPeriod: 'quarterly', financialLoaded: false, authorRatingsLoaded: false, ratingsLoaded: false, snapshotLoaded: false, insiderLoaded: false, quickPeriod: null };
    el.querySelectorAll('[data-statement]').forEach(button => button.onclick = async () => {
      state.statement = button.dataset.statement; state.financialLoaded = false;
      el.querySelectorAll('[data-statement]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancials(el, state);
    });
    el.querySelectorAll('[data-highlight-period]').forEach(button => button.onclick = async () => {
      state.highlightPeriod = button.dataset.highlightPeriod; state.quickPeriod = null;
      el.querySelectorAll('[data-highlight-period]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancialHighlights(el, state);
    });
    el.querySelectorAll('[data-statement-period]').forEach(button => button.onclick = async () => {
      state.statementPeriod = button.dataset.statementPeriod; state.financialLoaded = false;
      el.querySelectorAll('[data-statement-period]').forEach(item => item.classList.toggle('is-active', item === button));
      await loadFinancials(el, state);
    });
    Promise.all([loadFinancials(el, state), loadAuthorRatings(el, state), loadRatings(el, state), loadSnapshot(el, state), loadInsiders(el, state), loadFinancialHighlights(el, state)]).catch(() => {});
  }
  async function tickerFor(state) { return state?.ticker || articleTicker(); }
  async function loadInsiders(el, state) {
    const summary = el.querySelector('.saah-insider-summary'); summary.textContent = 'Loading recent insider activity…';
    try {
      renderInsiders(summary, await insiderActivity(await tickerFor(state))); state.insiderLoaded = true;
    } catch (error) { summary.textContent = error.message || 'Insider activity is unavailable for this selection.'; }
  }
  function insiderActivity(symbol) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'insider-activity', symbol }, response => {
      if (chrome.runtime.lastError || !response?.ok) reject(Error(response?.error || 'SEC insider data unavailable')); else resolve(response.data);
    }));
  }
  function renderInsiders(summary, data) {
    const periods = data.periods || [];
    if (!periods.length) { summary.textContent = 'No insider activity summary is available for this selection.'; return; }
    summary.innerHTML = '<div class="saah-insider-columns"><span>Timeframe</span><span>Transactions</span><span>Shares</span></div>' + periods.map(period => '<div class="saah-insider-row"><strong>' + escapeHtml(period.label) + '</strong><div><span class="is-buy">' + escapeHtml(insiderCount(period.purchases)) + '</span> Purchases<br><span class="is-sell">' + escapeHtml(insiderCount(period.sales)) + '</span> Sales</div><div><span class="is-buy">' + escapeHtml(insiderShares(period.purchaseShares)) + '</span> Bought<br><span class="is-sell">' + escapeHtml(insiderShares(period.saleShares)) + '</span> Sold</div></div>').join('');
  }
  function insiderCount(value) { return Number.isFinite(value) ? Math.round(value).toLocaleString() : '—'; }
  function insiderShares(value) { return Number.isFinite(value) ? Math.round(value).toLocaleString() : '—'; }
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
      const ticker = await tickerFor(state);
      const key = [ticker, state.statementPeriod, state.statement].join('|');
      let data = s.financialCache.get(key);
      if (!data) {
        // Seeking Alpha routes exchange-qualified symbols (for example VHI:CA)
        // with a literal colon; encoding it as %3A returns a 404.
        const symbolPath = encodeURIComponent(ticker.toLowerCase()).replace(/%3A/gi, ':');
        const path = '/api/v3/symbols/' + symbolPath + '/fundamentals_metrics?period_type=' + state.statementPeriod + '&statement_type=' + state.statement + '&target_currency=USD';
        data = await get(path); s.financialCache.set(key, data);
      }
      renderFinancials(body, data, state.statement); state.financialLoaded = true;
    } catch (error) { body.textContent = error.message || 'Financial data is unavailable.'; }
  }
  async function loadFinancialHighlights(el, state) {
    const root = el.querySelector('.saah-financial-quick-content');
    root.textContent = 'Loading statement highlights…';
    try {
      const ticker = await tickerFor(state);
      const [income, balance, cashflow] = await Promise.all([
        financialStatement(ticker, state.highlightPeriod, 'income-statement'),
        financialStatement(ticker, state.highlightPeriod, 'balance-sheet'),
        financialStatement(ticker, state.highlightPeriod, 'cash-flow-statement')
      ]);
      renderFinancialHighlights(el.querySelector('.saah-financial-quick'), { income, balance, cashflow }, state.highlightPeriod);
      state.quickPeriod = state.highlightPeriod;
    } catch (error) { root.textContent = error.message || 'Statement highlights are unavailable.'; }
  }
  async function loadRatings(el, state) {
    const body = el.querySelector('.saah-ratings-block'); body.textContent = 'Loading ratings…';
    try {
      const ticker = await tickerFor(state);
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
  async function loadAuthorRatings(el, state) {
    const root = el.querySelector('.saah-author-ratings-block');
    root.textContent = 'Loading recent analyst ratings…';
    try {
      const ticker = await tickerFor(state);
      const key = ['author-ratings', ticker].join('|');
      let data = s.financialCache.get(key);
      if (!data) {
        const since = Math.floor(Date.now() / 1000) - 62 * 86400;
        const symbol = encodeURIComponent(ticker.toLowerCase()).replace(/%3A/gi, ':');
        data = await get('/api/v3/feed?any_primary[]=' + symbol + '&filter[since]=' + since + '&include=primaryTickers,sentiments,author&models[]=Article&page[size]=100');
        s.financialCache.set(key, data);
      }
      renderAuthorRatings(root, data);
      state.authorRatingsLoaded = true;
    } catch (error) { root.textContent = error.message || 'Recent analyst ratings are unavailable.'; }
  }
  function renderAuthorRatings(root, response) {
    const included = response?.included || [];
    const byKey = new Map(included.map(item => [item.type + ':' + item.id, item]));
    const sentiments = new Map(included.filter(item => item.type === 'sentiment').map(item => [String(item.attributes?.articleId), item.attributes]));
    const nameFor = article => {
      const attrs = article.attributes || {};
      const relation = article.relationships?.author?.data || article.relationships?.authors?.data || article.relationships?.user?.data;
      const reference = Array.isArray(relation) ? relation[0] : relation;
      const author = reference && byKey.get(reference.type + ':' + reference.id);
      const authorAttrs = author?.attributes || {};
      const candidates = [attrs.authorName, attrs.author_name, attrs.authorDisplayName, attrs.userName, attrs.author?.name, attrs.author?.displayName, attrs.author?.username, attrs.user?.name, attrs.user?.username, authorAttrs.displayName, authorAttrs.fullName, authorAttrs.nickname, authorAttrs.username, authorAttrs.slug, authorAttrs.name];
      const name = candidates.find(value => typeof value === 'string' && /[a-z]/i.test(value) && !/^\d+$/.test(value.trim()));
      return name ? titleCaseAuthor(name.replace(/-/g, ' ')) : '';
    };
    const rows = (response?.data || []).map(article => {
      const sentiment = sentiments.get(String(article.id));
      const name = nameFor(article);
      const time = [article.attributes?.publishOn, article.attributes?.publishedAt, article.attributes?.createdAt, sentiment?.createdAt].map(timestamp).find(Number.isFinite);
      return name && sentiment?.type && Number.isFinite(time) ? { name, type: sentiment.type, time } : null;
    }).filter(Boolean).sort((a, b) => b.time - a.time);
    if (!rows.length) { root.textContent = 'No SA analyst ratings were published in the past 2 months.'; return; }
    root.innerHTML = '<h3 class="saah-section-title">Recent SA analyst ratings <span>Last 2 months</span></h3><section class="saah-author-ratings-card"><div class="saah-author-ratings-head"><span>Author</span><span>Rating</span><span>Date</span></div>' + rows.map(row => '<div class="saah-author-rating-row"><span title="' + escapeHtml(row.name) + '">' + escapeHtml(row.name) + '</span><b class="saah-rating-' + sentimentClass(row.type) + '">' + escapeHtml(sentimentLabel(row.type)) + '</b><time>' + escapeHtml(new Date(row.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</time></div>').join('') + '</section>';
  }
  function titleCaseAuthor(name) {
    return name.split(/(\s+)/).map(part => /^\s+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('');
  }
  function sentimentLabel(type) { return ({ very_bullish: 'Strong Buy', bullish: 'Buy', neutral: 'Hold', bearish: 'Sell', very_bearish: 'Strong Sell' })[type] || prettyMetric(type); }
  function sentimentClass(type) { return ({ very_bullish: 'strong-buy', bullish: 'buy', neutral: 'hold', bearish: 'sell', very_bearish: 'strong-sell' })[type] || 'none'; }
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
      const ticker = await tickerFor(state);
      const [income, balance, cashflow, price] = await Promise.all([
        annualStatement(ticker, 'income-statement'), annualStatement(ticker, 'balance-sheet'), annualStatement(ticker, 'cash-flow-statement'),
        snapshotPrice(ticker).catch(() => null)
      ]);
      renderSnapshot(root, { income, balance, cashflow, quote: null, price }); state.snapshotLoaded = true;
    } catch (error) { root.textContent = error.message || 'Financial snapshot is unavailable.'; }
  }
  async function annualStatement(ticker, statement) {
    return financialStatement(ticker, 'annual', statement);
  }
  async function financialStatement(ticker, period, statement) {
    const key = [ticker, period, statement].join('|');
    let data = s.financialCache.get(key);
    if (!data) {
      const symbolPath = encodeURIComponent(ticker.toLowerCase()).replace(/%3A/gi, ':');
      data = await get('/api/v3/symbols/' + symbolPath + '/fundamentals_metrics?period_type=' + period + '&statement_type=' + statement + '&target_currency=USD');
      s.financialCache.set(key, data);
    }
    return data;
  }
  async function snapshotPrice(symbol) { return (await price(symbol)).at(-1)?.[1] ?? null; }
  function renderSnapshot(root, data) {
    const revenueSeries = snapshotMetricSeries(data.income, ['revenues', 'revenue']);
    const revenue = revenueSeries.at(-1), priorRevenue = revenueSeries.at(-2);
    const grossProfit = snapshotMetric(data.income, ['grossprofit']);
    const operatingIncome = snapshotMetric(data.income, ['operatingincome']);
    const pretaxIncome = snapshotMetric(data.income, ['pretaxincome', 'earningsbeforetax', 'incomebeforetax']);
    const netIncome = snapshotMetric(data.income, ['netincome']);
    const taxExpense = snapshotMetric(data.income, ['provisionforincometaxes', 'incometaxexpense']);
    const interestExpense = snapshotMetric(data.income, ['interestexpense', 'netinterestexpenses']);
    const assets = snapshotMetric(data.balance, ['totalassets']);
    const equity = snapshotMetric(data.balance, ['totalcommonequity', 'totalequity']);
    const currentAssets = snapshotMetric(data.balance, ['totalcurrentassets']);
    const currentLiabilities = snapshotMetric(data.balance, ['totalcurrentliabilities']);
    const cash = snapshotMetric(data.balance, ['cashandcashequivalents', 'cashcashequivalents', 'totalcashstinvestments', 'totalcashstinvestment']);
    const receivables = snapshotMetric(data.balance, ['totalreceivables', 'accountsreceivable']);
    const debt = snapshotMetric(data.balance, ['totaldebt', 'longtermdebt']);
    const cashFromOperations = snapshotMetric(data.cashflow, ['cashfromoperations', 'operatingcashflow']);
    const capex = snapshotMetric(data.cashflow, ['capitalexpenditures', 'capitalexpenditure', 'purchaseofpropertyplantandequipment']);
    const shareSeries = snapshotMetricSeries(data.income, ['weightedaveragesharesoutstanding', 'weightedaveragedilutedsharesoutstanding', 'dilutedweightedaveragesharesoutstanding', 'dilutedsharesoutstanding']);
    const shares = shareSeries.at(-1) || snapshotMetric(data.balance, ['commonsharesoutstanding', 'sharesoutstanding']);
    const priorShares = shareSeries.at(-2);
    const quote = data.quote || {}, price = Number(data.price);
    const reportedMarketCap = Number(quote.marketCap), derivedMarketCap = price * shares;
    const marketCap = Number.isFinite(reportedMarketCap) && reportedMarketCap > 0 ? reportedMarketCap : derivedMarketCap;
    const reportedEnterpriseValue = Number(quote.enterpriseValue);
    const enterpriseValue = Number.isFinite(reportedEnterpriseValue) && reportedEnterpriseValue > 0 ? reportedEnterpriseValue : marketCap + (debt || 0) - (cash || 0);
    const ratio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
    const multiple = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && numerator > 0 && denominator > 0 ? numerator / denominator : null;
    const first = (...values) => values.find(value => Number.isFinite(value)) ?? null;
    const freeCashFlow = Number.isFinite(cashFromOperations) && Number.isFinite(capex) ? cashFromOperations - Math.abs(capex) : null;
    const revenueGrowth = ratio(revenue - priorRevenue, priorRevenue);
    const shareGrowth = ratio(shares - priorShares, priorShares);
    const taxRate = ratio(Math.abs(taxExpense), pretaxIncome);
    const afterTaxOperatingIncome = Number.isFinite(operatingIncome) ? operatingIncome * (1 - (Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= .6 ? taxRate : .21)) : null;
    const netDebt = Number.isFinite(debt) && Number.isFinite(cash) ? debt - cash : null;
    const investedCapital = Number.isFinite(debt) && Number.isFinite(equity) && Number.isFinite(cash) ? debt + equity - cash : null;
    const grossMargin = ratio(grossProfit, revenue), capexIntensity = Number.isFinite(capex) ? ratio(Math.abs(capex), revenue) : null;
    const profile = !Number.isFinite(grossMargin) && !Number.isFinite(capexIntensity) ? 'Financial institution' : capexIntensity > .12 ? 'Capital-intensive business' : revenueGrowth > .15 && grossMargin > .4 ? 'Growth / asset-light business' : 'Operating business';
    const keyMetrics = profile === 'Financial institution'
      ? new Set(['P/B', 'Return on assets', 'Return on equity', 'Current ratio', 'Cash ratio'])
      : profile === 'Capital-intensive business'
        ? new Set(['EV / Sales', 'EV / FCF', 'FCF yield', 'Capex / revenue', 'FCF margin', 'Interest coverage', 'ROIC (approx.)', 'Net debt', 'Debt / capital'])
        : profile === 'Growth / asset-light business'
          ? new Set(['P/S', 'EV / Sales', 'Revenue growth', 'Gross margin', 'Operating margin', 'FCF margin', 'Revenue / share', 'FCF / share', 'Share-count growth'])
          : new Set(['P/E', 'EV / FCF', 'FCF yield', 'Operating margin', 'FCF margin', 'ROIC (approx.)', 'Interest coverage', 'Share-count growth']);
    const profileReason = profile === 'Capital-intensive business'
      ? 'Capex equals ' + snapshotPercent(capexIntensity) + ' of revenue here, so cash conversion, financing, and returns on new capacity are central to the investment case.'
      : profile === 'Growth / asset-light business'
        ? 'Revenue grew ' + snapshotPercent(revenueGrowth) + ' with a ' + snapshotPercent(grossMargin) + ' gross margin, so the key question is whether growth converts into durable cash flow per share.'
        : profile === 'Financial institution'
          ? 'Its reported statements do not follow a conventional gross-margin and capex profile, so capital strength, liquidity, and book value are more decision-useful than generic operating multiples.'
          : 'Its reported profile is a conventional operating business, so earnings, free-cash-flow conversion, capital returns, and financing burden drive shareholder value.';
    const valuation = [
      ['P/E', first(Number(quote.trailingPE), multiple(marketCap, netIncome))], ['P/S', first(Number(quote.priceToSalesTrailing12Months), multiple(marketCap, revenue))],
      ['P/B', first(Number(quote.priceToBook), multiple(marketCap, equity))], ['P / FCF', multiple(marketCap, freeCashFlow)],
      ['EV / Sales', first(Number(quote.enterpriseToRevenue), multiple(enterpriseValue, revenue))], ['EV / FCF', multiple(enterpriseValue, freeCashFlow)], ['FCF yield', ratio(freeCashFlow, marketCap), 'percent']
    ];
    const profitability = [['Gross margin', grossMargin, 'percent'], ['Operating margin', ratio(operatingIncome, revenue), 'percent'], ['Pretax margin', ratio(pretaxIncome, revenue), 'percent'], ['Net margin', ratio(netIncome, revenue), 'percent'], ['Return on assets', ratio(netIncome, assets), 'percent'], ['Return on equity', ratio(netIncome, equity), 'percent'], ['ROIC (approx.)', ratio(afterTaxOperatingIncome, investedCapital), 'percent']];
    const growthCash = [['Revenue growth', revenueGrowth, 'percent'], ['FCF margin', ratio(freeCashFlow, revenue), 'percent'], ['Capex / revenue', capexIntensity, 'percent'], ['Share-count growth', shareGrowth, 'percent']];
    const perShare = [['Revenue / share', ratio(revenue, shares), 'money'], ['FCF / share', ratio(freeCashFlow, shares), 'money'], ['Book value / share', ratio(equity, shares), 'money']];
    const efficiency = [['Asset turnover', ratio(revenue, assets)]];
    const liquidity = [['Current ratio', ratio(currentAssets, currentLiabilities)], ['Quick ratio', ratio((cash || 0) + (receivables || 0), currentLiabilities)], ['Cash ratio', ratio(cash, currentLiabilities)]];
    const capitalization = [['Net debt', netDebt, 'money'], ['Interest coverage', ratio(operatingIncome, Math.abs(interestExpense))], ['Debt / equity', ratio(debt, equity), 'percent'], ['Debt / assets', ratio(debt, assets), 'percent'], ['Debt / capital', ratio(debt, (debt || 0) + (equity || 0)), 'percent']];
    const section = (title, rows) => {
      const present = rows.filter(([, value]) => Number.isFinite(value));
      return present.length ? '<section><h3>' + title + '</h3>' + present.map(([label, value, format]) => '<div class="' + (keyMetrics.has(label) ? 'is-priority' : '') + '"><span>' + label + '</span><strong>' + (format === 'percent' ? snapshotPercent(value) : format === 'money' ? snapshotMoney(value) : snapshotNumber(value)) + '</strong></div>').join('') + '</section>' : '';
    };
    const html = section('Valuation', valuation) + section('Growth & cash', growthCash) + section('Profitability', profitability) + section('Per share', perShare) + section('Efficiency', efficiency) + section('Liquidity', liquidity) + section('Capitalization', capitalization);
    root.innerHTML = html ? '<h3 class="saah-section-title">Financial snapshot</h3><p class="saah-profile-footnote"><strong>Why these metrics:</strong> Emphasis is tailored to an inferred <b>' + escapeHtml(profile) + '</b> profile. ' + escapeHtml(profileReason) + '</p><div class="saah-snapshot-grid">' + html + '</div>' : 'Financial snapshot is unavailable for this selection.';
  }
  function renderFinancialHighlights(root, data, period) {
    const income = data.income, balance = data.balance, cashflow = data.cashflow;
    const revenue = snapshotMetric(income, ['totalrevenues', 'revenues', 'revenue']);
    const grossProfit = snapshotMetric(income, ['grossprofit']);
    const operatingIncome = snapshotMetric(income, ['operatingincome']);
    const netIncome = snapshotMetric(income, ['netincome', 'nitocommonexclextraitems']);
    const cash = snapshotMetric(balance, ['totalcashstinvestments', 'totalcashstinvestment', 'cashandcashequivalents', 'cashcashequivalents']);
    const assets = snapshotMetric(balance, ['totalassets']);
    const debt = snapshotMetric(balance, ['totaldebt', 'longtermdebt']);
    const equity = snapshotMetric(balance, ['totalcommonequity', 'totalequity']);
    const operatingCashFlow = snapshotMetric(cashflow, ['cashfromoperations', 'operatingcashflow']);
    const capex = snapshotMetric(cashflow, ['capitalexpenditures', 'capitalexpenditure', 'purchaseofpropertyplantandequipment']);
    const netCashChange = snapshotMetric(cashflow, ['netchangeincash', 'cashcashflow']);
    const interestExpense = snapshotMetric(income, ['interestexpense', 'netinterestexpenses']);
    const ratio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
    const fcf = Number.isFinite(operatingCashFlow) && Number.isFinite(capex) ? operatingCashFlow - Math.abs(capex) : null;
    const totalCapital = Number.isFinite(debt) && Number.isFinite(equity) ? debt + equity : null;
    const rows = (items, formatter = quickMoney) => items.filter(([, value]) => Number.isFinite(value)).map(([label, value]) => '<div><span>' + label + '</span><strong>' + formatter(value) + '</strong></div>').join('');
    const section = (title, items, formatter) => '<section><h3>' + title + '</h3>' + (rows(items, formatter) || '<p>No reported values.</p>') + '</section>';
    const solvencyRows = rows([['Net debt', Number.isFinite(debt) && Number.isFinite(cash) ? debt - cash : null]])
      + rows([['Debt / capital', ratio(debt, totalCapital)], ['Debt / equity', ratio(debt, equity)], ['Interest coverage', ratio(operatingIncome, Math.abs(interestExpense))]], quickRatio);
    root.querySelector('.saah-financial-quick-content').innerHTML =
      section('Income statement', [['Revenue', revenue], ['Gross profit', grossProfit], ['Operating income', operatingIncome], ['Net income', netIncome]])
      + section('Balance sheet', [['Cash & ST investments', cash], ['Total assets', assets], ['Total debt', debt], ['Total equity', equity]])
      + section('Cash flow statement', [['Cash from operations', operatingCashFlow], ['Capital expenditures', capex], ['Free cash flow', fcf], ['Net change in cash', netCashChange]])
      + '<section><h3>Long Term Solvency</h3>' + (solvencyRows || '<p>No reported values.</p>') + '</section>';
  }
  function quickMoney(value) { return Number.isFinite(value) ? snapshotMoney(value) : '—'; }
  function quickRatio(value) { return Number.isFinite(value) ? value.toFixed(2) + '×' : '—'; }
  function snapshotMetric(response, names) {
    return snapshotMetricSeries(response, names).at(-1) ?? null;
  }
  function snapshotMetricSeries(response, names) {
    const rows = (Array.isArray(response) ? response : response?.data || []).flatMap(section => section.rows || []);
    for (const name of names) {
      const row = rows.find(item => normalize(item.value || item.name).includes(name));
      const values = (row?.cells || []).map(item => Number(item.raw_value)).filter(Number.isFinite);
      if (values.length) return values;
    }
    return [];
  }
  function snapshotNumber(value) { return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'; }
  function snapshotPercent(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '—'; }
  function snapshotMoney(value) { return Number.isFinite(value) ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD', notation: Math.abs(value) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 2 }) : '—'; }
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
  async function ensure() {
    if (s.articleLoad) return s.articleLoad;
    s.articleLoad = (async () => {
      const since = Math.floor(Date.now() / 1000) - WINDOW;
      const feed = page => '/api/v3/feed?all[]=' + encodeURIComponent(s.slug) + '&filter[since]=' + since + '&include=primaryTickers,secondaryTickers,otherTags,sentiments&models[]=Article&page[number]=' + page + '&page[size]=20';
      const firstPage = await get(feed(1));
      const pages = [firstPage], lastPage = pageNumber(firstPage.links?.last);
      if (lastPage > 1) {
        const pageNumbers = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
        await pool(pageNumbers, 6, async page => { pages.push(await get(feed(page))); });
      } else {
        let page = 1, current = firstPage;
        while (current.links?.next) { current = await get(feed(++page)); pages.push(current); }
      }
      s.page = lastPage || pages.length; s.done = true;
      s.articles.push(...pages.flatMap(articles));
      const seen = new Set();
      s.articles = s.articles.filter(article => article.time >= since * 1000).sort((a, b) => a.time - b.time).filter(article => {
        if (seen.has(article.ticker)) return false;
        seen.add(article.ticker); return true;
      });
    })().catch(error => { s.articleLoad = null; throw error; });
    return s.articleLoad;
  }
  async function preloadGraphs(count) {
    if (s.graphPreload) return s.graphPreload;
    s.graphPreload = pool(s.articles.slice(0, count), 4, article => history(article.ticker).catch(() => null));
    return s.graphPreload;
  }
  function articles(data) {
    const inc = data.included || [], byId = new Map(inc.map(x => [x.type + ':' + x.id, x]));
    const sentiment = new Map(inc.filter(x => x.type === 'sentiment').map(x => [String(x.attributes?.articleId), x.attributes]));
    return (data.data || []).map(a => {
      const ref = a.relationships?.primaryTickers?.data?.[0], ticker = ref && byId.get(ref.type + ':' + ref.id)?.attributes?.slug;
      const rating = sentiment.get(String(a.id));
      const time = [a.attributes?.publishOn, a.attributes?.publishedAt, a.attributes?.createdAt, rating?.createdAt].map(timestamp).find(Number.isFinite);
      return ticker && rating && Number.isFinite(time) ? { ticker: ticker.toUpperCase(), time } : null;
    }).filter(Boolean);
  }
  function timestamp(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1e9) return numeric < 1e12 ? numeric * 1000 : numeric;
    return new Date(value).getTime();
  }
  function pageNumber(url) {
    try { return Number(new URL(url, location.origin).searchParams.get('page[number]')) || 0; } catch { return 0; }
  }
  async function history(ticker) {
    if (s.histories.has(ticker)) return s.histories.get(ticker);
    if (s.historyLoads.has(ticker)) return s.historyLoads.get(ticker);
    const load = (async () => {
      const since = Math.floor(Date.now() / 1000) - WINDOW;
      const data = await get('/api/v3/feed?all[]=' + encodeURIComponent(s.slug) + '&any_primary[]=' + encodeURIComponent(ticker.toLowerCase()) + '&filter[since]=' + since + '&include=primaryTickers,sentiments&models[]=Article');
      const ratings = (data.included || []).filter(x => x.type === 'sentiment').map(x => x.attributes).filter(x => x?.createdAt && x?.type).map(x => ({ time: new Date(x.createdAt).getTime(), type: x.type })).filter(item => item.time >= Date.now() - WINDOW * 1000).sort((a, b) => a.time - b.time);
      const first = Math.min(Date.now() - WINDOW * 1000, ...ratings.map(x => x.time));
      const prices = (await price(ticker, Math.floor(first / 1000)).catch(() => [])).filter(point => point[0] >= first).sort((a, b) => a[0] - b[0]);
      const result = { ratings, price: prices };
      // Do not retain a transient price-provider failure as a permanent
      // dots-only chart. A later hover can retry that ticker.
      if (prices.length > 1) s.histories.set(ticker, result);
      return result;
    })();
    s.historyLoads.set(ticker, load);
    try { return await load; } finally { s.historyLoads.delete(ticker); }
  }
  async function get(path) {
    if (location.hostname === 'seekingalpha.com' || location.hostname.endsWith('.seekingalpha.com')) {
      const response = await fetch(path, { credentials: 'include' });
      if (!response.ok) throw Error('Seeking Alpha returned ' + response.status);
      return response.json();
    }
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'seeking-alpha-api', path }, response => {
      if (chrome.runtime.lastError || !response?.ok) reject(Error(response?.error || 'Seeking Alpha data is unavailable'));
      else resolve(response.data);
    }));
  }
  const priceCache = new Map();
  function price(symbol) {
    const ticker = String(symbol || '').toLowerCase();
    if (priceCache.has(ticker)) return priceCache.get(ticker);
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - WINDOW * 1000).toISOString().slice(0, 10);
    const load = get('/api/v3/historical_prices?filter[ticker][slug][]=' + encodeURIComponent(ticker) + '&filter[as_of_date][gte]=' + start + '&filter[as_of_date][lte]=' + end + '&sort=as_of_date')
      .then(data => historicalPricePoints(data))
      .then(points => {
        if (!points.length) throw Error('No Seeking Alpha price history returned');
        return points;
      });
    priceCache.set(ticker, load);
    return load.catch(error => { priceCache.delete(ticker); throw error; });
  }
  function historicalPricePoints(data) {
    // SA returns the bars inside a ticker resource, but that wrapper has
    // varied between chart surfaces. Find OHLC rows by their fields instead
    // of relying on one particular JSON:API nesting level.
    const bars = [], seen = new Set(), stack = [data];
    while (stack.length) {
      const value = stack.pop();
      if (Array.isArray(value)) { stack.push(...value); continue; }
      if (!value || typeof value !== 'object') continue;
      const time = timestamp(value.as_of_date || value.date || value.time || value.timestamp);
      const close = Number(value.close ?? value.adjustedClose ?? value.adjusted_close ?? value.adjClose);
      if (Number.isFinite(time) && Number.isFinite(close)) {
        const key = time + ':' + close;
        if (!seen.has(key)) { seen.add(key); bars.push([time, close]); }
      }
      stack.push(...Object.values(value));
    }
    return bars.sort((a, b) => a[0] - b[0]);
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
    const prices = h.price.map(p => p[1]), ratings = [...h.ratings].sort((a, b) => a.time - b.time), minT = Math.min(...times), maxT = Math.max(...times, Date.now()), minP = Math.min(...prices), maxP = Math.max(...prices);
    const x = t => 8 + (t - minT) / Math.max(1, maxT - minT) * (w - 16), y = p => 12 + (1 - (p - minP) / Math.max(.001, maxP - minP)) * (ht - 24);
    c.strokeStyle = '#263137'; for (let i = 0; i < 3; i++) { const gy = 12 + i * (ht - 24) / 2; c.beginPath(); c.moveTo(8, gy); c.lineTo(w - 8, gy); c.stroke(); }
    drawMonthAxis(c, minT, maxT, x, w, ht);
    if (h.price.length > 1) {
      let ratingIndex = -1;
      c.lineWidth = 2;
      for (let i = 1; i < h.price.length; i++) {
        const previous = h.price[i - 1], current = h.price[i];
        while (ratingIndex + 1 < ratings.length && ratings[ratingIndex + 1].time <= current[0]) ratingIndex++;
        c.strokeStyle = ratingIndex < 0 ? defaultPriceColor : (color[ratings[ratingIndex].type] || defaultPriceColor);
        c.beginPath(); c.moveTo(x(previous[0]), y(previous[1])); c.lineTo(x(current[0]), y(current[1])); c.stroke();
      }
    }
    ratings.forEach(r => { c.fillStyle = color[r.type] || '#f8df63'; c.beginPath(); c.arc(x(r.time), prices.length ? y(nearest(h.price, r.time)) : ht / 2, 5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#101718'; c.lineWidth = 2; c.stroke(); });
    const card = canvas.closest('.saah-card'), tooltip = document.createElement('span'), cursor = document.createElement('i');
    tooltip.className = 'saah-chart-tooltip'; card?.append(tooltip);
    cursor.className = 'saah-chart-cursor'; card?.append(cursor);
    canvas.addEventListener('mousemove', event => {
      const rect = canvas.getBoundingClientRect(), localX = event.clientX - rect.left, localY = event.clientY - rect.top;
      const hoveredTime = minT + (localX - 8) / Math.max(1, w - 16) * (maxT - minT);
      const rating = ratings.reduce((closest, item) => !closest || Math.abs(x(item.time) - localX) < Math.abs(x(closest.time) - localX) ? item : closest, null);
      const point = nearestPoint(h.price, hoveredTime);
      const target = rating && Math.abs(x(rating.time) - localX) <= 10 ? rating.time : point?.[0];
      if (!target || !tooltip) return;
      tooltip.textContent = chartDate(target);
      tooltip.classList.add('is-visible');
      tooltip.style.left = Math.max(canvas.offsetLeft + 4, Math.min(canvas.offsetLeft + localX + 8, canvas.offsetLeft + w - tooltip.offsetWidth - 4)) + 'px';
      tooltip.style.bottom = 'auto';
      tooltip.style.top = Math.max(canvas.offsetTop + 3, Math.min(canvas.offsetTop + localY - tooltip.offsetHeight / 2, canvas.offsetTop + ht - tooltip.offsetHeight - 3)) + 'px';
      cursor.style.left = (canvas.offsetLeft + localX) + 'px';
      cursor.style.top = canvas.offsetTop + 'px';
      cursor.style.height = canvas.clientHeight + 'px';
      cursor.classList.add('is-visible');
    });
    canvas.addEventListener('mouseleave', () => { tooltip?.classList.remove('is-visible'); cursor?.classList.remove('is-visible'); });
  }
  function drawMonthAxis(context, minTime, maxTime, x, width, height) {
    const date = new Date(minTime); date.setDate(1); date.setHours(0, 0, 0, 0); if (date.getTime() <= minTime) date.setMonth(date.getMonth() + 1);
    const months = [];
    while (date.getTime() < maxTime) { months.push(new Date(date)); date.setMonth(date.getMonth() + 1); }
    const step = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor((width - 16) / 42))));
    context.font = '9px system-ui'; context.fillStyle = '#809095'; context.strokeStyle = '#202c30'; context.textAlign = 'center';
    months.forEach((month, index) => {
      if (index % step) return;
      const px = x(month.getTime()); context.beginPath(); context.moveTo(px, 10); context.lineTo(px, height - 18); context.stroke();
      context.fillText(month.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(month.getFullYear()).slice(-2), px, height - 4);
    });
  }
  function nearest(points, time) { return points.reduce((a, p) => Math.abs(p[0] - time) < Math.abs(a[0] - time) ? p : a, points[0])[1]; }
  function nearestPoint(points, time) { return points.reduce((a, p) => Math.abs(p[0] - time) < Math.abs(a[0] - time) ? p : a, points[0]); }
  function chartDate(time) { const date = new Date(time); return String(date.getMonth() + 1).padStart(2, '0') + '/' + String(date.getDate()).padStart(2, '0') + '/' + date.getFullYear(); }
  function status(text) { const el = s.panel?.querySelector('.saah-status'); if (el) el.textContent = text; }
  function clearPreview() {
    s.label?.remove();
    s.financialLabel?.remove();
    s.panel?.remove();
    s.financialPanel?.remove();
    Object.assign(s, { slug: '', page: 0, articles: [], articleLoad: null, graphPreload: null, cards: [], done: false, loading: false, histories: new Map(), historyLoads: new Map(), label: null, financialLabel: null, authorLink: null, articleTicker: null, financialCache: new Map(), panel: null, financialPanel: null });
  }
  addEventListener('resize', () => { positionLabel(); if (s.panel?.classList.contains('is-open')) { place(s.label); render(); } if (s.financialPanel?.classList.contains('is-open')) placeFinancial(s.financialLabel, s.financialPanel); });
  addEventListener('scroll', positionLabel, true);
  init();
  // Seeking Alpha can replace the author byline after the initial page paint.
  // Reattach the label if that client-side render removes it.
  let queued = false;
  new MutationObserver(() => {
    if (!location.pathname.startsWith('/article/') || queued || s.label?.isConnected) return;
    queued = true;
    setTimeout(() => { queued = false; init(); }, 250);
  }).observe(document.documentElement || document, { childList: true, subtree: true });
  // A final fallback for articles whose byline is replaced without a normal
  // DOM mutation visible to the isolated extension world.
  // Keep watching throughout the article's initial client-side render. SA
  // sometimes paints the byline after the extension's first lifecycle event.
  setInterval(() => {
    if (location.pathname.startsWith('/article/')) init();
  }, 500);
  const retryVisibleArticle = () => {
    if (!location.pathname.startsWith('/article/')) return;
    init();
    requestAnimationFrame(positionLabel);
  };
  addEventListener('pageshow', retryVisibleArticle);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) retryVisibleArticle(); });
  let activeUrl = location.href;
  setInterval(() => {
    if (location.href !== activeUrl) {
      activeUrl = location.href;
      clearPreview();
    }
    if (!location.pathname.startsWith('/article/')) return;
    const currentAuthor = author();
    if (!currentAuthor) return;
    if (!s.label?.isConnected || !s.financialLabel?.isConnected || s.authorLink !== currentAuthor) init();
    else positionLabel();
  }, 250);
})();
}
