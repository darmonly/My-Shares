import { NextRequest, NextResponse } from 'next/server';

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
  const response = await fetch(`${STOOQ_QUOTE_URL}?${params.toString()}`, { next: { revalidate: 60 } });
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
  const response = await fetch(`${STOOQ_HISTORY_URL}?${params.toString()}`, { next: { revalidate: 3600 } });
  if (!response.ok) return [];
  return parseHistory(await response.text());
}

export async function GET(request: NextRequest) {
  const requestedSymbols = request.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = requestedSymbols
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, ''))
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [], history: {} });
  }

  try {
    const [quotes, histories] = await Promise.all([
      loadQuotes(symbols),
      Promise.all(symbols.map(async (symbol) => [symbol, await loadHistory(symbol)] as const))
    ]);

    return NextResponse.json({ quotes, history: Object.fromEntries(histories) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load market data.' },
      { status: 502 }
    );
  }
}
