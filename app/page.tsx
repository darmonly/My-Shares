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

type MarketResponse = {
  quotes: Quote[];
  history: Record<string, HistoryPoint[]>;
  error?: string;
};

async function loadMarketData(symbols: string[]) {
  const params = new URLSearchParams({ symbols: symbols.join(',') });
  const response = await fetch(`/api/market?${params.toString()}`);
  const payload: MarketResponse = await response.json();

  if (!response.ok || payload.error) throw new Error(payload.error ?? 'Could not load market data.');
  return payload;
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
            Uses a same-origin market data route, so browser CORS blocks stay away from the dashboard.
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
