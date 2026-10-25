export type SurfaceWeather = {
  time: string[];
  windSpeed10m: number[];
  windDirection10m: number[];
  source: string;
};

export async function fetch2010SurfaceWeather(signal?: AbortSignal): Promise<SurfaceWeather> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.search = new URLSearchParams({
    latitude: "63.63",
    longitude: "-19.62",
    start_date: "2010-04-14",
    end_date: "2010-04-22",
    hourly: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "ms",
    timezone: "UTC"
  }).toString();

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
  const json = await response.json() as {
    hourly?: { time?: string[]; wind_speed_10m?: Array<number | null>; wind_direction_10m?: Array<number | null> };
  };
  const hourly = json.hourly;
  if (!hourly?.time || !hourly.wind_speed_10m || !hourly.wind_direction_10m) {
    throw new Error("The API response did not include the requested hourly wind fields.");
  }
  return {
    time: hourly.time,
    windSpeed10m: hourly.wind_speed_10m.map((v) => v ?? 0),
    windDirection10m: hourly.wind_direction_10m.map((v) => v ?? 240),
    source: "Open-Meteo Historical Weather API · ERA5 surface wind"
  };
}
