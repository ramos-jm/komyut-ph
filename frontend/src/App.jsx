import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView.jsx";
import RouteCards from "./components/RouteCards.jsx";
import { fetchTrainInfo, getSavedRoutes, saveRoute, searchRoute } from "./lib/api.js";

export default function App() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);
  const [trainInfo, setTrainInfo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      const data = await searchRoute(origin, destination);
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
              <input
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sea"
                placeholder="Origin (hal. Recto Manila)"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                required
              />
              <input
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-sea"
                placeholder="Destination (hal. Cubao QC)"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              />
            </div>
            <button
              className="mt-3 rounded-xl bg-sea px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              type="submit"
              disabled={loading}
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
