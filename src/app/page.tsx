"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type TransactionRow = {
  id: number;
  Begin46Date: string;
  DocNo: string;
  TransactionType: string;
  ReFrom: string | null;
  PayTo: string | null;
  PayFrom: string | null;
  Lot: string;
  ProductName: string;
  ColorCode: string;
  ColorName: string;
  Shape: string;
  SUM: string | number | null;
  LotList_Sorted: string;
  synced_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const SAMPLE_DATA: TransactionRow[] = [
  {
    id: 1,
    Begin46Date: "2026-03-10T00:00:00.000Z",
    DocNo: "6640",
    TransactionType: "Receive",
    ReFrom: "P88",
    PayTo: null,
    PayFrom: null,
    Lot: "220503",
    ProductName: "SH612",
    ColorCode: "2056-1+2051",
    ColorName: "โซลิคโอ๊ค+ผ้าครีม",
    Shape: "แพค",
    SUM: "3.0000",
    LotList_Sorted: "220503012,220503013,220503014,220503019,220503020,220503021",
    synced_at: "2026-03-10T09:02:41.000Z",
  },
  {
    id: 2,
    Begin46Date: "2026-03-10T00:00:00.000Z",
    DocNo: "6641",
    TransactionType: "Pay",
    ReFrom: null,
    PayTo: "W12",
    PayFrom: "WH1",
    Lot: "220504",
    ProductName: "SH615",
    ColorCode: "3010-2",
    ColorName: "วอลนัทดำ",
    Shape: "แผ่น",
    SUM: "5.0000",
    LotList_Sorted: "220504001,220504002,220504003,220504004,220504005",
    synced_at: "2026-03-10T09:15:00.000Z",
  },
  {
    id: 3,
    Begin46Date: "2026-03-10T00:00:00.000Z",
    DocNo: "6642",
    TransactionType: "Edit",
    ReFrom: null,
    PayTo: null,
    PayFrom: "WH2",
    Lot: "220505",
    ProductName: "SH620",
    ColorCode: "4020-1",
    ColorName: "ไม้สักทอง",
    Shape: "แผ่น",
    SUM: "2.0000",
    LotList_Sorted: "220505001,220505002",
    synced_at: "2026-03-10T09:30:00.000Z",
  },
];

const TYPE_THEME: Record<string, {
  badgeBg: string;
  badgeText: string;
  badgeDot: string;
  rowBg: string;
  dotClass: string;
  filterActiveBg: string;
  filterActiveText: string;
  label: string;
}> = {
  Receive: {
    badgeBg: "#10b981",
    badgeText: "#ffffff",
    badgeDot: "rgba(255,255,255,0.6)",
    rowBg: "rgba(236,253,245,0.5)",
    dotClass: "bg-emerald-400",
    filterActiveBg: "#10b981",
    filterActiveText: "#ffffff",
    label: "รับเข้า",
  },
  Pay: {
    badgeBg: "#f43f5e",
    badgeText: "#ffffff",
    badgeDot: "rgba(255,255,255,0.6)",
    rowBg: "rgba(255,241,242,0.5)",
    dotClass: "bg-rose-400",
    filterActiveBg: "#f43f5e",
    filterActiveText: "#ffffff",
    label: "จ่ายออก",
  },
  Edit: {
    badgeBg: "#fbbf24",
    badgeText: "#451a03",
    badgeDot: "rgba(0,0,0,0.2)",
    rowBg: "rgba(255,251,235,0.6)",
    dotClass: "bg-amber-500",
    filterActiveBg: "#fbbf24",
    filterActiveText: "#451a03",
    label: "แก้ไข",
  },
};

const NORMALIZE: Record<string, string> = {
  receive: "Receive", rec: "Receive", "รับเข้า": "Receive",
  pay: "Pay", payment: "Pay", "จ่ายออก": "Pay", "จ่าย": "Pay",
  edit: "Edit", adjust: "Edit", "แก้ไข": "Edit",
};

const getTheme = (raw: string) => {
  const key =
    TYPE_THEME[raw]
      ? raw
      : NORMALIZE[raw.trim().toLowerCase()]
        ?? NORMALIZE[raw.trim()]
        ?? null;
  return key
    ? TYPE_THEME[key]
    : {
        badgeBg: "#6b7280",
        badgeText: "#ffffff",
        badgeDot: "rgba(255,255,255,0.6)",
        rowBg: "#f9fafb",
        dotClass: "bg-gray-400",
        filterActiveBg: "#6b7280",
        filterActiveText: "#ffffff",
        label: raw,
      };
};

const clean = (v?: string | null) => (v ?? "").replace(/[\r\n]/g, "").trim();

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
    if (isNaN(start.num)) {
      ranges.push(start.original);
      i++;
      continue;
    }
    let j = i + 1;
    while (
      j < parsed.length &&
      parsed[j].prefix === start.prefix &&
      !isNaN(parsed[j].num) &&
      parsed[j].num === parsed[j - 1].num + 1
    )
      j++;
    ranges.push(
      j - i === 1
        ? start.original
        : `${start.original}–${parsed[j - 1].original}`
    );
    i = j;
  }
  return ranges;
}

function LotDropdown({
  anchorRef,
  ranges,
  allLots,
  count,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLDivElement>;
  ranges: string[];
  allLots: string[];
  count: number;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const update = () => {
      if (!anchorRef.current) return;
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 8, left: r.left + window.scrollX });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-[320px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-700">ล็อตทั้งหมด {count} รายการ</span>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-600 text-xl leading-none transition-colors"
        >
          ×
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ranges.map((r, i) => (
          <span
            key={i}
            className="bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-2 py-0.5 font-semi-bold text-sm"
          >
            {r}
          </span>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3">
        <p className="text-sm font-bold text-gray-600 mb-2">รายการทั้งหมด</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-h-48 overflow-y-auto">
          {allLots.map((lot, i) => (
      <span key={i} className="text-sm font-semi-bold font-semibold text-indigo-700 py-0.5">
  {lot}
</span>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function LotCell({ lotList }: { lotList: string }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const ranges = getLotRanges(lotList);
  const allLots = clean(lotList).split(",").map((s) => s.trim()).filter(Boolean);
  const count = allLots.length;

  if (!ranges.length) return <span className="text-gray-300 text-sm">—</span>;

  return (
    <div ref={anchorRef} className="flex items-center gap-2">
<span className="text-sm font-semi-bold bg-gray-100 text-black px-2.5 py-1 rounded-md border border-gray-200">
  {ranges[0]}
</span>
      {ranges.length > 1 && (
        <span className="text-xs text-gray-400 font-medium">+{ranges.length - 1}</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-all border border-indigo-100"
      >
        {count} ล็อต
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <LotDropdown
          anchorRef={anchorRef}
          ranges={ranges}
          allLots={allLots}
          count={count}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Filters({
  typeFilter,
  setTypeFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onApply,
  isLoading,
}: {
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  onApply: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Type pills */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-widest">
            ประเภท
          </p>
          <div className="flex gap-2 flex-wrap">
            {["all", "Receive", "Pay", "Edit"].map((t) => {
              const theme = t === "all" ? null : getTheme(t);
              const isActive = typeFilter === t;
              if (t === "all") {
                return (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all border-2"
                    style={
                      isActive
                        ? { backgroundColor: "#1f2937", color: "#ffffff", borderColor: "#1f2937" }
                        : { backgroundColor: "#ffffff", color: "#6b7280", borderColor: "#e5e7eb" }
                    }
                  >
                    ทั้งหมด
                  </button>
                );
              }
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all border-2"
                  style={
                    isActive
                      ? {
                          backgroundColor: theme!.filterActiveBg,
                          color: theme!.filterActiveText,
                          borderColor: "transparent",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        }
                      : { backgroundColor: "#ffffff", color: "#4b5563", borderColor: "#d1d5db" }
                  }
                >
                  {theme!.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 ml-auto items-end flex-wrap">
          <div>
            <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-widest">
              ตั้งแต่
            </p>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-4 py-2 text-sm text-gray-700 border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all"
            />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-widest">
              ถึง
            </p>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-4 py-2 text-sm text-gray-700 border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all"
            />
          </div>
          <button
            onClick={onApply}
            disabled={isLoading}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 border-2 border-indigo-600"
          >
            {isLoading ? "กำลังโหลด…" : "🔍 ค้นหา"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataTable({ data, isLoading }: { data: TransactionRow[]; isLoading: boolean }) {
  const cols = ["ประเภท", "วันที่", "เลขที่เอกสาร", "จาก / ถึง", "ล็อต", "สินค้า", "ชื่อสี", "รูปทรง", "จำนวน", "ช่วงล็อต"];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-800">รายการธุรกรรม</h2>
          <p className="text-xs text-gray-500 mt-0.5">รับเข้า · จ่ายออก · แก้ไข</p>
        </div>
        <div className="flex items-center gap-5 flex-wrap justify-end">
          {Object.entries(TYPE_THEME).map(([key, t]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: t.badgeBg }}
              />
              <span className="text-xs font-medium text-gray-700">{t.label}</span>
            </div>
          ))}
          <span className="ml-3 bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">
            {isLoading ? "…" : `${data.length} รายการ`}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-24 text-center">
                  <div className="flex items-center justify-center gap-3 text-gray-400 text-sm">
                    <svg
                      className="animate-spin w-5 h-5 text-indigo-400"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    กำลังโหลด…
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-24 text-center text-gray-300 text-sm">
                  ไม่พบรายการ
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const theme = getTheme(row.TransactionType);
                const normalizedType = NORMALIZE[row.TransactionType.trim().toLowerCase()]
                  ?? NORMALIZE[row.TransactionType.trim()]
                  ?? row.TransactionType;
                const fromTo = normalizedType === "Receive"
                  ? clean(row.ReFrom)
                  : clean(row.PayFrom || row.PayTo || "");
                const lotCount = clean(row.LotList_Sorted).split(",").filter(Boolean).length;
                const isEditType = normalizedType === "Edit";

                return (
                  <tr
                    key={row.id}
                    className="transition-all hover:brightness-95"
                    style={{ backgroundColor: theme.rowBg }}
                  >
                    <td className="px-5 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={{
                          backgroundColor: theme.badgeBg,
                          color: theme.badgeText,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: theme.badgeDot }}
                        />
                        {theme.label}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap font-medium">
                      {formatDate(row.Begin46Date)}
                    </td>

                    <td className="px-5 py-3.5">
                   {clean(row.DocNo) ? (
  <span className="font-bold text-gray-800 text-sm bg-gray-100 px-2.5 py-1 rounded-lg">
    {clean(row.DocNo)}
  </span>
) : (
  <span className="text-gray-300">—</span>
)}
                    </td>

                    <td className="px-5 py-3.5">
                      {fromTo ? (
                        <span className="font-bold text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg">
                          {fromTo}
                        </span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 font-mono text-sm text-gray-700 font-semibold">
                      {clean(row.Lot)}
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="font-bold text-gray-800 text-sm" title={clean(row.ProductName)}>
                        {clean(row.ProductName)}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                      {clean(row.ColorName)}
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="bg-teal-100 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                        {clean(row.Shape)}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <span className="font-black text-gray-900 text-base tabular-nums">
                        {isEditType
                          ? (row.SUM ?? "—")
                          : lotCount}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 relative">
                      <LotCell lotList={row.LotList_Sorted} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  const [allData, setAllData] = useState<TransactionRow[]>(SAMPLE_DATA);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  // ── Client-side type filter — instant, no API call needed ──
  const data = typeFilter === "all"
    ? allData
    : allData.filter((row) => {
        const normalized =
          NORMALIZE[row.TransactionType.trim().toLowerCase()] ??
          NORMALIZE[row.TransactionType.trim()] ??
          row.TransactionType;
        return normalized === typeFilter;
      });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Send date filters to API; type filtering is done client-side
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      params.append("limit", "999");

      const res = await fetch(`${API_URL}/api/transactions/filtered?${params}`);
      if (!res.ok) throw new Error("Server error");
      const result = await res.json();
      setAllData(result.data?.length ? result.data : SAMPLE_DATA);
      setFetchError(null);
    } catch (e: any) {
      setFetchError(e.message);
      setAllData(SAMPLE_DATA);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-200">
              P
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 leading-tight tracking-tight">
                ระบบติดตามการผลิต
              </h1>
              <p className="text-[11px] text-gray-400 font-medium tracking-widest uppercase mt-0.5">
                Production Tracker
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex gap-3 items-center">
            <a
              href="/stock-summary-by-date"
              className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border-2 border-indigo-100 hover:border-indigo-600 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-indigo-200"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              สรุปสต็อกตามวันที่
            </a>
            <a
              href="/adjust-stock"
              className="inline-flex items-center gap-2 text-sm font-bold text-violet-600 hover:text-white bg-violet-50 hover:bg-violet-600 border-2 border-violet-100 hover:border-violet-600 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-violet-200"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              ตั้งค่าสต๊อกตามจำนวนจริง
            </a>
          </nav>

          {fetchError && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-xl ml-4">
              ⚠ กำลังแสดงข้อมูลตัวอย่าง — {fetchError}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
        <Filters
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          onApply={fetchData}
          isLoading={loading}
        />
        <DataTable data={data} isLoading={loading} />
      </main>
    </div>
  );
}