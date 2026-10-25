export type Particle = {
  id: number;
  lon: number;
  lat: number;
  altitudeM: number;
  massKg: number;
  diameterUm: number;
  ageHours: number;
  deposited: boolean;
};

export type ModelSettings = {
  emissionKgPerSecond: number;
  particleCount: number;
  diameterUm: number;
  turbulence: number;
  settlingScale: number;
  windSpeedMs: number;
  windDirectionDeg: number;
};

export type City = {
  name: string;
  lon: number;
  lat: number;
};

export type CityResult = City & {
  concentration: number;
  level: "VERY LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH";
};
