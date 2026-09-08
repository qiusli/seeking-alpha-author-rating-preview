const secCache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  const task = message?.type === 'insider-activity' ? insiderActivity(message.symbol).then(data => ({ data })) : null;
  if (!task) return;
  task.then(result => respond({ ok: true, ...result }))
    .catch(error => respond({ ok: false, error: error.message }));
  return true;
});

async function insiderActivity(symbol) {
  const ticker = symbol.replace('.', '-').toUpperCase();
  const key = `insiders:${ticker}`;
  if (secCache.has(key)) return secCache.get(key);
  const first = await nasdaqPage(ticker, 0);
  const data = first.data || {}, table = data.transactionTable || {}, totalRecords = Number(table.totalRecords) || 0;
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
  let rows = table.table?.rows || [], offset = rows.length;
  while (offset < totalRecords && rows.length < 500) {
    const oldest = normalizeNasdaqDate(rows.at(-1)?.lastDate);
    if (oldest && new Date(oldest + 'T00:00:00Z') < cutoff) break;
    const page = await nasdaqPage(ticker, offset), next = page.data?.transactionTable?.table?.rows || [];
    if (!next.length) break;
    rows.push(...next); offset += next.length;
  }
  const periods = ['months3', 'months12'].map(period => nasdaqSummary(data, period));
  const sixMonths = summarizeRows(rows.filter(row => {
    const date = normalizeNasdaqDate(row.lastDate); return date && new Date(date + 'T00:00:00Z') >= cutoff;
  }));
  periods.splice(1, 0, { label: 'Last 6 months', ...sixMonths });
  const result = { ticker, periods };
  secCache.set(key, result);
  return result;
}
async function nasdaqPage(ticker, offset) {
  const url = new URL(`https://api.nasdaq.com/api/company/${encodeURIComponent(ticker)}/insider-trades`);
  url.search = new URLSearchParams({ limit: '50', offset: String(offset) });
  const response = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' } });
  if (!response.ok) throw new Error(`Insider data unavailable (${response.status})`);
  return response.json();
}
function nasdaqSummary(data, period) {
  const trades = data.numberOfTrades?.rows || [], shares = data.numberOfSharesTraded?.rows || [];
  const value = (rows, matcher) => numberValue(rows.find(row => matcher.test(row.insiderTrade || ''))?.[period]);
  return { label: period === 'months3' ? 'Last 3 months' : 'Last 12 months', purchases: value(trades, /open market buys/i), sales: value(trades, /number of sells/i), purchaseShares: value(shares, /shares bought/i), saleShares: value(shares, /shares sold/i) };
}
function summarizeRows(rows) {
  return rows.reduce((summary, row) => {
    const shares = numberValue(row.sharesTraded) || 0, kind = nasdaqKind(row.transactionType);
    if (kind === 'Buy') { summary.purchases++; summary.purchaseShares += shares; }
    if (kind === 'Sell') { summary.sales++; summary.saleShares += shares; }
    return summary;
  }, { purchases: 0, sales: 0, purchaseShares: 0, saleShares: 0 });
}
function normalizeNasdaqDate(value) {
  const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function numberValue(value) { const parsed = Number(String(value || '').replace(/[^0-9.-]/g, '')); return Number.isFinite(parsed) ? parsed : null; }
function nasdaqKind(value) {
  const type = String(value || 'Reported transaction');
  if (/sell|disposition/i.test(type)) return 'Sell';
  if (/buy|purchase/i.test(type)) return 'Buy';
  if (/option.*execute/i.test(type)) return 'Option exercise';
  return type;
}
