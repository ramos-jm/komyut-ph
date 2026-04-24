import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import AvailableCatalogSection from "./components/AvailableCatalogSection.jsx";
import RouteCards from "./components/RouteCards.jsx";
import StopAutocomplete from "./components/StopAutocomplete.jsx";
import { fetchAvailableCatalog, fetchTrainInfo, getNearbyStops, getSavedRoutes, saveRoute, searchRoute } from "./lib/api.js";

const MapView = lazy(() => import("./components/MapView.jsx"));

function getTrainLinePalette(line) {
  const normalized = String(line || "").toUpperCase();

  if (normalized.includes("MRT-3")) {
    return {
      dot: "bg-sky-400",
      label: "text-sky-700",
      ring: "ring-sky-200"
    };
  }

  if (normalized.includes("LRT-1")) {
    return {
      dot: "bg-amber-500",
      label: "text-amber-700",
      ring: "ring-amber-200"
    };
  }

  if (normalized.includes("LRT-2")) {
    return {
      dot: "bg-rose-500",
      label: "text-rose-700",
      ring: "ring-rose-200"
    };
  }

  return {
    dot: "bg-emerald-500",
    label: "text-emerald-700",
    ring: "ring-emerald-200"
  };
}

export default function App() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);
  const [trainInfo, setTrainInfo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [selectedRouteType, setSelectedRouteType] = useState("fastest");

  useEffect(() => {
    fetchTrainInfo()
      .then((data) => setTrainInfo(data.lines || []))
      .catch(() => setTrainInfo([]));

    getSavedRoutes()
      .then((data) => setSaved(data.routes || []))
      .catch(() => {
        const local = localStorage.getItem("phcg:saved");
        if (local) {
          setSaved(JSON.parse(local));
        }
      });

    fetchAvailableCatalog(1000)
      .then((data) => {
        setCatalog(data);
        setCatalogError("");
      })
      .catch((err) => {
        setCatalogError(err?.message || "Hindi ma-load ang available catalog.");
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    if (result?.routes?.length) {
      setSelectedRouteType(result.routes[0].type);
    }
  }, [result]);

  useEffect(() => {
    // Warm this split chunk when the user starts searching to reduce map loading wait.
    if (origin || destination || result?.routes?.length) {
      import("./components/MapView.jsx");
    }
  }, [origin, destination, result]);

  const activeRoute = useMemo(() => {
    if (!result?.routes?.length) {
      return null;
    }

    return result.routes.find((route) => route.type === selectedRouteType) || result.routes[0];
  }, [result, selectedRouteType]);

  async function handleSearch(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Handle if origin/destination are objects (from autocomplete) or strings (manual input)
      const originText = typeof origin === "string" ? origin : origin?.name || "";
      const destinationText = typeof destination === "string" ? destination : destination?.name || "";

      const data = await searchRoute(originText, destinationText);
      setResult(data);
      if (!data.routes?.length) {
        setError("Walang nahanap na route sa ngayon. Try mo maglagay ng mas specific na location.");
      }
    } catch (err) {
      setError(err?.message || "Hindi ma-load ang route. Paki-check ang internet o backend API.");
    } finally {
      setLoading(false);
    }
  }

  async function applyOriginFromCoordinates(latitude, longitude) {
    try {
      const data = await getNearbyStops(latitude, longitude, 1200);
      const nearest = data?.stops?.[0];

      if (nearest?.name) {
        setOrigin(nearest.name);
        setLocationHint(`Origin set to nearest stop: ${nearest.name}`);
      } else {
        setOrigin(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setLocationHint("No nearby stop found. Using your coordinates as origin.");
      }
    } catch (err) {
      setLocationHint("");
      setError(err?.message || "Hindi mahanap ang nearby stops mula sa current location.");
    }
  }

  function handleUseMyLocation() {
    setError("");
    setLocationHint("");

    if (!navigator.geolocation) {
      setError("Hindi supported ang geolocation sa browser na ito. Paki-type na lang ang origin.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        await applyOriginFromCoordinates(latitude, longitude);
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Permission denied sa location. Paki-type na lang ang origin mo manually.");
          return;
        }

        if (geoError.code === geoError.TIMEOUT) {
          setError("Nag-timeout ang location request. Subukan ulit o i-type ang origin manually.");
          return;
        }

        setError("Hindi makuha ang current location mo ngayon. Paki-type ang origin manually.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 120000
      }
    );
  }

  async function handleSave(route) {
    const originText = typeof origin === "string" ? origin : origin?.name || "";
    const destinationText = typeof destination === "string" ? destination : destination?.name || "";

    const payload = {
      origin_text: originText,
      destination_text: destinationText,
      route_data: route,
      user_id: null
    };

    try {
      const savedRoute = await saveRoute(payload);
      const updated = [savedRoute, ...saved];
      setSaved(updated);
      localStorage.setItem("phcg:saved", JSON.stringify(updated));
    } catch (_error) {
      const offlineSaved = {
        id: `offline-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString()
      };
      const updated = [offlineSaved, ...saved];
      setSaved(updated);
      localStorage.setItem("phcg:saved", JSON.stringify(updated));
    }
  }

  function handleRestoreSavedRoute(item) {
    const restoredRouteRaw = item?.route_data;
    let restoredRoute = restoredRouteRaw;

    if (typeof restoredRouteRaw === "string") {
      try {
        restoredRoute = JSON.parse(restoredRouteRaw);
      } catch {
        restoredRoute = null;
      }
    }

    if (!restoredRoute || typeof restoredRoute !== "object") {
      setError("Hindi ma-restore ang saved route na ito. Invalid route data.");
      return;
    }

    const normalizedType = restoredRoute.type || "fastest";
    const normalizedRoute = {
      ...restoredRoute,
      type: normalizedType
    };

    setOrigin(item.origin_text || "");
    setDestination(item.destination_text || "");
    setResult({ routes: [normalizedRoute] });
    setSelectedRouteType(normalizedType);
    setError("");
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 md:px-7 xl:px-10">
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-5">
          <header className="surface-accent rounded-[2rem] p-6 md:p-8">
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">
              Commute Intelligence
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">Komyut PH</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80 md:text-base">
              Smart friend mo sa biyahe. Compare fastest, least transfer, at budget-friendly routes in one view.
            </p>
          </header>

          <form onSubmit={handleSearch} className="surface-card rounded-[1.6rem] p-5 md:p-6">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="origin-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Origin</label>
                <StopAutocomplete
                  inputId="origin-input"
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Hal. Recto Manila"
                  disabled={loading || locating}
                />
                <button
                  className="mt-2 inline-flex items-center rounded-xl border border-cyan-500/30 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                >
                  {locating ? "Kinukuha ang location..." : "Use my location"}
                </button>
              </div>

              <div>
                <label htmlFor="destination-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Destination</label>
                <StopAutocomplete
                  inputId="destination-input"
                  value={destination}
                  onChange={setDestination}
                  placeholder="Hal. Cubao QC"
                  disabled={loading || locating}
                />
              </div>
            </div>

            {locationHint ? <p className="mt-3 text-xs text-slate-600">{locationHint}</p> : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                type="submit"
                disabled={loading || locating}
              >
                {loading ? "Naghahanap ng ruta..." : "Search Route"}
              </button>
              {result?.routes?.length ? (
                <p className="text-xs font-medium text-slate-600">{result.routes.length} route option(s) available</p>
              ) : null}
            </div>

            {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          </form>

          <Suspense
            fallback={
              <div className="surface-card flex h-[420px] w-full items-center justify-center rounded-[1.6rem] p-6 text-sm text-slate-600">
                Loading map experience...
              </div>
            }
          >
            <MapView
              routes={result?.routes || []}
              selectedRouteType={activeRoute?.type || selectedRouteType}
              onSelectRoute={setSelectedRouteType}
            />
          </Suspense>

          <RouteCards
            routes={result?.routes || []}
            selectedRouteType={activeRoute?.type || selectedRouteType}
            onSelectRoute={setSelectedRouteType}
            onSave={handleSave}
          />
        </div>

        <aside className="space-y-5">
          <div className="surface-card rounded-[1.6rem] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Rail Timetable</h2>
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-white">Live look</span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Line</th>
                    <th className="px-4 py-2.5 font-semibold">First Trip</th>
                    <th className="px-4 py-2.5 font-semibold">Last Trip</th>
                  </tr>
                </thead>
                <tbody>
                  {trainInfo.map((line) => {
                    const palette = getTrainLinePalette(line.line);

                    return (
                      <tr key={line.line} className="border-t border-slate-100 bg-white hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="inline-flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} />
                            <span className={`font-semibold ${palette.label}`}>{line.line}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{line.firstTrip}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{line.lastTrip}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-slate-500">Tip: Morning departures are usually lighter before 7:00 AM.</p>
          </div>

          <div className="surface-card rounded-[1.6rem] p-5 md:p-6">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Saved Routes</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {saved.slice(0, 8).map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => handleRestoreSavedRoute(item)}
                  >
                    <p className="font-semibold text-slate-900">{item.origin_text} to {item.destination_text}</p>
                    <p className="text-xs text-cyan-700">Tap to restore this route</p>
                    <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                  </button>
                </li>
              ))}
              {!saved.length ? <li className="text-sm text-slate-500">Wala pang saved routes.</li> : null}
            </ul>
          </div>
        </aside>
      </section>

      <section className="mx-auto w-full max-w-7xl">
        <AvailableCatalogSection
          catalog={catalog}
          loading={catalogLoading}
          error={catalogError}
        />
      </section>
    </main>
  );
}
