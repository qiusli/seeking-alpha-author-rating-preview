const cache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  const task = message?.type === 'price-history' ? prices(message.symbol, message.period1).then(points => ({ points })) : null;
  if (!task) return;
  task.then(result => respond({ ok: true, ...result }))
    .catch(error => respond({ ok: false, error: error.message }));
  return true;
});

function yahooSymbol(symbol) {
  const sourceTicker = symbol.replace('.', '-').toUpperCase();
  const aliases = { SP500: '^GSPC', 'VHI:CA': 'VHI.TO' };
  return aliases[sourceTicker] || sourceTicker;
}

async function prices(symbol, period1) {
  const ticker = yahooSymbol(symbol);
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
