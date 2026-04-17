import { ROUTE_OPTION_META, getTransitTheme } from "../lib/transitTheme.js";

function OptionButton({ label, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
      {hint ? <span className="ml-1 hidden text-[10px] font-medium text-inherit/80 md:inline">{hint}</span> : null}
    </button>
  );
}

export default function RouteCards({ routes, selectedRouteType, onSelectRoute, onSave }) {
  if (!routes?.length) {
    return (
      <div className="surface-card rounded-[1.5rem] p-5">
        <p className="text-sm text-slate-600">Wala pang route result. Subukan mo mag-search ng origin at destination.</p>
      </div>
    );
  }

  const activeRoute = routes.find((route) => route.type === selectedRouteType) || routes[0];

  return (
    <article className="surface-card rounded-[1.5rem] border border-cyan-300 p-5 shadow-route-active">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {routes.map((route) => {
            const meta = ROUTE_OPTION_META[route.type] || {
              label: route.type,
              hint: "Route option"
            };

            return (
              <OptionButton
                key={route.type}
                label={meta.label}
                hint={meta.hint}
                active={activeRoute.type === route.type}
                onClick={() => onSelectRoute(route.type)}
              />
            );
          })}
        </div>

        <span className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
          Showing on map
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-xs sm:text-sm">
        <div className="rounded-xl bg-cyan-50 p-3 text-cyan-800">
          <p className="text-[11px] uppercase tracking-[0.08em] text-cyan-700">ETA</p>
          <p className="font-bold">{activeRoute.estimatedMinutes} mins</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
          <p className="text-[11px] uppercase tracking-[0.08em] text-emerald-700">Fare est.</p>
          <p className="font-bold">PHP {activeRoute.estimatedFare}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3 text-amber-800">
          <p className="text-[11px] uppercase tracking-[0.08em] text-amber-700">Transfers</p>
          <p className="font-bold">{activeRoute.transfers}</p>
        </div>
      </div>

      <ol className="space-y-2.5 text-sm text-slate-800">
        {activeRoute.steps.map((step, index) => (
          <li key={`${activeRoute.type}-${index}`} className="rounded-xl border border-slate-100 bg-white p-3">
            <StepModeChip step={step} />
            <p className="mt-2 leading-relaxed">{step.instruction}</p>
          </li>
        ))}
      </ol>

      <button
        className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        onClick={() => onSave(activeRoute)}
        type="button"
      >
        Save This Route
      </button>
    </article>
  );
}

function StepModeChip({ step }) {
  const theme = getTransitTheme(step.mode, step.signboard || step.instruction);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.bgClass} ${theme.textClass}`}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.color }} />
      {theme.label}
    </span>
  );
}
