const TRANSPORT_THEME = {
  walk: {
    label: "Walk",
    color: "#64748b",
    bgClass: "bg-slate-100",
    textClass: "text-slate-700",
    ringClass: "ring-slate-200"
  },
  jeep: {
    label: "Jeepney",
    color: "#16a34a",
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-700",
    ringClass: "ring-emerald-200"
  },
  bus: {
    label: "Bus",
    color: "#f97316",
    bgClass: "bg-orange-100",
    textClass: "text-orange-700",
    ringClass: "ring-orange-200"
  },
  uv: {
    label: "UV Express",
    color: "#8b5cf6",
    bgClass: "bg-violet-100",
    textClass: "text-violet-700",
    ringClass: "ring-violet-200"
  },
  train: {
    label: "Train",
    color: "#38bdf8",
    bgClass: "bg-sky-100",
    textClass: "text-sky-700",
    ringClass: "ring-sky-200"
  }
};

const TRAIN_LINE_THEME = {
  "MRT-3": {
    lineCode: "mrt3",
    label: "MRT-3",
    color: "#38bdf8",
    bgClass: "bg-sky-100",
    textClass: "text-sky-700",
    ringClass: "ring-sky-200"
  },
  "LRT-1": {
    lineCode: "lrt1",
    label: "LRT-1",
    color: "#f59e0b",
    bgClass: "bg-amber-100",
    textClass: "text-amber-700",
    ringClass: "ring-amber-200"
  },
  "LRT-2": {
    lineCode: "lrt2",
    label: "LRT-2",
    color: "#ef4444",
    bgClass: "bg-rose-100",
    textClass: "text-rose-700",
    ringClass: "ring-rose-200"
  }
};

export function getTrainLineTheme(signboard = "") {
  const normalized = String(signboard || "").toUpperCase();

  if (normalized.includes("MRT-3")) {
    return TRAIN_LINE_THEME["MRT-3"];
  }

  if (normalized.includes("LRT-1")) {
    return TRAIN_LINE_THEME["LRT-1"];
  }

  if (normalized.includes("LRT-2")) {
    return TRAIN_LINE_THEME["LRT-2"];
  }

  return {
    lineCode: "train",
    label: "Train",
    ...TRANSPORT_THEME.train
  };
}

export function getTransitTheme(mode = "walk", signboard = "") {
  if (mode === "train") {
    return getTrainLineTheme(signboard);
  }

  return TRANSPORT_THEME[mode] || TRANSPORT_THEME.walk;
}

export const ROUTE_OPTION_META = {
  fastest: {
    label: "Fastest",
    hint: "Earliest arrival",
    bgClass: "bg-cyan-100",
    textClass: "text-cyan-700"
  },
  least_transfers: {
    label: "Least Transfers",
    hint: "Smoother ride",
    bgClass: "bg-amber-100",
    textClass: "text-amber-700"
  },
  cheapest: {
    label: "Cheapest",
    hint: "Lower total fare",
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-700"
  }
};
