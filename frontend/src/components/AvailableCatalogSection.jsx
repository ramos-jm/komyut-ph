import { useMemo, useState } from "react";

function typeClass(type) {
  const normalized = String(type || "").toLowerCase();

  if (normalized === "jeep") return "bg-amber-100 text-amber-800";
  if (normalized === "bus") return "bg-sky-100 text-sky-800";
  if (normalized === "train") return "bg-rose-100 text-rose-800";
  if (normalized === "uv") return "bg-emerald-100 text-emerald-800";

  return "bg-slate-100 text-slate-700";
}

function TypeBadge({ value }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${typeClass(value)}`}>
      {value || "n/a"}
    </span>
  );
}

function sectionTabClass(active) {
  return active
    ? "bg-slate-900 text-white"
    : "bg-white text-slate-600 hover:bg-slate-100";
}

export default function AvailableCatalogSection({ catalog, loading, error }) {
  const [activeTab, setActiveTab] = useState("stops");
  const [query, setQuery] = useState("");

  const routes = catalog?.routes || [];
  const stops = catalog?.stops || [];

  const filteredStops = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stops;

    return stops.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const type = String(item.type || "").toLowerCase();
      return name.includes(q) || type.includes(q);
    });
  }, [stops, query]);

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;

    return routes.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const signboard = String(item.signboard || "").toLowerCase();
      const type = String(item.type || "").toLowerCase();
      return name.includes(q) || signboard.includes(q) || type.includes(q);
    });
  }, [routes, query]);

  const summary = catalog?.summary;

  return (
    <section className="surface-card mt-8 rounded-[1.8rem] border border-cyan-200/60 p-5 shadow-route-active md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
            Network Catalog
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">Available Places and Routes</h2>
          <p className="mt-1 text-sm text-slate-600">
            Snapshot of what your app currently knows from the imported transit dataset.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Coverage</p>
          <p className="text-sm font-semibold text-slate-800">
            {summary ? `${summary.returnedStops} stops • ${summary.returnedRoutes} routes` : "Loading..."}
          </p>
          {summary?.cappedByLimit ? (
            <p className="text-[11px] text-amber-700">Showing first {summary.limit} entries per table</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${sectionTabClass(activeTab === "stops")}`} onClick={() => setActiveTab("stops")}>Places (Stops)</button>
        <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${sectionTabClass(activeTab === "routes")}`} onClick={() => setActiveTab("routes")}>Routes</button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={activeTab === "stops" ? "Filter places by name/type" : "Filter routes by name/signboard/type"}
          className="ml-auto w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 md:w-[320px]"
        />
      </div>

      {error ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="max-h-[420px] overflow-auto">
          {loading ? (
            <div className="p-6 text-sm text-slate-600">Loading catalog...</div>
          ) : null}

          {!loading && activeTab === "stops" ? (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Place</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Route Links</th>
                  <th className="px-4 py-2.5 font-semibold">Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {filteredStops.map((item) => (
                  <tr key={`stop-${item.id}`} className="border-t border-slate-100 hover:bg-cyan-50/35">
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                    <td className="px-4 py-3"><TypeBadge value={item.type} /></td>
                    <td className="px-4 py-3 font-medium text-slate-700">{item.route_count}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {!loading && activeTab === "routes" ? (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Route</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Signboard</th>
                  <th className="px-4 py-2.5 font-semibold">Stops</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map((item) => (
                  <tr key={`route-${item.id}`} className="border-t border-slate-100 hover:bg-cyan-50/35">
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                    <td className="px-4 py-3"><TypeBadge value={item.type} /></td>
                    <td className="px-4 py-3 text-slate-700">{item.signboard || "No signboard"}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{item.stop_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {!loading && activeTab === "stops" && filteredStops.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">No places match your filter.</div>
          ) : null}

          {!loading && activeTab === "routes" && filteredRoutes.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">No routes match your filter.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
