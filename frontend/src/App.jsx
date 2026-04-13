import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView.jsx";
import RouteCards from "./components/RouteCards.jsx";
import StopAutocomplete from "./components/StopAutocomplete.jsx";
import { fetchTrainInfo, getNearbyStops, getSavedRoutes, saveRoute, searchRoute } from "./lib/api.js";

export default function App() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);
  const [trainInfo, setTrainInfo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [locationHint, setLocationHint] = useState("");

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
  }, []);

  const activeRoute = useMemo(() => result?.routes?.[0] || null, [result]);

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
    const payload = {
      origin_text: origin,
      destination_text: destination,
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-rice via-sky-50 to-amber-50 px-4 py-8 md:px-8">
      <section className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <header className="rounded-3xl bg-ink p-6 text-white shadow-card">
            <h1 className="text-3xl font-black tracking-tight">PH Commute Guide</h1>
            <p className="mt-2 text-sm text-white/80">Alamin kung ano ang sasakyan mo mula Point A hanggang Point B.</p>
          </header>

          <form onSubmit={handleSearch} className="rounded-2xl bg-white p-5 shadow-card">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <StopAutocomplete
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Origin (hal. Recto Manila)"
                  disabled={loading || locating}
                />
                <button
                  className="mt-2 rounded-xl border border-sea px-3 py-1.5 text-xs font-semibold text-sea transition hover:bg-sky-50 disabled:opacity-60"
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                >
                  {locating ? "Kinukuha ang location..." : "Use my location"}
                </button>
              </div>
              <StopAutocomplete
                value={destination}
                onChange={setDestination}
                placeholder="Destination (hal. Cubao QC)"
                disabled={loading || locating}
              />
            </div>
            {locationHint ? <p className="mt-2 text-xs text-ink/70">{locationHint}</p> : null}
            <button
              className="mt-3 rounded-xl bg-sea px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              type="submit"
              disabled={loading || locating}
            >
              {loading ? "Naghahanap ng ruta..." : "Search Route"}
            </button>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          </form>

          <MapView activeRoute={activeRoute} />
          <RouteCards routes={result?.routes || []} onSave={handleSave} />
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-lg font-bold text-ink">Train First/Last Trip</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink/80">
              {trainInfo.map((line) => (
                <li key={line.line} className="rounded-xl border border-slate-100 p-3">
                  <p className="font-semibold">{line.line}</p>
                  <p>First Trip: {line.firstTrip}</p>
                  <p>Last Trip: {line.lastTrip}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-lg font-bold text-ink">Saved Routes</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink/80">
              {saved.slice(0, 8).map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-100 p-3">
                  <p className="font-semibold">{item.origin_text} to {item.destination_text}</p>
                  <p>{new Date(item.created_at).toLocaleString()}</p>
                </li>
              ))}
              {!saved.length ? <li>Wala pang saved routes.</li> : null}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
