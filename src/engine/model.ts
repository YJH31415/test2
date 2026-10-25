import type { City, CityResult, ModelSettings, Particle } from "./types";

export const VOLCANO = { lon: -19.62, lat: 63.63 };
export const CITIES: City[] = [
  { name: "London", lon: -0.1276, lat: 51.5072 },
  { name: "Paris", lon: 2.3522, lat: 48.8566 },
  { name: "Frankfurt", lon: 8.6821, lat: 50.1109 },
  { name: "Oslo", lon: 10.7522, lat: 59.9139 },
  { name: "Stockholm", lon: 18.0686, lat: 59.3293 }
];

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

export function greatCircleKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const dp = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))) / 1000;
}

export function windVector(speedMs: number, directionFromDeg: number) {
  // Meteorological direction means the direction FROM which wind blows.
  const toward = (directionFromDeg + 180) * DEG;
  return { eastMs: speedMs * Math.sin(toward), northMs: speedMs * Math.cos(toward) };
}

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

export function createParticles(settings: ModelSettings): Particle[] {
  const n = Math.max(50, Math.min(3000, Math.round(settings.particleCount)));
  const massEach = settings.emissionKgPerSecond * 1800 / n;
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    lon: VOLCANO.lon + seededNoise(i + 4) * 0.08,
    lat: VOLCANO.lat + seededNoise(i + 90) * 0.06,
    altitudeM: 1800 + Math.abs(seededNoise(i + 130)) * 5000,
    massKg: massEach,
    diameterUm: settings.diameterUm * (0.55 + (i % 11) / 12),
    ageHours: 0,
    deposited: false
  }));
}

export function stepParticles(
  input: Particle[],
  settings: ModelSettings,
  dtSeconds: number,
  simSeconds: number
): Particle[] {
  const dt = Math.min(dtSeconds, 1800);
  const base = windVector(settings.windSpeedMs, settings.windDirectionDeg);
  const settling = Math.max(0.05, settings.settlingScale) * Math.min(7, Math.max(0.15, settings.diameterUm / 30)) * 0.35;
  return input.map((p) => {
    if (p.deposited) return p;
    const noiseE = seededNoise(p.id * 19 + Math.floor(simSeconds / 600)) * settings.turbulence;
    const noiseN = seededNoise(p.id * 31 + Math.floor(simSeconds / 700)) * settings.turbulence;
    const east = base.eastMs + noiseE;
    const north = base.northMs + noiseN;
    const latRad = p.lat * DEG;
    const dLat = north * dt / EARTH_RADIUS_M / DEG;
    const cosLat = Math.max(0.08, Math.abs(Math.cos(latRad)));
    const dLon = east * dt / (EARTH_RADIUS_M * cosLat) / DEG;
    // Keep coordinates in valid geographic ranges. Wrapping longitude naturally
    // supports the antimeridian; latitude is clamped for this lightweight model.
    let lon = p.lon + dLon;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    const lat = Math.max(-89.8, Math.min(89.8, p.lat + dLat));
    const altitudeM = Math.max(0, p.altitudeM - settling * dt + seededNoise(p.id + Math.floor(simSeconds / 300)) * settings.turbulence * 0.15);
    return {
      ...p, lon, lat, altitudeM,
      ageHours: p.ageHours + dt / 3600,
      deposited: altitudeM <= 0
    };
  });
}

export function classifyConcentration(value: number): CityResult["level"] {
  if (value >= 10) return "VERY HIGH";
  if (value >= 5) return "HIGH";
  if (value >= 2) return "MEDIUM";
  if (value >= 0.2) return "LOW";
  return "VERY LOW";
}

export function getCityResults(particles: Particle[], simHours: number): CityResult[] {
  return CITIES.map((city) => {
    let value = 0;
    for (const p of particles) {
      if (p.deposited || p.altitudeM < 0) continue;
      const distance = greatCircleKm(p.lon, p.lat, city.lon, city.lat);
      const spreadKm = 100 + p.altitudeM / 35;
      const kernel = Math.exp(-(distance * distance) / (2 * spreadKm * spreadKm));
      const vertical = Math.exp(-Math.abs(p.altitudeM - 1500) / 4500);
      value += p.massKg * kernel * vertical;
    }
    // A visualization proxy, not a physically validated air concentration.
    const concentration = value / Math.max(1, particles.length) * Math.min(1, simHours / 2 + 0.15) * 0.0008;
    return { ...city, concentration, level: classifyConcentration(concentration) };
  });
}

export function summarize(particles: Particle[], simHours: number) {
  const active = particles.filter((p) => !p.deposited);
  const activeMass = active.reduce((sum, p) => sum + p.massKg, 0);
  const meanAltitude = active.length ? active.reduce((sum, p) => sum + p.altitudeM, 0) / active.length : 0;
  const maxAltitude = active.reduce((m, p) => Math.max(m, p.altitudeM), 0);
  const maxDistanceKm = particles.reduce((m, p) => Math.max(m, greatCircleKm(VOLCANO.lon, VOLCANO.lat, p.lon, p.lat)), 0);
  return {
    activeParticles: active.length,
    meanAltitudeM: meanAltitude,
    maxAltitudeM: maxAltitude,
    maxDistanceKm,
    activeMassKg: activeMass,
    depositedParticles: particles.length - active.length,
    simHours
  };
}
