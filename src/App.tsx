import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Activity, AlertTriangle, Cloud, Download, Gauge, Globe2, Layers3, Pause, Play, RotateCcw, Wind } from "lucide-react";
import StatCard from "./components/StatCard";
import { createParticles, getCityResults, summarize, stepParticles, VOLCANO } from "./engine/model";
import type { ModelSettings, Particle } from "./engine/types";
import { fetch2010SurfaceWeather } from "./services/openMeteo";

const initialSettings: ModelSettings = {
  emissionKgPerSecond: 500000,
  particleCount: 800,
  diameterUm: 45,
  turbulence: 4.5,
  settlingScale: 1,
  windSpeedMs: 18,
  windDirectionDeg: 240
};

const SPEEDS = [1, 5, 10, 50, 100, 500];

function formatNumber(n: number, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export default function App() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const particlesRef = useRef<Particle[]>(createParticles(initialSettings));
  const lastTick = useRef<number>(0);
  const simSecondsRef = useRef(0);
  const speedRef = useRef(10);
  const settingsRef = useRef(initialSettings);
  const [settings, setSettings] = useState(initialSettings);
  const [particles, setParticles] = useState<Particle[]>(particlesRef.current);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [simSeconds, setSimSeconds] = useState(0);
  const [mode, setMode] = useState<"demo" | "api">("demo");
  const [sourceStatus, setSourceStatus] = useState("DEMO MODEL · deterministic simplified wind field");
  const [apiLoading, setApiLoading] = useState(false);
  const [showWind, setShowWind] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { simSecondsRef.current = simSeconds; }, [simSeconds]);

  const updateMapData = useCallback((nextParticles: Particle[], nextSettings: ModelSettings) => {
    const map = mapRef.current;
    if (!map) return;
    const particleSource = map.getSource("ash-particles") as maplibregl.GeoJSONSource | undefined;
    particleSource?.setData({
      type: "FeatureCollection",
      features: nextParticles.filter((p) => !p.deposited).map((p) => ({
        type: "Feature" as const,
        properties: { altitude: p.altitudeM, diameter: p.diameterUm },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] as [number, number] }
      }))
    });
    const windSource = map.getSource("wind-origin") as maplibregl.GeoJSONSource | undefined;
    windSource?.setData({
      type: "FeatureCollection",
      features: Array.from({ length: 7 }, (_, i) => {
        const lon = VOLCANO.lon + (i - 3) * 7;
        const lat = VOLCANO.lat + (i % 2 ? 4 : -4);
        const angle = (nextSettings.windDirectionDeg + 180) * Math.PI / 180;
        const len = Math.min(10, Math.max(2, nextSettings.windSpeedMs * 0.35));
        return {
          type: "Feature" as const,
          properties: { bearing: nextSettings.windDirectionDeg },
          geometry: { type: "LineString" as const, coordinates: [
            [lon, lat], [lon + Math.sin(angle) * len, lat + Math.cos(angle) * len]
          ] as [number, number][] }
        };
      })
    });
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
          }
        },
        layers: [{ id: "background", type: "raster", source: "carto-dark" }]
      },
      center: [-7, 57],
      zoom: 2.2,
      minZoom: 1.3,
      maxZoom: 8,
      projection: { type: "globe" }
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("load", () => {
      map.addSource("ash-particles", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "ash-halo", type: "circle", source: "ash-particles",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2, 5, 5, 8, 8], "circle-color": "#ffad4a", "circle-opacity": 0.22, "circle-blur": 0.8 }
      });
      map.addLayer({
        id: "ash-points", type: "circle", source: "ash-particles",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 4, 2.7, 7, 4.5],
          "circle-color": ["interpolate", ["linear"], ["get", "altitude"], 0, "#f97316", 3000, "#fbbf24", 8000, "#fef3c7"],
          "circle-opacity": 0.84,
          "circle-stroke-width": 0.3,
          "circle-stroke-color": "#fff4d6"
        }
      });
      map.addSource("wind-origin", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "wind-lines", type: "line", source: "wind-origin",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#6bc8e8", "line-width": 1.5, "line-opacity": 0.55, "line-dasharray": [2, 2] }
      });
      map.addSource("cities", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [
          { type: "Feature", properties: { name: "London" }, geometry: { type: "Point", coordinates: [-0.1276, 51.5072] } },
          { type: "Feature", properties: { name: "Paris" }, geometry: { type: "Point", coordinates: [2.3522, 48.8566] } },
          { type: "Feature", properties: { name: "Frankfurt" }, geometry: { type: "Point", coordinates: [8.6821, 50.1109] } },
          { type: "Feature", properties: { name: "Oslo" }, geometry: { type: "Point", coordinates: [10.7522, 59.9139] } },
          { type: "Feature", properties: { name: "Stockholm" }, geometry: { type: "Point", coordinates: [18.0686, 59.3293] } }
        ]}
      });
      map.addLayer({
        id: "city-dots", type: "circle", source: "cities",
        paint: { "circle-radius": 4, "circle-color": "#79d5c7", "circle-stroke-color": "#e2fffa", "circle-stroke-width": 1.3 }
      });
      map.addLayer({
        id: "city-labels", type: "symbol", source: "cities",
        layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.1], "text-font": ["Open Sans Regular"] },
        paint: { "text-color": "#e7f0f7", "text-halo-color": "#07111e", "text-halo-width": 1.2 }
      });
      new maplibregl.Marker({ color: "#ff7a45" }).setLngLat([VOLCANO.lon, VOLCANO.lat]).setPopup(new maplibregl.Popup().setHTML("<strong>Eyjafjallajökull</strong><br/>Eruption reference point")).addTo(map);
      updateMapData(particlesRef.current, settingsRef.current);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [updateMapData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("ash-points")) map.setLayoutProperty("ash-points", "visibility", showParticles ? "visible" : "none");
    if (map.getLayer("ash-halo")) map.setLayoutProperty("ash-halo", "visibility", showParticles ? "visible" : "none");
    if (map.getLayer("wind-lines")) map.setLayoutProperty("wind-lines", "visibility", showWind ? "visible" : "none");
  }, [showWind, showParticles]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const animate = (now: number) => {
      if (!lastTick.current) lastTick.current = now;
      const elapsed = Math.min(150, now - lastTick.current);
      lastTick.current = now;
      const simulatedDt = elapsed / 1000 * speedRef.current * 60;
      const nextSeconds = simSecondsRef.current + simulatedDt;
      simSecondsRef.current = nextSeconds;
      particlesRef.current = stepParticles(particlesRef.current, settingsRef.current, simulatedDt, nextSeconds);
      setParticles(particlesRef.current);
      setSimSeconds(nextSeconds);
      updateMapData(particlesRef.current, settingsRef.current);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(raf); lastTick.current = 0; };
  }, [running, updateMapData]);

  const summary = useMemo(() => summarize(particles, simSeconds / 3600), [particles, simSeconds]);
  const cityResults = useMemo(() => getCityResults(particles, simSeconds / 3600), [particles, simSeconds]);

  const changeSetting = (key: keyof ModelSettings, value: number) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      settingsRef.current = next;
      updateMapData(particlesRef.current, next);
      return next;
    });
  };

  const reset = () => {
    setRunning(false);
    setSimSeconds(0);
    simSecondsRef.current = 0;
    const fresh = createParticles(settingsRef.current);
    particlesRef.current = fresh;
    setParticles(fresh);
    updateMapData(fresh, settingsRef.current);
    setNotice("시뮬레이션 상태를 초기화했습니다.");
  };

  const loadWeather = async () => {
    setApiLoading(true);
    setNotice("");
    try {
      const weather = await fetch2010SurfaceWeather();
      const mid = Math.min(weather.windSpeed10m.length - 1, 72);
      changeSetting("windSpeedMs", weather.windSpeed10m[mid] || 18);
      changeSetting("windDirectionDeg", weather.windDirection10m[mid] || 240);
      setMode("api");
      setSourceStatus(`${weather.source} · ${weather.time[mid] ?? "hourly data"}`);
      setNotice("2010년 지표 바람을 가져왔습니다. 지표 바람을 참고한 단순 모델이며 3D 기상장이 아닙니다.");
    } catch (err) {
      setMode("demo");
      setSourceStatus("DEMO MODEL · API request failed");
      setNotice(`기상 자료 요청 실패: ${err instanceof Error ? err.message : "unknown error"}. 데모 모델을 유지합니다.`);
    } finally {
      setApiLoading(false);
    }
  };

  const exportData = (format: "json" | "csv") => {
    const payload = {
      project: "ASHFLOW Iceland Volcano Simulation",
      warning: "Demo model output; not validated for aviation safety or historical reconstruction.",
      mode, simulatedHours: simSeconds / 3600, settings,
      summary, cityResults,
      particles: particles.slice(0, 5000)
    };
    let content: string, mime: string, filename: string;
    if (format === "json") {
      content = JSON.stringify(payload, null, 2);
      mime = "application/json";
      filename = "ashflow-simulation.json";
    } else {
      content = [
        "city,longitude,latitude,concentration_proxy,model_alert",
        ...cityResults.map((c) => `${c.name},${c.lon},${c.lat},${c.concentration.toFixed(5)},${c.level}`)
      ].join("\\n");
      mime = "text/csv;charset=utf-8";
      filename = "ashflow-city-alerts.csv";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark"><Cloud size={21} /></div>
        <div><div className="brand-name">ASHFLOW<span> / LAB</span></div><div className="brand-subtitle">VOLCANIC ASH DISPERSION</div></div>
      </div>
      <div className="project-tag"><span className="live-dot" /> ICELAND · 2010 EVENT STUDY</div>
      <section className="control-section">
        <div className="section-heading"><span>SIMULATION CONTROL</span><Activity size={15} /></div>
        <div className="playback-row">
          <button className={`primary-control ${running ? "is-running" : ""}`} onClick={() => setRunning(!running)} aria-label={running ? "Pause simulation" : "Start simulation"}>
            {running ? <Pause size={17} /> : <Play size={17} fill="currentColor" />} {running ? "PAUSE" : "RUN SIMULATION"}
          </button>
          <button className="icon-control" onClick={reset} title="Reset"><RotateCcw size={17} /></button>
        </div>
        <div className="sub-label">PLAYBACK SPEED</div>
        <div className="speed-grid">{SPEEDS.map((s) => <button key={s} className={`speed-button ${speed === s ? "selected" : ""}`} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
        <div className="time-readout"><span>SIMULATION ELAPSED</span><strong>{Math.floor(simSeconds / 3600).toString().padStart(2, "0")}:{Math.floor((simSeconds % 3600) / 60).toString().padStart(2, "0")}</strong><small>HH : MM · model clock</small></div>
      </section>

      <section className="control-section">
        <div className="section-heading"><span>EXPERIMENT PARAMETERS</span><Gauge size={15} /></div>
        <SliderControl label="Mass eruption rate" value={settings.emissionKgPerSecond} min={100000} max={1000000} step={50000} display={`${(settings.emissionKgPerSecond / 1000).toFixed(0)} t/s`} onChange={(v) => changeSetting("emissionKgPerSecond", v)} />
        <SliderControl label="Particle diameter" value={settings.diameterUm} min={5} max={150} step={5} display={`${settings.diameterUm} μm`} onChange={(v) => changeSetting("diameterUm", v)} />
        <SliderControl label="Turbulent diffusion" value={settings.turbulence} min={0} max={12} step={0.5} display={settings.turbulence.toFixed(1)} onChange={(v) => changeSetting("turbulence", v)} />
        <SliderControl label="Settling multiplier" value={settings.settlingScale} min={0.2} max={3} step={0.1} display={`${settings.settlingScale.toFixed(1)}×`} onChange={(v) => changeSetting("settlingScale", v)} />
        <div className="sub-label wind-label"><Wind size={13} /> REFERENCE WIND</div>
        <SliderControl label="Wind speed" value={settings.windSpeedMs} min={0} max={40} step={1} display={`${settings.windSpeedMs} m/s`} onChange={(v) => changeSetting("windSpeedMs", v)} />
        <SliderControl label="Wind direction" value={settings.windDirectionDeg} min={0} max={359} step={1} display={`${settings.windDirectionDeg}°`} onChange={(v) => changeSetting("windDirectionDeg", v)} />
      </section>

      <section className="control-section layers-section">
        <div className="section-heading"><span>MAP LAYERS</span><Layers3 size={15} /></div>
        <label className="toggle-row"><span><i className="legend-dot ash" />Ash particle field</span><input type="checkbox" checked={showParticles} onChange={(e) => setShowParticles(e.target.checked)} /></label>
        <label className="toggle-row"><span><i className="legend-line" />Wind direction</span><input type="checkbox" checked={showWind} onChange={(e) => setShowWind(e.target.checked)} /></label>
      </section>
      <div className="sidebar-footer"><span>MODEL BUILD 0.1.0</span><span>RESEARCH PROTOTYPE</span></div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div className="breadcrumb">SIMULATION <span>/</span> <b>DISPERSION OVERVIEW</b></div>
        <div className="top-actions">
          <div className={`mode-chip ${mode === "api" ? "api" : ""}`}><span />{mode === "api" ? "2010 SURFACE DATA" : "DEMO MODEL"}</div>
          <button className="outline-button" onClick={() => void loadWeather()} disabled={apiLoading}>{apiLoading ? "FETCHING…" : "FETCH 2010 WEATHER"}</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="page-title-row">
          <div><div className="eyebrow">EYJAFJALLAJÖKULL · APR 2010</div><h1>Ash dispersion <em>monitor</em></h1><p>Explore a simplified model of volcanic ash transport across the North Atlantic and Europe.</p></div>
          <div className="event-date"><span>REFERENCE EVENT</span><strong>14 APR — 22 MAY 2010</strong><small>Historical context · not a reconstruction</small></div>
        </div>

        {notice && <div className="notice"><AlertTriangle size={15} /><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

        <div className="map-card">
          <div className="map-overlay-title"><span className="map-pulse" /><div><strong>NORTH ATLANTIC / EUROPE</strong><small>Interactive globe · particle transport field</small></div></div>
          <div ref={mapNode} className="map-canvas" />
          <div className="map-legend"><span><i className="legend-dot ash" /> Ash particles</span><span><i className="legend-dot city" /> Monitoring cities</span><span><i className="legend-line" /> Reference wind</span></div>
          <div className="map-scale"><Globe2 size={13} /> WGS84 · spherical distance</div>
          <div className="map-disclaimer">SIMULATED PARTICLES · NOT OBSERVED ASH</div>
        </div>

        <div className="section-title-row"><div><h2>Model diagnostics</h2><p>Live estimates from the current simulation state</p></div><div className="data-source"><span className="source-dot" />{sourceStatus}</div></div>
        <div className="stats-grid">
          <StatCard label="AIRBORNE PARTICLES" value={formatNumber(summary.activeParticles)} detail={`of ${formatNumber(particles.length)} representatives`} />
          <StatCard label="MEAN ALTITUDE" value={`${formatNumber(summary.meanAltitudeM / 1000, 2)} km`} detail="active particles only" />
          <StatCard label="MAXIMUM ALTITUDE" value={`${formatNumber(summary.maxAltitudeM / 1000, 2)} km`} detail="model maximum" />
          <StatCard label="MAX SURFACE DISTANCE" value={`${formatNumber(summary.maxDistanceKm)} km`} detail="great-circle from vent" />
        </div>

        <section className="city-section">
          <div className="section-title-row"><div><h2>European city alerts</h2><p>Model concentration proxy · project-specific thresholds</p></div><span className="mini-badge">5 LOCATIONS</span></div>
          <div className="city-grid">{cityResults.map((city) => <div className="city-card" key={city.name}>
            <div className="city-top"><span className="city-status-dot" data-level={city.level} /><strong>{city.name}</strong><span className={`alert-pill ${city.level.toLowerCase().replace(" ", "-")}`}>{city.level}</span></div>
            <div className="city-concentration">{city.concentration.toFixed(3)} <span>mg/m³*</span></div>
            <div className="city-meter"><span style={{ width: `${Math.min(100, city.concentration / 10 * 100)}%` }} /></div>
            <div className="city-foot"><span>MODEL PROXY</span><span>Δ {formatNumber(city.lat, 1)}° N</span></div>
          </div>)}</div>
          <div className="threshold-note">* 표시값은 모델 비교용 농도 프록시입니다. 물리적으로 검증된 mg/m³ 측정값이 아니며 공식 항공 안전 임계값이 아닙니다.</div>
        </section>

        <section className="bottom-grid">
          <div className="panel-card">
            <div className="section-title-row compact"><div><h2>Mass budget</h2><p>Representative-particle bookkeeping</p></div><Activity size={16} /></div>
            <div className="budget-row"><span>Initial representative mass</span><strong>{formatNumber(particles.reduce((s, p) => s + p.massKg, 0) / 1000, 1)} t</strong></div>
            <div className="budget-row"><span>Airborne mass estimate</span><strong>{formatNumber(summary.activeMassKg / 1000, 1)} t</strong></div>
            <div className="budget-row"><span>Deposited particles</span><strong>{formatNumber(summary.depositedParticles)}</strong></div>
            <div className="budget-bar"><span style={{ width: `${particles.length ? summary.activeParticles / particles.length * 100 : 0}%` }} /></div>
            <div className="budget-foot"><span>Airborne fraction</span><strong>{particles.length ? (summary.activeParticles / particles.length * 100).toFixed(1) : "0.0"}%</strong></div>
          </div>
          <div className="panel-card export-card">
            <div className="section-title-row compact"><div><h2>Export session</h2><p>Download the current model state</p></div><Download size={16} /></div>
            <p className="export-copy">Export includes model settings, city alert proxies, summary diagnostics and representative particle coordinates.</p>
            <div className="export-buttons"><button onClick={() => exportData("json")}><Download size={14} /> JSON snapshot</button><button onClick={() => exportData("csv")}><Download size={14} /> City alerts CSV</button></div>
            <div className="export-warning"><AlertTriangle size={14} /> Include model caveats when sharing exported data.</div>
          </div>
        </section>

        <footer className="page-footer"><span>ASHFLOW LAB · OPEN RESEARCH PROTOTYPE</span><span>Map tiles © OpenStreetMap contributors / CARTO · Weather data via Open-Meteo when requested</span></footer>
      </div>
    </section>
  </main>;
}

function SliderControl({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void;
}) {
  return <div className="slider-control">
    <div className="slider-heading"><label>{label}</label><strong>{display}</strong></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </div>;
}
