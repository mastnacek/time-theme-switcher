/**
 * Solar position calculation based on NOAA / f.lux algorithms.
 * Returns solar elevation angle in degrees for a given date/time and location.
 */

/** Julian Day from a Date (UTC-based). */
export function julianDate(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;

  const jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  return jd + (hour - 12) / 24;
}

/** Solar elevation angle in degrees. */
export function solarElevation(date: Date, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const jd = julianDate(date);
  const n = jd - 2451545.0;

  // Mean longitude of the sun
  const L = (280.460 + 0.9856474 * n) % 360;
  // Mean anomaly of the sun
  const g = (357.528 + 0.9856003 * n) % 360;
  // Ecliptic longitude
  const lambda = L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad);
  // Obliquity of the ecliptic
  const epsilon = 23.439 - 0.0000004 * n;
  // Right ascension
  const alpha = Math.atan2(Math.cos(epsilon * rad) * Math.sin(lambda * rad), Math.cos(lambda * rad)) / rad;
  // Declination
  const delta = Math.asin(Math.sin(epsilon * rad) * Math.sin(lambda * rad)) / rad;

  // Greenwich Mean Sidereal Time
  const GMST = (280.46061837 + 360.98564736629 * n) % 360;
  // Local Mean Sidereal Time
  const LMST = GMST + lon;
  // Hour angle
  const H = (LMST - alpha) % 360;

  const latRad = lat * rad;
  const deltaRad = delta * rad;
  const HRad = H * rad;

  const sinElevation =
    Math.sin(latRad) * Math.sin(deltaRad) + Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(HRad);
  return Math.asin(sinElevation) / rad;
}

/** Find time when solar elevation crosses a target angle (binary search over 24h). */
export function findSolarTime(
  baseDate: Date,
  lat: number,
  lon: number,
  targetElevation: number,
  isRising: boolean,
): Date {
  const targetDate = new Date(baseDate);
  targetDate.setUTCHours(12, 0, 0, 0); // Start at solar noon

  // Binary search over 24 hours
  let low = new Date(targetDate);
  low.setUTCHours(low.getUTCHours() - 12);
  let high = new Date(targetDate);
  high.setUTCHours(high.getUTCHours() + 12);

  for (let i = 0; i < 50; i++) {
    const mid = new Date((low.getTime() + high.getTime()) / 2);
    const elevation = solarElevation(mid, lat, lon);

    if ((isRising && elevation < targetElevation) || (!isRising && elevation > targetElevation)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return new Date((low.getTime() + high.getTime()) / 2);
}

/** Compute solar times for a date and location. */
export function computeSolarTimes(date: Date, lat: number, lon: number) {
  const solarNoon = findSolarTime(date, lat, lon, 0, false); // solar noon (elevation max)

  return {
    solarNoon,
    civilDawn: findSolarTime(date, lat, lon, -6, true),
    sunrise: findSolarTime(date, lat, lon, -0.833, true), // standard sunrise with atmospheric refraction
    sunset: findSolarTime(date, lat, lon, -0.833, false),
    civilDusk: findSolarTime(date, lat, lon, -6, false),
    nauticalDawn: findSolarTime(date, lat, lon, -12, true),
    nauticalDusk: findSolarTime(date, lat, lon, -12, false),
  };
}