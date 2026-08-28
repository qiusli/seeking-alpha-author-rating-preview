(() => {
  const PAGE = 10, WINDOW = 730 * 86400;
  const color = { very_bullish: '#2f7d45', bullish: '#8acb8c', neutral: '#f8df63', bearish: '#ed7474', very_bearish: '#a63232' };
  const defaultPriceColor = '#75838a';
  const s = { slug: '', page: 0, articles: [], cards: [], done: false, loading: false, histories: new Map(), label: null, authorLink: null };

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
    positionLabel();
    requestAnimationFrame(positionLabel);
    s.panel = panel(label);
    ensure(PAGE).catch(() => {});
  }
  function positionLabel() {
    if (!s.label) return;
    if (!s.authorLink?.isConnected) { s.label.style.display = 'none'; return; }
    const r = s.authorLink.getBoundingClientRect();
    s.label.style.display = r.width > 0 && r.bottom > 0 && r.top < innerHeight ? 'inline-flex' : 'none';
    s.label.style.left = `${r.right + 8}px`;
    s.label.style.top = `${r.top + Math.max(0, (r.height - s.label.offsetHeight) / 2)}px`;
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
    s.panel?.remove();
    Object.assign(s, { slug: '', page: 0, articles: [], cards: [], done: false, loading: false, histories: new Map(), label: null, authorLink: null, panel: null });
  }
  addEventListener('resize', () => { positionLabel(); if (s.panel?.classList.contains('is-open')) { place(s.label); render(); } });
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
