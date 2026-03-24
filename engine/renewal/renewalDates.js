// engine/renewal/renewalDates.js — Janelas de calendário UTC para expiry_date ISO

'use strict';

function utcDayParts(isoOrDate) {
  const x = new Date(isoOrDate);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() };
}

function utcTodayParts(now = new Date()) {
  return utcDayParts(now);
}

function addUtcDays(parts, deltaDays) {
  const t = Date.UTC(parts.y, parts.m, parts.d + deltaDays);
  const x = new Date(t);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() };
}

function sameUtcDay(a, b) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function matchesRenewalOffset(expiryIso, daysBeforeExpiry, now = new Date()) {
  const target = addUtcDays(utcTodayParts(now), daysBeforeExpiry);
  return sameUtcDay(utcDayParts(expiryIso), target);
}

module.exports = { utcDayParts, utcTodayParts, addUtcDays, sameUtcDay, matchesRenewalOffset };
