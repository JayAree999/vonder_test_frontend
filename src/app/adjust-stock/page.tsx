"use client";

import { useState, useEffect, useRef, ChangeEvent, FormEvent } from "react";
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

type TransactionRow = {
  _id?: string;
  id?: number;
  type: "receive" | "pay" | "edit";
  TransactionType?: string;
  Begin46Date: string;
  ProductName: string;
  ColorName: string;
  SUM: string | number | null;
  TotalQty?: string;
};

// ── Combobox ────────────────────────────────────────────────────────────────
function Combobox({
  name,
  value,
  options,
  onChange,
  required,
  placeholder,
}: {
  name: string;
  value: string;
  options: string[];
  onChange: (name: string, value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        name={name}
        value={open ? search : value}
        required={required}
        placeholder={open ? value || placeholder : placeholder}
        autoComplete="off"
        onFocus={() => { setSearch(""); setOpen(true); }}
        onClick={() => { setSearch(""); setOpen(true); }}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onBlur={() => setOpen(false)}
        className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all text-gray-700"
      />
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <ul className="absolute z-20 w-full mt-1.5 max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
          {filtered.length > 0 ? (
            filtered.map((opt) => (
              <li
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(name, opt);
                  setSearch("");
                  setOpen(false);
                }}
                className={`px-4 py-2.5 cursor-pointer text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700 ${
                  opt === value ? "bg-indigo-100 text-indigo-700 font-semibold" : "text-gray-700"
                }`}
              >
                {opt}
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-gray-400 text-center">ไม่พบรายการ</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-widest">{label}</p>
      {children}
    </div>
  );
}

export default function AdjustStockPage() {
  const [form, setForm] = useState<TransactionRow>({
    type: "edit",
    Begin46Date: new Date().toISOString().slice(0, 10),
    ProductName: "",
    ColorName: "",
    SUM: "",
  });

  const [history, setHistory] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHistory = async (date?: string) => {
    setLoadingHistory(true);
    setSelectedId(null);
    try {
      const d = date ?? form.Begin46Date;
      const resp = await fetch(`${API_URL}/api/transactions/filtered?dateFrom=2026-01-01&dateTo=${d}&limit=999&type=edit`);
      if (!resp.ok) throw new Error("failed to load history");
      const json = await resp.json();
      const rows = Array.isArray(json) ? json : (json.data ?? []);
      setHistory(rows);
      setTotalCount(Array.isArray(json) ? rows.length : (json.total ?? rows.length));
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/products`);
      if (resp.ok) {
        const data = await resp.json();
        setProductOptions(data.products || []);
        setColorOptions(data.colors || []);
      }
    } catch (e: unknown) {
      console.error("Failed to fetch options", e);
    }
  };

  useEffect(() => {
    fetchHistory(form.Begin46Date);
    fetchOptions();
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (name === "Begin46Date" && value) fetchHistory(value);
  };

  const handleComboChange = (name: string, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const rowKey = (row: TransactionRow): string =>
    row._id ?? String(row.id ?? "");

  const handleSelectRow = (row: TransactionRow) => {
    const key = rowKey(row);
    if (!key) return;
    setSelectedId((prev) => (prev === key ? null : key));
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm("ต้องการลบรายการที่เลือกใช่หรือไม่?")) return;
    setDeletingId(selectedId);
    setFetchError(null);
    try {
      const resp = await fetch(`${API_URL}/api/transactions/${selectedId}`, { method: "DELETE" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.message || "delete failed");
      }
      setHistory((prev) => prev.filter((r) => rowKey(r) !== selectedId));
      setSelectedId(null);
    } catch (e: unknown) {
      setFetchError((e as Error).message || String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setFetchError(null);
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_URL}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          SUM: parseFloat(form.SUM as string) || 0,
          latestUpdateDate: new Date().toISOString(),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.message || "server error");
      }
      setMessage("บันทึกการแก้ไขสต็อกสำเร็จ");
      fetchHistory(form.Begin46Date);
    } catch (e: unknown) {
      setFetchError((e as Error).message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedRow = history.find((r) => rowKey(r) === selectedId) ?? null;
  const typeLabel: Record<string, { label: string; cls: string }> = {
    receive: { label: "รับเข้า", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    pay:     { label: "จ่ายออก", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    edit:    { label: "แก้ไข",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const cols = ["", "ประเภท", "วันที่", "สินค้า", "ชื่อสี", "จำนวน"];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 px-8 py-5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
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

          <nav className="flex gap-3 items-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border-2 border-indigo-100 hover:border-indigo-600 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-indigo-200"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              หน้าหลัก
            </Link>
            <Link
              href="/stock-summary-by-date"
              className="inline-flex items-center gap-2 text-sm font-bold text-violet-600 hover:text-white bg-violet-50 hover:bg-violet-600 border-2 border-violet-100 hover:border-violet-600 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-violet-200"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              สรุปสต็อกตามวันที่
            </Link>
          </nav>

          {fetchError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl ml-4">
              ⚠ {fetchError}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">

        {/* ── Page title bar ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-200">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900 leading-tight">ตั้งค่าสต็อกตามจำนวนจริง</h2>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">แก้ไขสต็อกสินค้าตามยอดนับจริง</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start">

          {/* ── Form card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            {message && (
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-3 rounded-xl">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="วันที่">
                <input
                  type="date"
                  name="Begin46Date"
                  value={form.Begin46Date}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all text-gray-700"
                />
              </Field>

              <Field label="รุ่นสินค้า">
                <Combobox
                  name="ProductName"
                  value={form.ProductName}
                  options={productOptions}
                  onChange={handleComboChange}
                  required
                  placeholder="พิมพ์หรือเลือกรุ่น…"
                />
              </Field>

              <Field label="ชื่อสี">
                <Combobox
                  name="ColorName"
                  value={form.ColorName}
                  options={colorOptions}
                  onChange={handleComboChange}
                  required
                  placeholder="พิมพ์หรือเลือกสี…"
                />
              </Field>

              <Field label="จำนวน (แพ็ค / แผ่น)">
                <input
                  type="number"
                  step="any"
                  min="0"
                  name="SUM"
                  value={form.SUM ?? ""}
                  onChange={handleChange}
                  required
                  placeholder="0"
                  className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400 transition-all text-gray-700 tabular-nums"
                />
              </Field>

              {(form.ProductName || form.ColorName || form.SUM !== "") && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {form.ProductName && (
                    <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-3 py-1 rounded-lg">
                      {form.ProductName}
                    </span>
                  )}
                  {form.ColorName && (
                    <span className="bg-violet-50 text-violet-700 border border-violet-200 text-xs font-bold px-3 py-1 rounded-lg">
                      {form.ColorName}
                    </span>
                  )}
                  {form.SUM !== "" && (
                    <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1 rounded-lg tabular-nums">
                      {formatQty(form.SUM)} รายการ
                    </span>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 border-2 border-indigo-600 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    กำลังบันทึก…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    บันทึกการแก้ไข
                  </>
                )}
              </button>
            </form>
          </div>

          {/* ── History table ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-800">เลือกรายการที่จะลบ</h2>
                <p className="text-xs text-gray-500 mt-0.5">คลิกที่แถวเพื่อเลือก จากนั้นกดลบ</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={!selectedId || !!deletingId}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-white bg-rose-50 hover:bg-rose-500 border border-rose-200 hover:border-rose-500 px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deletingId ? (
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  ลบรายการที่เลือก
                </button>
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg">
                  {loadingHistory ? "…" : `${totalCount} รายการ`}
                </span>
              </div>
            </div>

            {/* Selected row preview banner */}
            {selectedRow && (
              <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 border-b border-indigo-100 text-sm">
                <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-indigo-700 font-semibold">เลือกแล้ว:</span>
                <span className="text-indigo-600">{formatDate(selectedRow.Begin46Date)}</span>
                <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-2 py-0.5 rounded-md">
                  {clean(selectedRow.ProductName)}
                </span>
                <span className="text-indigo-600">{clean(selectedRow.ColorName)}</span>
                <span className="font-black text-indigo-800 tabular-nums">{formatQty(selectedRow.SUM)}</span>
                <button
                  onClick={() => setSelectedId(null)}
                  className="ml-auto text-indigo-400 hover:text-indigo-700 transition-colors"
                  title="ยกเลิกการเลือก"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {cols.map((c, i) => (
                      <th
                        key={i}
                        className="px-5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center">
                        <div className="flex items-center justify-center gap-3 text-gray-400 text-sm">
                          <svg className="animate-spin w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          กำลังโหลด…
                        </div>
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center text-gray-300 text-sm">
                        ไม่มีรายการในวันที่นี้
                      </td>
                    </tr>
                  ) : (
                    history.map((row, i) => {
                      const key = rowKey(row);
                      const isSelected = key === selectedId;
                      return (
                        <tr
                          key={key || i}
                          onClick={() => handleSelectRow(row)}
                          className={`cursor-pointer transition-all select-none ${
                            isSelected
                              ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          {/* Radio indicator */}
                          <td className="pl-5 pr-2 py-3.5 w-8">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-500"
                                : "border-gray-300 bg-white"
                            }`}>
                              {isSelected && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {(() => {
                              const t = typeLabel[row.type] ?? { label: row.type, cls: "bg-gray-100 text-gray-600 border-gray-200" };
                              return (
                                <span className={`text-xs font-bold border px-2.5 py-1 rounded-lg ${t.cls}`}>
                                  {t.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className={`px-5 py-3.5 text-sm whitespace-nowrap font-medium ${isSelected ? "text-indigo-700" : "text-gray-600"}`}>
                            {formatDate(row.Begin46Date)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`font-bold text-sm border px-2.5 py-1 rounded-lg ${
                              isSelected
                                ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                : "bg-indigo-50 text-indigo-700 border-indigo-100"
                            }`}>
                              {clean(row.ProductName)}
                            </span>
                          </td>
                          <td className={`px-5 py-3.5 text-sm whitespace-nowrap ${isSelected ? "text-indigo-600 font-medium" : "text-gray-600"}`}>
                            {clean(row.ColorName)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={`font-black text-base tabular-nums ${isSelected ? "text-indigo-800" : "text-gray-900"}`}>
                              {formatQty(row.SUM)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}