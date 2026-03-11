"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

function clean(v?: string | null) {
  return (v ?? "").replace(/[\r\n]/g, "").trim();
}

function formatDate(raw: string) {
  if (!raw) return "—";
  const datePart = clean(raw).slice(0, 10);
  const parts = datePart.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return clean(raw);
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatQty(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n % 1 === 0
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 4 });
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ── Normalised row (works for both old and new API shape) ─
type StockRow = {
  id: string;
  Begin46Date: string;      // always stored as YYYY-MM-DD after normalise
  ProductName: string;
  ColorName: string;
  SUM: number;
  type: string;             // "edit" | "receive" | "pay"
  LotList_Sorted: string;
  DocNo: string;
};
function countLots(lotList: string): number {
  if (!lotList) return 0;

  const lots = lotList.split(",").map(l => l.trim()).filter(Boolean);

  let total = 0;

  for (const lot of lots) {
    const rangeMatch = lot.match(/^(.*?)(\d+)[–-](.*?)(\d+)$/);

    // range: 680906001–680906040
    if (rangeMatch) {
      const start = parseInt(rangeMatch[2], 10);
      const end   = parseInt(rangeMatch[4], 10);
      if (!isNaN(start) && !isNaN(end)) {
        total += end - start + 1;
        continue;
      }
    }

    // single lot
    total += 1;
  }

  return total;
}
// Convert the new API response item → StockRow
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseRow(r: any): StockRow {

  let qty = r.SUM ?? r.TotalQty;

  // If API didn't send quantity, compute from lot list
  if (qty === undefined || qty === null || qty === "" || Number(qty) === 0) {
    qty = countLots(clean(r.LotList_Sorted ?? ""));
  }

  return {
    id: String(r.id ?? r._id ?? ""),
    Begin46Date: clean(r.Begin46Date ?? "").slice(0, 10),
    ProductName: clean(r.ProductName ?? ""),
    ColorName: clean(r.ColorName ?? ""),
    SUM: Number(qty) || 0,
    type: mapType(clean(r.TransactionType ?? r.type)),
    LotList_Sorted: clean(r.LotList_Sorted ?? ""),
    DocNo: clean(r.DocNo ?? ""),
  };
}

// Helper to handle API type variations (e.g., "IN" vs "receive")
function mapType(t: string): string {
  const type = t.toLowerCase();
  if (type === "receive" || type === "in" || type === "receipt") return "receive";
  if (type === "pay" || type === "out" || type === "issue" || type === "withdraw") return "pay";
  if (type === "edit" || type === "adjust") return "edit";
  return type;
}

// ── Fetch one page from the filtered endpoint ─────────────
async function fetchFiltered(params: Record<string, string>): Promise<StockRow[]> {
  const qs = new URLSearchParams({ limit: "9999", ...params }).toString();
  const resp = await fetch(`${API_URL}/api/transactions/filtered?${qs}`);
  if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
  const json = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: any[] = Array.isArray(json) ? json : (json.data ?? []);
  return arr.map(normaliseRow);
  
}

// ── Lot range helper ──────────────────────────────────────
function getLotRanges(lotList: string): string[] {
  const lots = clean(lotList).split(",").map((s) => s.trim()).filter(Boolean);
  if (!lots.length) return [];
  const parsed = lots.map((lot) => {
    const m = lot.match(/^(.*?)(\d+)$/);
    return m
      ? { original: lot, prefix: m[1], num: parseInt(m[2], 10) }
      : { original: lot, prefix: lot, num: NaN };
  });
  parsed.sort((a, b) =>
    a.prefix !== b.prefix ? a.prefix.localeCompare(b.prefix) : a.num - b.num
  );
  const ranges: string[] = [];
  let i = 0;
  while (i < parsed.length) {
    const start = parsed[i];
    if (isNaN(start.num)) { ranges.push(start.original); i++; continue; }
    let j = i + 1;
    while (
      j < parsed.length &&
      parsed[j].prefix === start.prefix &&
      !isNaN(parsed[j].num) &&
      parsed[j].num === parsed[j - 1].num + 1
    ) j++;
    ranges.push(
      j - i === 1 ? start.original : `${start.original}–${parsed[j - 1].original}`
    );
    i = j;
  }
  return ranges;
}

// ── Build summary ─────────────────────────────────────────
type TxDetail = {
  date: string;
  docNo: string;
  qty: number;
  lots: string[];
  lotRanges: string[];
};
type SummaryRow = {
  key: string;
  productName: string;
  colorName: string;
  /** ตัวตั้ง — the most-recent "edit" SUM for this product/color */
  initial: number;
  editDate: string;
  receives: TxDetail[];
  pays: TxDetail[];
  totalReceive: number;
  totalPay: number;
  net: number;
};

function buildSummary(rows: StockRow[]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();

  // Helper: ensure entry exists
  const ensure = (row: StockRow) => {
    const key = `${row.ProductName}||${row.ColorName}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        productName: row.ProductName,
        colorName:   row.ColorName,
        initial:      0,
        editDate:     "",
        receives:     [],
        pays:         [],
        totalReceive: 0,
        totalPay:     0,
        net:          0,
      });
    }
    return map.get(key)!;
  };
// In fetchData, after setRows:
console.log('Fetched rows:', rows.map(r => ({product: r.ProductName, color: r.ColorName, sum: r.SUM, type: r.type})));

  // First pass: collect edit rows to find latest per key
  const editMap = new Map<string, StockRow>();
  for (const row of rows) {
    if (row.type !== "edit") continue;
    const key = `${row.ProductName}||${row.ColorName}`;
    const existing = editMap.get(key);
    if (!existing || row.Begin46Date >= existing.Begin46Date) {
      editMap.set(key, row);
    }
  }

  // Apply edit (ตัวตั้ง) into summary
  for (const [key, row] of editMap.entries()) {
    const s = ensure(row);
    s.initial  = row.SUM;
    s.editDate = row.Begin46Date;
    void key;
  }

  // Second pass: receive / pay
  for (const row of rows) {
    if (row.type === "edit") continue;
    const s = ensure(row);
    const qty = row.SUM;
    const lots = row.LotList_Sorted.split(",").map((l) => l.trim()).filter(Boolean);
    const detail: TxDetail = {
      date:      row.Begin46Date,
      docNo:     row.DocNo,
      qty,
      lots,
      lotRanges: getLotRanges(row.LotList_Sorted),
    };
    if (row.type === "receive") {
      s.receives.push(detail);
      s.totalReceive += qty;
    } else if (row.type === "pay") {
      s.pays.push(detail);
      s.totalPay += qty;
    }
  }

  // Compute net for every entry (including product/colors with no edit)
  for (const s of map.values()) {
    s.net = s.initial + s.totalReceive - s.totalPay;
  }

  // Sort by product then color
  return Array.from(map.values()).sort((a, b) =>
    a.productName !== b.productName
      ? a.productName.localeCompare(b.productName)
      : a.colorName.localeCompare(b.colorName)
  );
}

// ── Lot chips ─────────────────────────────────────────────
function LotChips({ ranges, lots }: { ranges: string[]; lots: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!ranges.length) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {(expanded ? ranges : ranges.slice(0, 3)).map((r, i) => (
          <span
            key={i}
            className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2 py-0.5 text-xs font-semibold"
          >
            {r}
          </span>
        ))}
        {!expanded && ranges.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-100 transition-all"
          >
            +{ranges.length - 3} อีก
          </button>
        )}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] font-bold text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200 transition-all"
          >
            ย่อ
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-400">{lots.length} ล็อต</p>
    </div>
  );
}

// ── Tx rows inside expanded panel ────────────────────────
function TxRows({ items, color }: { items: TxDetail[]; color: "green" | "rose" }) {
  const cls =
    color === "green"
      ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400" }
      : { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    dot: "bg-rose-400"    };
  if (!items.length)
    return <p className="text-gray-300 text-xs px-2">ไม่มีรายการ</p>;
  return (
    <div className="space-y-1.5">
      {items.map((tx, i) => (
        <div
          key={i}
          className={`rounded-xl border ${cls.bg} ${cls.border} px-3 py-2 flex flex-col gap-1.5`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-1.5 h-1.5 rounded-full ${cls.dot} flex-shrink-0`} />
            <span className="text-xs font-bold text-gray-700">{formatDate(tx.date)}</span>
            {tx.docNo && tx.docNo !== "—" && tx.docNo !== "" && (
              <span className="text-[10px] font-bold bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-lg">
                #{tx.docNo}
              </span>
            )}
            <span className={`ml-auto text-sm font-black tabular-nums ${cls.text}`}>
              {formatQty(tx.qty)}
            </span>
          </div>
          <LotChips ranges={tx.lotRanges} lots={tx.lots} />
        </div>
      ))}
    </div>
  );
}

// ── Net badge ─────────────────────────────────────────────
function NetBadge({ net }: { net: number }) {
  const style =
    net === 0
      ? { bg: "bg-gray-100",    text: "text-gray-500" }
      : net > 0
      ? { bg: "bg-emerald-100", text: "text-emerald-700" }
      : { bg: "bg-rose-100",    text: "text-rose-700" };
  return (
    <span
      className={`inline-block px-3 py-1 rounded-xl text-sm font-black tabular-nums ${style.bg} ${style.text}`}
    >
      {formatQty(net)}
    </span>
  );
}

// ── Expandable summary row ────────────────────────────────
function SummaryTableRow({ s, showProduct }: { s: SummaryRow; showProduct: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="transition-all hover:brightness-95 cursor-pointer"
        style={{ backgroundColor: open ? "rgba(238,242,255,0.6)" : undefined }}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-5 py-3.5">
          {showProduct
            ? <span className="font-bold text-gray-800 text-sm">{s.productName}</span>
            : null}
        </td>
        <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.colorName}</td>
        <td className="px-5 py-3.5 text-right">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-bold text-gray-700 tabular-nums text-sm">{formatQty(s.initial)}</span>
            {s.editDate && (
              <span className="text-[10px] text-gray-400">{formatDate(s.editDate)}</span>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5 text-right">
          <span className="font-black tabular-nums text-emerald-600">+{formatQty(s.totalReceive)}</span>
        </td>
        <td className="px-5 py-3.5 text-right">
          <span className="font-black tabular-nums text-rose-500">−{formatQty(s.totalPay)}</span>
        </td>
        <td className="px-5 py-3.5 text-right">
          <NetBadge net={s.net} />
        </td>
        <td className="px-5 py-3.5 text-center">
          <svg
            className={`w-4 h-4 text-gray-400 mx-auto transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={7} className="px-5 pb-5 pt-1 bg-indigo-50/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-100 bg-emerald-50">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">รับเข้า</span>
                  <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-black px-2.5 py-0.5 rounded-full">
                    +{formatQty(s.totalReceive)}
                  </span>
                </div>
                <div className="p-3"><TxRows items={s.receives} color="green" /></div>
              </div>
              <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-rose-100 bg-rose-50">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="text-xs font-bold text-rose-600 uppercase tracking-widest">จ่ายออก</span>
                  <span className="ml-auto bg-rose-100 text-rose-600 text-xs font-black px-2.5 py-0.5 rounded-full">
                    −{formatQty(s.totalPay)}
                  </span>
                </div>
                <div className="p-3"><TxRows items={s.pays} color="rose" /></div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── CSV download ─────────────────────────────────────────
function downloadCSV(summary: SummaryRow[], startDate: string, endDate: string) {
  // In fetchData, after setRows:

console.log('Summary:', summary.map(s => ({key: s.key, initial: s.initial, net: s.net})));
  const headers = ["สินค้า", "ชื่อสี", "ตัวตั้ง (วันที่แก้ไขล่าสุด)", "รับเข้า", "จ่ายออก", "คงเหลือสุทธิ"];
  const rows = summary.map((s) => [
    s.productName,
    s.colorName,
    s.initial,
    s.totalReceive,
    s.totalPay,
    s.net,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `stock-summary_${startDate}_${endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────
const today        = new Date().toISOString().slice(0, 10);
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10);

export default function StockSummaryByDatePage() {
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate,   setEndDate]   = useState(today);
  const [rows,      setRows]      = useState<StockRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetched,   setFetched]   = useState(false);

  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch all three transaction types in parallel
      const [editRows, receiveRows, payRows] = await Promise.all([
        fetchFiltered({ type: "edit",    dateFrom: "2026-01-01", dateTo: endDate }),
        fetchFiltered({ type: "receive", dateFrom: startDate,    dateTo: endDate }),
        fetchFiltered({ type: "pay",     dateFrom: startDate,    dateTo: endDate }),
      ]);
      setRows([...editRows, ...receiveRows, ...payRows]);
      setFetched(true);
    } catch (e: unknown) {
      setError((e as Error).message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const summary      = buildSummary(rows);
  const grandInitial = summary.reduce((a, s) => a + s.initial,      0);
  const grandReceive = summary.reduce((a, s) => a + s.totalReceive, 0);
  const grandPay     = summary.reduce((a, s) => a + s.totalPay,     0);
  const grandNet     = summary.reduce((a, s) => a + s.net,          0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-200">
              P
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 leading-tight tracking-tight">
                สรุปสต็อกตามวันที่
              </h1>
              <p className="text-[11px] text-gray-400 font-medium tracking-widest uppercase mt-0.5">
                Stock Summary by Date
              </p>
            </div>
          </div>
          <nav>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border-2 border-indigo-100 hover:border-indigo-600 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              หน้าหลัก
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-widest">ตั้งแต่</p>
              <input
                type="date" value={startDate} max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 text-sm text-gray-700 border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-widest">ถึง</p>
              <input
                type="date" value={endDate} min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 text-sm text-gray-700 border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading || !startDate || !endDate}
              className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed border-2 border-indigo-600"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  กำลังโหลด…
                </>
              ) : "🔍 ค้นหา"}
            </button>
            <button
              onClick={() => downloadCSV(summary, startDate, endDate)}
              disabled={summary.length === 0}
              className="ml-auto inline-flex items-center gap-2 px-5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed border-2 border-emerald-200 hover:border-emerald-400"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              ดาวน์โหลดสรุปสต็อกคงเหลือ
            </button>
          </div>

          {/* Calc legend */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="font-semibold text-gray-600">สูตรคำนวณ:</span>
            <span className="bg-amber-50 border border-amber-200 text-amber-700 font-bold px-2 py-0.5 rounded-lg">ตัวตั้ง (edit ล่าสุด)</span>
            <span>+</span>
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded-lg">รับเข้า</span>
            <span>−</span>
            <span className="bg-rose-50 border border-rose-200 text-rose-700 font-bold px-2 py-0.5 rounded-lg">จ่ายออก</span>
            <span>=</span>
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-2 py-0.5 rounded-lg">คงเหลือสุทธิ</span>
            <span className="ml-2 text-gray-400">• ตัวตั้งดึงจาก 2026-01-01 ถึงวันที่ปลาย • รับ/จ่าย ดึงตามช่วงวันที่ที่เลือก</span>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Summary table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">สรุปตามสินค้า</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                คลิกที่แถวเพื่อดูรายละเอียดล็อตรับเข้า / จ่ายออก
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"/>
                <span className="text-xs font-medium text-gray-600">รับเข้า</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400"/>
                <span className="text-xs font-medium text-gray-600">จ่ายออก</span>
              </div>
              <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">
                {summary.length} รายการ
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    { label: "สินค้า",       align: "text-left"  },
                    { label: "ชื่อสี",        align: "text-left"  },
                    { label: "ตัวตั้ง",       align: "text-right" },
                    { label: "รับเข้า (+)",   align: "text-right" },
                    { label: "จ่ายออก (−)",  align: "text-right" },
                    { label: "คงเหลือสุทธิ", align: "text-right" },
                    { label: "",             align: "text-center"},
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 ${col.align} text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!fetched ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-gray-300 text-sm">
                      เลือกช่วงวันที่แล้วกด ค้นหา
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="flex items-center justify-center gap-3 text-gray-400 text-sm">
                        <svg className="animate-spin w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        กำลังโหลด…
                      </div>
                    </td>
                  </tr>
                ) : summary.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-gray-300 text-sm">
                      ไม่พบข้อมูลในช่วงวันที่นี้
                    </td>
                  </tr>
                ) : (
                  summary.map((s, i) => {
  const showProduct = i === 0 || summary[i - 1].productName !== s.productName;
  return <SummaryTableRow key={s.key} s={s} showProduct={showProduct} />;
})
                )}
              </tbody>
              {summary.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={2} className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">
                      รวมทั้งหมด
                    </td>
                    <td className="px-5 py-3 text-right font-black text-gray-700 tabular-nums">
                      {formatQty(grandInitial)}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-emerald-600 tabular-nums">
                      +{formatQty(grandReceive)}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-rose-500 tabular-nums">
                      −{formatQty(grandPay)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <NetBadge net={grandNet} />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}