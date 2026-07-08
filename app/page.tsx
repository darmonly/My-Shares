'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

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

const DEFAULT_SYMBOLS = ['NVDA', 'SPCX', 'MSFT', 'TSLA', 'AAPL'];
const COLORS = ['#7c3aed', '#0891b2', '#f97316', '#16a34a', '#dc2626', '#2563eb', '#db2777', '#65a30d'];
const STOOQ_QUOTE_URL = 'https://stooq.com/q/l/';
const STOOQ_HISTORY_URL = 'https://stooq.com/q/d/l/';

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

async function loadQuotes(symbols: string[]) {
  const stooqSymbols = symbols.map(toStooqSymbol);
  const params = new URLSearchParams({ s: stooqSymbols.join(','), f: 'sd2t2ohlcvn', h: '', e: 'json' });
  const response = await fetch(`${STOOQ_QUOTE_URL}?${params.toString()}`);
  if (!response.ok) throw new Error('Could not load quotes from Stooq.');

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

async function loadHistory(symbol: string, days = 365) {
  const params = new URLSearchParams({ s: toStooqSymbol(symbol), d1: startDate(days), i: 'd' });
  const response = await fetch(`${STOOQ_HISTORY_URL}?${params.toString()}`);
  if (!response.ok) return [];
  return parseHistory(await response.text());
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

  useEffect(() => {
    const savedSymbols = window.localStorage.getItem('share-symbols');
    const savedAlerts = window.localStorage.getItem('share-alerts');

    if (savedSymbols) setSymbols(JSON.parse(savedSymbols));
    if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
    if ('Notification' in window) setNotificationStatus(`Browser notifications are ${Notification.permission}.`);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('share-symbols', JSON.stringify(symbols));
  }, [symbols]);

  useEffect(() => {
    window.localStorage.setItem('share-alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const [quoteRows, histories] = await Promise.all([
          loadQuotes(symbols),
          Promise.all(symbols.map(async (symbol) => [symbol, await loadHistory(symbol)] as const))
        ]);

        if (!cancelled) {
          setQuotes(quoteRows);
          setHistory(Object.fromEntries(histories));
        }
      } catch (issue) {
        if (!cancelled) {
          setError(
            issue instanceof Error
              ? `${issue.message} If this happens on GitHub Pages, the free provider may be blocking browser requests. Try again later or use a different symbol.`
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

  const chartData = useMemo(() => {
    const rows = new Map<string, HistoryPoint>();

    for (const symbol of symbols) {
      for (const point of history[symbol] ?? []) {
        const row = rows.get(point.date) ?? { date: point.date, close: point.close };
        row[symbol] = point.close;
        rows.set(point.date, row);
      }
    }

    return Array.from(rows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [history, symbols]);

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
          <h1>Track shares, compare charts, and get price notices while the site is open.</h1>
          <p>
            Uses the free Stooq market data feed directly from the browser, so the site can be hosted on GitHub Pages with no backend and no API key.
            Initial shares include NVDA, SPCX, MSFT, TSLA, and AAPL.
          </p>
        </div>
        <button onClick={requestNotifications}>Enable window notices</button>
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

      <section className="card chart-card">
        <div className="section-title">
          <h2>Multiple share graph</h2>
          <span>{loading ? 'Loading market data...' : `${chartData.length} daily points`}</span>
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={32} />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
            <Legend />
            {symbols.map((symbol, index) => (
              <Line key={symbol} type="monotone" dataKey={symbol} stroke={COLORS[index % COLORS.length]} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
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
                    placeholder="5"
                    value={rule.min}
                    onChange={(event) => setAlerts((current) => ({ ...current, [symbol]: { ...rule, min: event.target.value } }))}
                  />
                </label>
                <label>
                  Maximum notice
                  <input
                    type="number"
                    step="0.01"
                    placeholder="10"
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
