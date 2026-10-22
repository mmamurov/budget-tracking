/* A short Islamic quote at the top of each finance module (tab).
   Matched by table name; Airtable names carry emoji ("💸 Expenses"), so match loosely.
   Order matters: "Investing goals" must be checked before "Investing". */
(function(root){
"use strict";
const QUOTES = [
  { re: /expense/i,              text: "И не расточай безрассудно", src: "Коран, 17:26" },
  { re: /income/i,               text: "Не пожирайте имущества друг друга незаконно, а только путём торговли по обоюдному согласию", src: "Коран, 4:29" },
  { re: /monthly/i,              text: "Не держи руку прижатой к шее и не раскрывай её полностью", src: "Коран, 17:29" },
  { re: /annual/i,               text: "Пусть душа посмотрит, что она приготовила на завтра", src: "Коран, 59:18" },
  { re: /debt/i,                 text: "Когда вы заключаете договор о долге на определённый срок, записывайте его", src: "Коран, 2:282" },
  { re: /invest.*goal|goal.*invest/i, text: "Поистине, дела оцениваются только по намерениям", src: "Сахих аль-Бухари, хадис 1" },
  { re: /invest/i,               text: "…только путём торговли по обоюдному согласию", src: "Коран, 4:29" },
  { re: /zak[ao]t/i,             text: "Бери из их имущества милостыню, посредством которой ты очистишь их и возвысишь", src: "Коран, 9:103" },
  { re: /net\s*-?\s*worth/i,     text: "Богатство и сыновья — украшение мирской жизни, но благие деяния, которые пребудут вечно, лучше", src: "Коран, 18:46" }
];
function quoteFor(tableName){
  const q = QUOTES.find(x => x.re.test(String(tableName || "")));
  return q ? { text: q.text, src: q.src } : null;
}
root.Quotes = { QUOTES, quoteFor };
if(typeof module !== "undefined" && module.exports) module.exports = root.Quotes;
})(typeof window !== "undefined" ? window : globalThis);
