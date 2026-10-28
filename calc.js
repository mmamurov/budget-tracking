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

/* Sum amounts per category: items [{cat, amount}] → {total, groups:[{name,sum,share,items}]} sorted by sum */
function groupSum(items){
  const map = new Map();
  items.forEach(r => {
    const c = r.cat || NO_CAT;
    if(!map.has(c)) map.set(c, { name: c, sum: 0, items: [] });
    const g = map.get(c); g.sum += num(r.amount); g.items.push(r);
  });
  const groups = [...map.values()].filter(g => g.sum !== 0);
  const total = groups.reduce((s, g) => s + g.sum, 0);
  groups.forEach(g => { g.share = total ? g.sum / total * 100 : 0; });
  groups.sort((a, b) => b.sum - a.sum);
  return { total, groups };
}

/* Investing ledger rows: { cat, type, invested (сум; negative = gifted/withdrawn), profit, date }.
   Mirrors the Airtable formula Total = Invested.S + Profit. */
function investSummary(rows){
  let deposited = 0, withdrawn = 0, profit = 0;
  const cats = new Map();
  rows.forEach(r => {
    const inv = num(r.invested), pr = num(r.profit);
    if(inv > 0) deposited += inv; else withdrawn += -inv;
    profit += pr;
    const c = r.cat || NO_CAT;
    if(!cats.has(c)) cats.set(c, { name: c, net: 0, profit: 0, total: 0 });
    const g = cats.get(c); g.net += inv; g.profit += pr; g.total += inv + pr;
  });
  const net = deposited - withdrawn;
  return {
    deposited, withdrawn, net, profit, total: net + profit,
    roi: deposited > 0 ? profit / deposited * 100 : null,
    byCat: [...cats.values()].sort((a, b) => b.total - a.total)
  };
}

/* Progress to an investing goal: target vs what is already saved */
function goalProgress(target, saved){
  target = num(target); saved = num(saved);
  if(!(target > 0)) return { status: "nogoal", target, saved, left: null, pct: null };
  const left = Math.max(0, target - saved);
  return { status: left === 0 ? "done" : "progress", target, saved, left, pct: Math.max(0, Math.min(100, saved / target * 100)) };
}

/* Static row description = comma-separated items; a repeated item gets a counter instead of
   being written again: "Uyga bozorlik" + "Non" → "Uyga bozorlik, Non"; + "non" → "Uyga bozorlik, Non 2x".
   Commas inside parentheses ("Uztelecom (2 number, home internet)") belong to one item. */
const ITEM_RE = /^(.*?\S)\s*(\d+)\s*[xх×]$/i;   // Latin x, Cyrillic х, ×
function splitItems(s){
  const out = []; let cur = "", depth = 0;
  for(const ch of String(s || "")){
    if(ch === "(") depth++;
    if(ch === ")") depth = Math.max(0, depth - 1);
    if(ch === "," && !depth){ out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean).map(x => {
    const m = x.match(ITEM_RE);
    return m ? { name: m[1].trim(), count: parseInt(m[2], 10) || 1 } : { name: x, count: 1 };
  });
}
function mergeStaticDesc(oldDesc, note){
  const added = splitItems(note);
  if(!added.length) return String(oldDesc || "").trim();     // nothing to add → description untouched
  const key = s => s.toLowerCase().replace(/\s+/g, " ");
  const items = splitItems(oldDesc);
  added.forEach(n => {
    const ex = items.find(i => key(i.name) === key(n.name));
    if(ex) ex.count += n.count; else items.push({ name: n.name, count: n.count });
  });
  return items.map(i => i.count > 1 ? i.name + " " + i.count + "x" : i.name).join(", ");
}
/* Several static rows can share a category (Home: "Nafaqa" with Tag Maftuna, "Uyga bozorlik" without).
   Same Tag as the form wins; with no Tag chosen, rows without a Tag win; then the bigger plan (Static). */
function pickStaticRecord(recs, tag){
  if(!recs || !recs.length) return null;
  const t = v => String(v || "").trim().toLowerCase();
  const pool = tag ? recs.filter(r => t(r.fields.Tag) === t(tag)) : recs.filter(r => !t(r.fields.Tag));
  return (pool.length ? pool : recs).slice()
    .sort((a, b) => (Number(b.fields.Static) || 0) - (Number(a.fields.Static) || 0))[0];
}

/* ---- 💎 Networth: one row per monthly snapshot, one column per type ----
   Manual columns are carried over from the previous snapshot; auto columns come from other tables. */
const NW_MANUAL = ["Cash", "Cards", "Savings", "Gold", "Property"];
const NW_CARRY = NW_MANUAL.concat(["USD rate"]);
const NW_GOLD = /gold|oltin|золот/i;   // gold is valued by hand in the Gold column, not at purchase cost from Investing
function nwTotal(f){
  return NW_MANUAL.concat(["Investing", "Debt+"]).reduce((s, k) => s + num(f[k]), 0) - num(f["Debt-"]);
}
/* Investing column = invested + profit of the Investing ledger, without gold */
function nwInvesting(ledger){ return Math.round(investSummary(ledger.filter(r => !NW_GOLD.test(r.cat || ""))).total); }
/* Debt tracker rows {type:"Qarz berdim"|"Qarz oldim", status, som, usd}. Repaid ("Qaytib keldi") rows are skipped.
   Dollar amounts need a rate; without one they are reported in usdOpen instead of being guessed. */
function debtTotals(rows, rate){
  let plus = 0, minus = 0, usdOpen = 0;
  rows.forEach(r => {
    if(/qaytib\s*keldi/i.test(r.status || "")) return;
    const lent = /berdim/i.test(r.type || ""), borrowed = /oldim/i.test(r.type || "");
    if(!lent && !borrowed) return;
    let amt = num(r.som);
    if(num(r.usd)){ if(rate > 0) amt += num(r.usd) * rate; else usdOpen += num(r.usd); }
    if(lent) plus += amt; else minus += amt;
  });
  return { plus: Math.round(plus), minus: Math.round(minus), usdOpen };
}
/* What to write for the current month: update the auto columns of this month's snapshot,
   or create it (manual columns copied from the latest earlier snapshot). Never touches older rows. */
function nwSnapshotPlan(snaps, key, auto, carry){
  const dated = snaps.filter(s => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const cur = dated.filter(s => s.date.slice(0, 7) === key).pop();
  if(cur){
    const fields = {};
    Object.keys(auto).forEach(k => { if(num(cur.fields[k]) !== num(auto[k])) fields[k] = auto[k]; });
    return Object.keys(fields).length ? { action: "update", id: cur.id, fields } : { action: "none", id: cur.id };
  }
  const prev = dated.filter(s => s.date.slice(0, 7) < key).pop();
  const fields = {};
  (carry || []).forEach(k => { if(prev && prev.fields[k] != null) fields[k] = prev.fields[k]; });
  Object.assign(fields, auto);
  return { action: "create", fields };
}

/* Sunrise / sunset for a date and place (standard sunrise equation, ±2 min).
   Returns Date objects; {polar:"day"|"night"} when the sun never sets / rises. */
function sunTimes(date, lat, lng){
  const rad = Math.PI / 180, J1970 = 2440588, J2000 = 2451545;
  const toDays = d => d.valueOf() / 86400000 - 0.5 + J1970 - J2000;
  const fromJ = j => new Date((j + 0.5 - J1970) * 86400000);
  const lw = rad * -lng, phi = rad * lat;
  const n = Math.round(toDays(date) - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(rad * 23.4397) * Math.sin(L));
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosw = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if(cosw < -1) return { polar: "day" };
  if(cosw > 1) return { polar: "night" };
  const w = Math.acos(cosw);
  const Jset = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { sunrise: fromJ(Jnoon - (Jset - Jnoon)), sunset: fromJ(Jset) };
}
/* Light between sunrise and sunset, dark otherwise; also when the theme should next flip */
function sunTheme(now, lat, lng){
  const t = sunTimes(now, lat, lng);
  if(t.polar) return { theme: t.polar === "day" ? "light" : "dark", next: new Date(now.valueOf() + 3600000) };
  if(now < t.sunrise) return { theme: "dark", next: t.sunrise };
  if(now < t.sunset) return { theme: "light", next: t.sunset };
  const tm = sunTimes(new Date(now.valueOf() + 86400000), lat, lng);
  return { theme: "dark", next: tm.sunrise || new Date(now.valueOf() + 3600000) };
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
  staticSummary, totals, change, history, byCategory, groupSum, investSummary, goalProgress, splitItems, mergeStaticDesc, pickStaticRecord,
  NW_MANUAL, NW_CARRY, nwTotal, nwInvesting, debtTotals, nwSnapshotPlan, sunTimes, sunTheme, fmtUZS, fmtSigned, fmtShort, fmtPct };
root.Calc = Calc;
if(typeof module !== "undefined" && module.exports) module.exports = Calc;
})(typeof window !== "undefined" ? window : globalThis);
