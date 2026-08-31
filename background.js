const cache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'price-history') return;
  prices(message.symbol, message.period1).then(points => respond({ ok: true, points }))
    .catch(error => respond({ ok: false, error: error.message }));
  return true;
});

async function prices(symbol, period1) {
  const sourceTicker = symbol.replace('.', '-').toUpperCase();
  // Seeking Alpha uses SP500 for the index; Yahoo Finance uses ^GSPC.
  const ticker = sourceTicker === 'SP500' ? '^GSPC' : sourceTicker;
  const key = `${ticker}:${period1}`;
  if (cache.has(key)) return cache.get(key);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
  url.search = new URLSearchParams({ period1, period2: Math.floor(Date.now() / 1000), interval: '1d', events: 'history' });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Price data unavailable (${response.status})`);
  const result = (await response.json()).chart?.result?.[0];
  const points = (result?.timestamp || []).map((time, i) => [time * 1000, result.indicators?.quote?.[0]?.close?.[i]])
    .filter(([, close]) => Number.isFinite(close));
  if (!points.length) throw new Error('No price history returned');
  cache.set(key, points);
  return points;
}
