function Badge({ label, active }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-sea text-white" : "bg-white text-ink/70"
      }`}
    >
      {label}
    </span>
  );
}

export default function RouteCards({ routes, onSave }) {
  if (!routes?.length) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-card">
        <p className="text-sm text-ink/70">Wala pang route result. Subukan mo mag-search ng origin at destination.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {routes.map((route) => (
        <div key={`${route.type}-${route.estimatedMinutes}`} className="rounded-2xl bg-white p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge label="Fastest" active={route.type === "fastest"} />
            <Badge label="Least Transfers" active={route.type === "least_transfers"} />
            <Badge label="Cheapest" active={route.type === "cheapest"} />
          </div>

          <div className="mb-3 flex flex-wrap gap-4 text-sm text-ink/80">
            <p>ETA: {route.estimatedMinutes} mins</p>
            <p>Fare est: PHP {route.estimatedFare}</p>
            <p>Transfers: {route.transfers}</p>
          </div>

          <ol className="space-y-2 text-sm text-ink/90">
            {route.steps.map((step, index) => (
              <li key={`${route.type}-${index}`} className="rounded-xl border border-slate-100 p-3">
                <span className="mr-2 inline-flex rounded-full bg-ink px-2 py-0.5 text-xs text-white">
                  {step.mode.toUpperCase()}
                </span>
                {step.instruction}
              </li>
            ))}
          </ol>

          <button
            className="mt-4 rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            onClick={() => onSave(route)}
            type="button"
          >
            Save This Route
          </button>
        </div>
      ))}
    </div>
  );
}
