/* Pure budget calculations — no DOM, no network. Used by index.html and covered by tests.html.
   Records are normalized by index.html into:
   { id, kind:"exp"|"inc", price, plan, type, cat, desc, date, month:"YYYY-MM"|null } */
(function(root){
"use strict";
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function num(v){ const n = Number(v); return isFinite(n) ? n : 0; }
function ym(y, m){ return y + "-" + String(m).padStart(2, "0"); }        // m: 1..12
function shiftMonth(key, d){
  let [y, m] = key.split("-").map(Number);
  m += d;
  while(m < 1){ m += 12; y--; }
  while(m > 12){ m -= 12; y++; }
  return ym(y, m);
}
function monthLabel(key){
  const [y, m] = key.split("-").map(Number);
  return MONTHS_RU[m - 1] + " " + y;
}
function monthIndex(name){
  const s = String(name || "").toLowerCase();
  return MONTHS_EN.findIndex(n => s.includes(n.toLowerCase()));
}

/* Which month a record belongs to: Date → Month/Year links → createdTime.
   Automation-created static rows have no Date, only the Month/Year links. */
function monthKeyOf(o){
  if(o.date && /^\d{4}-\d{2}/.test(o.date)) return o.date.slice(0, 7);
  const mi = monthIndex(o.monthName);
  let y = parseInt(o.year, 10);
  const ct = o.createdTime ? new Date(o.createdTime) : null;
  if(mi >= 0){
    if(!y && ct && !isNaN(ct)) y = ct.getFullYear();
    if(y) return ym(y, mi + 1);
  }
  if(ct && !isNaN(ct)) return ym(ct.getFullYear(), ct.getMonth() + 1);
  return null;
}

function isStatic(r){ return /^static$/i.test(String(r.type || "").trim()); }
function sum(list, key){ return list.reduce((s, r) => s + num(r[key]), 0); }

/* Plan vs fact for static rows of one month.
   Plan = Σ Static, fact = Σ Price — over the SAME planned rows only.
   Static rows without a plan are reported separately, never mixed into the deviation. */
function staticSummary(recs, key){
  const rows = recs.filter(r => r.kind === "exp" && r.month === key && isStatic(r));
  const planned = rows.filter(r => num(r.plan) > 0);
  const unplanned = rows.filter(r => !(num(r.plan) > 0));
  const plan = sum(planned, "plan"), fact = sum(planned, "price");
  const diff = fact - plan;
  return {
    status: !rows.length ? "empty" : (plan > 0 ? "ok" : "noplan"),
    plan, fact, diff,
    pct: plan > 0 ? diff / plan * 100 : null,
    items: planned,
    unplanned, unplannedSum: sum(unplanned, "price"),
    withoutFact: planned.filter(r => !num(r.price)).length
  };
}

function totals(recs, key){
  let inc = 0, exp = 0;
  recs.forEach(r => {
    if(r.month !== key) return;
    if(r.kind === "inc") inc += num(r.price); else exp += num(r.price);
  });
  return { inc, exp, net: inc - exp };
}
function change(cur, prev){
  return { abs: cur - prev, pct: prev ? (cur - prev) / Math.abs(prev) * 100 : null };
}
function history(recs, endKey, n){
  const out = [];
  for(let i = n - 1; i >= 0; i--){ const k = shiftMonth(endKey, -i); out.push({ key: k, ...totals(recs, k) }); }
  return out;
}

const NO_CAT = "Без категории";
function byCategory(recs, key, kind){
  const map = new Map();
  recs.forEach(r => {
    if(r.kind !== kind || r.month !== key) return;
    const c = r.cat || NO_CAT;
    if(!map.has(c)) map.set(c, { name: c, sum: 0, items: [] });
    const g = map.get(c); g.sum += num(r.price); g.items.push(r);
  });
  const groups = [...map.values()].filter(g => g.sum !== 0 || g.items.some(r => num(r.price)));
  const total = groups.reduce((s, g) => s + g.sum, 0);
  groups.forEach(g => {
    g.share = total ? g.sum / total * 100 : 0;
    g.items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || num(b.price) - num(a.price));
  });
  groups.sort((a, b) => b.sum - a.sum);
  return { total, groups };
}

/* ---- formatting (UZS) ---- */
function group3(n){ return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function fmtUZS(n){ return (n < 0 ? "−" : "") + group3(n) + " сум"; }
function fmtSigned(n){ return (n > 0 ? "+" : n < 0 ? "−" : "") + group3(n) + " сум"; }
function fmtShort(n){
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if(a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 2).replace(/\.?0+$/, "").replace(".", ",") + " млн";
  if(a >= 1e3) return s + Math.round(a / 1e3) + " тыс";
  return s + Math.round(a);
}
function fmtPct(p){
  if(p === null || p === undefined || !isFinite(p)) return "—";
  const r = Math.round(p);
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r) + "%";
}

const Calc = { MONTHS_EN, MONTHS_RU, NO_CAT, num, ym, shiftMonth, monthLabel, monthKeyOf, isStatic,
  staticSummary, totals, change, history, byCategory, fmtUZS, fmtSigned, fmtShort, fmtPct };
root.Calc = Calc;
if(typeof module !== "undefined" && module.exports) module.exports = Calc;
})(typeof window !== "undefined" ? window : globalThis);
