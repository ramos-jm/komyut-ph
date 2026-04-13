import { env } from "./env.js";

export const REGION_CONFIG = {
  "metro-manila": {
    name: "Metro Manila",
    bbox: "14.35,120.85,14.83,121.20"
  },
  calabarzon: {
    name: "CALABARZON",
    bbox: "13.80,120.55,14.75,122.10"
  },
  "metro-manila-calabarzon": {
    name: "Metro Manila + CALABARZON",
    bbox: "13.80,120.55,14.83,122.10"
  },
  custom: {
    name: "Custom",
    bbox: env.importDefaultBbox
  }
};

export function resolveRegionConfig(regionKey, explicitBbox) {
  if (explicitBbox) {
    return {
      regionKey: regionKey || "custom",
      bbox: explicitBbox
    };
  }

  const key = (regionKey || env.importDefaultRegion || "metro-manila").toLowerCase();
  const region = REGION_CONFIG[key];

  if (region) {
    return { regionKey: key, bbox: region.bbox };
  }

  return {
    regionKey: "custom",
    bbox: env.importDefaultBbox
  };
}
