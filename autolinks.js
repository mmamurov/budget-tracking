/* Month / Year for this month's static expenses.
   The Airtable automation "Static expenses" creates the monthly static rows (1st of the month,
   06:00 +05) without 🗓️ Month and Year 🌏. When the app opens, it links those rows to the
   matching records in "🗓️ Monthly report" (field Month: January…December) and
   "🌏 Annually report" (field Year), creating the Year record once if it is missing.
   Network access is injected (deps), so the logic is testable without touching real data. */
(function(root){
"use strict";
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* calendar year/month of an instant in a given IANA time zone (e.g. "Asia/Tashkent") */
function monthInZone(date, tz){
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric" }).formatToParts(date);
  const get = t => +parts.find(p => p.type === t).value;
  const year = get("year"), month = get("month");
  return { year, month, key: year + "-" + String(month).padStart(2, "0"), monthName: MONTHS_EN[month - 1] };
}

/* rows: normalized expense records {id, type, createdTime, hasMonth, hasYear}.
   Targets = Static rows created in the current month (in tz) that miss Month or Year.
   Older (historical) rows and non-static rows are never touched. */
function targetsFor(rows, cur, tz){
  return rows.filter(r => /^static$/i.test(String(r.type || "").trim())
    && r.createdTime && monthInZone(new Date(r.createdTime), tz).key === cur.key
    && (!r.hasMonth || !r.hasYear));
}

const norm = s => String(s == null ? "" : s).trim().toLowerCase();

/* deps: {
     rows, now: Date, tz,
     listMonths(): Promise<[{id, name}]>         — records of Monthly report
     findYear(year: string): Promise<{id}|null>  — fresh lookup in Annually report
     createYear(year: string): Promise<{id}>     — create the Year record
     patch(updates: [{id, month?, year?}]): Promise  — ≤10 records per call
   }
   Returns {status:"nothing"|"done", patched, createdYear, monthId, yearId}. Throws a clear Error on failure. */
async function run(deps){
  const cur = monthInZone(deps.now || new Date(), deps.tz);
  const targets = targetsFor(deps.rows, cur, deps.tz);
  if(!targets.length) return { status: "nothing", patched: 0, createdYear: false, key: cur.key };

  let monthId = null, yearId = null, createdYear = false;
  if(targets.some(r => !r.hasMonth)){
    const months = await deps.listMonths();
    const m = months.find(x => norm(x.name) === norm(cur.monthName));
    if(!m) throw new Error("В «Monthly report» нет записи «" + cur.monthName + "» — месяц не проставлен");
    monthId = m.id;
  }
  if(targets.some(r => !r.hasYear)){
    const y = String(cur.year);
    let rec = await deps.findYear(y);
    if(!rec){ rec = await deps.createYear(y); createdYear = true; }
    if(!rec || !rec.id) throw new Error("Не удалось создать год " + y + " в «Annually report»");
    yearId = rec.id;
  }

  const updates = targets.map(r => {
    const u = { id: r.id };
    if(!r.hasMonth) u.month = monthId;
    if(!r.hasYear) u.year = yearId;
    return u;
  });
  for(let i = 0; i < updates.length; i += 10) await deps.patch(updates.slice(i, i + 10));
  return { status: "done", patched: updates.length, createdYear, monthId, yearId, key: cur.key };
}

root.AutoLinks = { MONTHS_EN, monthInZone, targetsFor, run };
if(typeof module !== "undefined" && module.exports) module.exports = root.AutoLinks;
})(typeof window !== "undefined" ? window : globalThis);
