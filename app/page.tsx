'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Quote = {
  symbol: string;
  name: string;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type HistoryPoint = {
  date: string;
  close: number;
  [symbol: string]: string | number;
};

type AlertRule = {
  min: string;
  max: string;
};

const DEFAULT_SYMBOLS = ['NVDA', 'SPCX', 'MSFT', 'TSLA', 'AAPL'];
const COLORS = ['#a78bfa', '#22d3ee', '#fb923c', '#4ade80', '#f87171', '#60a5fa', '#f472b6', '#bef264'];

type StooqQuote = {
  symbol?: string;
  name?: string;
  date?: string;
  time?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type AlphaVantageDailyRow = {
  '1. open'?: string;
  '2. high'?: string;
  '3. low'?: string;
  '4. close'?: string;
  '5. volume'?: string;
};

type AlphaVantageDailyPayload = {
  'Meta Data'?: {
    '2. Symbol'?: string;
  };
  'Time Series (Daily)'?: Record<string, AlphaVantageDailyRow>;
  Note?: string;
  Information?: string;
  'Error Message'?: string;
};

const STOOQ_QUOTE_URL = 'https://stooq.com/q/l/';
const STOOQ_HISTORY_URL = 'https://stooq.com/q/d/l/';
const ALPHA_VANTAGE_API_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query';
const MARKET_DATA_HINT = 'Could not load free market data. The app tried Stooq directly and through public CORS proxies. If those public endpoints are down, add a free Alpha Vantage key as NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY.';

function toStooqSymbol(symbol: string) {
  const clean = symbol.trim().toLowerCase().replace(/[^a-z0-9.\-]/g, '');
  return clean.includes('.') ? clean : `${clean}.us`;
}

function fromStooqSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/\.US$/, '');
}

function startDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function proxyUrls(url: string) {
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];
}

async function fetchWithFallback(url: string) {
  const errors: string[] = [];

  for (const candidate of proxyUrls(url)) {
    try {
      const response = await fetch(candidate);
      if (response.ok) return response;
      errors.push(`${new URL(candidate).hostname}: ${response.status}`);
    } catch (issue) {
      errors.push(`${new URL(candidate).hostname}: ${issue instanceof Error ? issue.message : 'failed'}`);
    }
  }

  throw new Error(errors.join('; '));
}

function parseHistory(csv: string) {
  const [headerLine, ...lines] = csv.trim().split('\n');
  if (!headerLine || headerLine.includes('No data')) return [];

  const headers = headerLine.split(',');
  return lines
    .map((line) => {
      const values = line.split(',');
      return Object.fromEntries(headers.map((header, index) => [header.toLowerCase(), values[index]]));
    })
    .filter((row) => row.date && row.close && row.close !== 'N/D')
    .map((row) => ({
      date: row.date,
      close: Number(row.close)
    }));
}

async function loadStooqQuotes(symbols: string[]) {
  const stooqSymbols = symbols.map(toStooqSymbol);
  const params = new URLSearchParams({ s: stooqSymbols.join(','), f: 'sd2t2ohlcvn', h: '', e: 'json' });
  const response = await fetchWithFallback(`${STOOQ_QUOTE_URL}?${params.toString()}`);
  const payload = await response.json();
  const rows: StooqQuote[] = Array.isArray(payload.symbols) ? payload.symbols : [payload.symbols].filter(Boolean);

  return rows
    .filter((row) => row.close && row.close !== 'N/D')
    .map((row) => ({
      symbol: fromStooqSymbol(row.symbol ?? ''),
      name: row.name ?? fromStooqSymbol(row.symbol ?? ''),
      date: row.date ?? '',
      time: row.time ?? '',
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume)
    }));
}

async function loadStooqHistory(symbol: string, days = 365) {
  const params = new URLSearchParams({ s: toStooqSymbol(symbol), d1: startDate(days), i: 'd' });
  const response = await fetchWithFallback(`${STOOQ_HISTORY_URL}?${params.toString()}`);
  return parseHistory(await response.text());
}

async function loadAlphaVantageDaily(symbol: string) {
  if (!ALPHA_VANTAGE_API_KEY) return null;

  const params = new URLSearchParams({
    function: 'TIME_SERIES_DAILY',
    symbol,
    outputsize: 'compact',
    apikey: ALPHA_VANTAGE_API_KEY
  });
  const response = await fetch(`${ALPHA_VANTAGE_URL}?${params.toString()}`);
  if (!response.ok) return null;

  const payload = (await response.json()) as AlphaVantageDailyPayload;
  if (payload.Note || payload.Information || payload['Error Message'] || !payload['Time Series (Daily)']) return null;

  const entries = Object.entries(payload['Time Series (Daily)']).sort(([left], [right]) => left.localeCompare(right));
  const history = entries.map(([date, row]) => ({ date, close: Number(row['4. close']) })).filter((row) => Number.isFinite(row.close));
  const [date = '', latest] = entries.at(-1) ?? [];

  if (!latest) return { quote: null, history };

  return {
    quote: {
      symbol: payload['Meta Data']?.['2. Symbol'] ?? symbol,
      name: symbol,
      date,
      time: 'close',
      open: Number(latest['1. open']),
      high: Number(latest['2. high']),
      low: Number(latest['3. low']),
      close: Number(latest['4. close']),
      volume: Number(latest['5. volume'])
    },
    history
  };
}

async function loadAlphaVantageMarketData(symbols: string[]) {
  const rows = await Promise.all(symbols.map(async (symbol) => [symbol, await loadAlphaVantageDaily(symbol)] as const));
  const quotes = rows.map(([, data]) => data?.quote).filter((quote): quote is Quote => Boolean(quote));
  const history = Object.fromEntries(rows.map(([symbol, data]) => [symbol, data?.history ?? []]));
  return quotes.length > 0 ? { quotes, history } : null;
}

async function loadMarketData(symbols: string[]) {
  if (symbols.length === 0) return { quotes: [], history: {} };

  try {
    const [quotes, histories] = await Promise.all([
      loadStooqQuotes(symbols),
      Promise.all(symbols.map(async (symbol) => [symbol, await loadStooqHistory(symbol)] as const))
    ]);

    return { quotes, history: Object.fromEntries(histories) };
  } catch {
    const alphaVantageData = await loadAlphaVantageMarketData(symbols);
    if (alphaVantageData) return alphaVantageData;
    throw new Error(MARKET_DATA_HINT);
  }
}

function historyBounds(points: HistoryPoint[]) {
  const closes = points.map((point) => point.close).filter(Number.isFinite);
  if (closes.length === 0) return { min: '', max: '' };
  return {
    min: Math.min(...closes).toFixed(2),
    max: Math.max(...closes).toFixed(2)
  };
}

export default function Home() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [newSymbol, setNewSymbol] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [alerts, setAlerts] = useState<Record<string, AlertRule>>({});
  const [notificationStatus, setNotificationStatus] = useState('Browser notifications are off.');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastNotified, setLastNotified] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedSymbols = window.localStorage.getItem('share-symbols');
    const savedAlerts = window.localStorage.getItem('share-alerts');
    const savedTheme = window.localStorage.getItem('share-theme');

    if (savedSymbols) setSymbols(JSON.parse(savedSymbols));
    if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
    if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
    if ('Notification' in window) setNotificationStatus(`Browser notifications are ${Notification.permission}.`);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('share-symbols', JSON.stringify(symbols));
  }, [symbols]);

  useEffect(() => {
    window.localStorage.setItem('share-alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('share-theme', theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const marketData = await loadMarketData(symbols);

        if (!cancelled) {
          setQuotes(marketData.quotes);
          setHistory(marketData.history);
          setAlerts((current) => {
            const next = { ...current };
            for (const symbol of symbols) {
              if (!next[symbol] || (!next[symbol].min && !next[symbol].max)) {
                next[symbol] = { ...historyBounds(marketData.history[symbol] ?? []), ...next[symbol] };
              }
            }
            return next;
          });
        }
      } catch (issue) {
        if (!cancelled) {
          setError(
            issue instanceof Error
              ? issue.message
              : 'Something went wrong.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    const interval = window.setInterval(loadData, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [symbols]);

  useEffect(() => {
    quotes.forEach((quote) => {
      const rule = alerts[quote.symbol];
      if (!rule || !('Notification' in window) || Notification.permission !== 'granted') return;

      const min = Number(rule.min);
      const max = Number(rule.max);
      const key = `${quote.symbol}-${quote.close}`;

      if (Number.isFinite(min) && quote.close <= min && lastNotified[quote.symbol] !== key) {
        new Notification(`${quote.symbol} reached your minimum`, {
          body: `${quote.symbol} is now $${quote.close.toFixed(2)}. Your minimum alert is $${min}.`
        });
        setLastNotified((previous) => ({ ...previous, [quote.symbol]: key }));
      }

      if (Number.isFinite(max) && quote.close >= max && lastNotified[quote.symbol] !== key) {
        new Notification(`${quote.symbol} reached your maximum`, {
          body: `${quote.symbol} is now $${quote.close.toFixed(2)}. Your maximum alert is $${max}.`
        });
        setLastNotified((previous) => ({ ...previous, [quote.symbol]: key }));
      }
    });
  }, [alerts, lastNotified, quotes]);

  async function requestNotifications() {
    if (!('Notification' in window)) {
      setNotificationStatus('This browser does not support notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationStatus(`Browser notifications are ${permission}.`);
  }

  function addSymbol(event: FormEvent) {
    event.preventDefault();
    const symbol = newSymbol.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (symbol && !symbols.includes(symbol)) setSymbols((current) => [...current, symbol]);
    setNewSymbol('');
  }

  function removeSymbol(symbol: string) {
    setSymbols((current) => current.filter((item) => item !== symbol));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Public GitHub Pages share tracker</p>
          <h1>Track shares, review separate charts, and get price notices while the site is open.</h1>
          <p>
            Uses free Stooq market data with public CORS fallbacks. You can also add a free Alpha Vantage key if public endpoints are unavailable.
            Initial shares include NVDA, SPCX, MSFT, TSLA, and AAPL.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))} type="button">
            {theme === 'dark' ? 'Bright mode' : 'Dark mode'}
          </button>
          <button onClick={requestNotifications}>Enable window notices</button>
        </div>
      </section>

      <p className="notice">{notificationStatus} Prices refresh every 60 seconds while this page is open.</p>

      <form className="add-form" onSubmit={addSymbol}>
        <input
          aria-label="Stock symbol"
          placeholder="Add symbol, for example AMD"
          value={newSymbol}
          onChange={(event) => setNewSymbol(event.target.value)}
        />
        <button type="submit">Add share</button>
      </form>

      {error && <p className="error">{error}</p>}

      <section className="charts-grid">
        {symbols.map((symbol, index) => {
          const points = history[symbol] ?? [];
          const bounds = historyBounds(points);
          return (
            <article className="card chart-card" key={`${symbol}-chart`}>
              <div className="section-title">
                <div>
                  <h2>{symbol} graph</h2>
                  <span>{bounds.min && bounds.max ? `Range $${bounds.min} - $${bounds.max}` : 'Waiting for history'}</span>
                </div>
                <span>{loading ? 'Loading...' : `${points.length} daily points`}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={points} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" minTickGap={32} />
                  <YAxis domain={['dataMin', 'dataMax']} width={72} />
                  <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                  <Line type="monotone" dataKey="close" name={symbol} stroke={COLORS[index % COLORS.length]} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </article>
          );
        })}
      </section>

      <section className="grid">
        {symbols.map((symbol) => {
          const quote = quotes.find((item) => item.symbol === symbol);
          const rule = alerts[symbol] ?? { min: '', max: '' };
          return (
            <article className="card quote-card" key={symbol}>
              <div className="quote-header">
                <div>
                  <h3>{symbol}</h3>
                  <p>{quote?.name ?? 'Waiting for quote'}</p>
                </div>
                <button className="ghost" onClick={() => removeSymbol(symbol)} type="button">Remove</button>
              </div>
              <strong>{quote ? `$${quote.close.toFixed(2)}` : '—'}</strong>
              <dl>
                <div><dt>Open</dt><dd>{quote ? `$${quote.open.toFixed(2)}` : '—'}</dd></div>
                <div><dt>High</dt><dd>{quote ? `$${quote.high.toFixed(2)}` : '—'}</dd></div>
                <div><dt>Low</dt><dd>{quote ? `$${quote.low.toFixed(2)}` : '—'}</dd></div>
                <div><dt>Volume</dt><dd>{quote ? quote.volume.toLocaleString() : '—'}</dd></div>
              </dl>
              <div className="alert-inputs">
                <label>
                  Minimum notice
                  <input
                    type="number"
                    step="0.01"
                    placeholder={historyBounds(history[symbol] ?? []).min || "Min"}
                    value={rule.min}
                    onChange={(event) => setAlerts((current) => ({ ...current, [symbol]: { ...rule, min: event.target.value } }))}
                  />
                </label>
                <label>
                  Maximum notice
                  <input
                    type="number"
                    step="0.01"
                    placeholder={historyBounds(history[symbol] ?? []).max || "Max"}
                    value={rule.max}
                    onChange={(event) => setAlerts((current) => ({ ...current, [symbol]: { ...rule, max: event.target.value } }))}
                  />
                </label>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
