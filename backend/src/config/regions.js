import { env } from "./env.js";

/**
 * Region configs.
 *
 * bbox format: "minLat,minLng,maxLat,maxLng"
 *
 * metro-manila-calabarzon is the default for production.
 * The importer splits it into a 3×4 grid (12 cells) automatically so
 * Overpass never receives a query too large to answer.
 */
export const REGION_CONFIG = {
  /** Full production scope — Metro Manila + all CALABARZON provinces */
  "metro-manila-calabarzon": {
    name:    "Metro Manila + CALABARZON",
    bbox:    "13.80,120.55,14.83,122.10",
    gridLat: 3,
    gridLng: 4
  },

  /** Metro Manila only (for faster dev iterations) */
  "metro-manila": {
    name:    "Metro Manila",
    bbox:    "14.35,120.85,14.83,121.20",
    gridLat: 2,
    gridLng: 2
  },

  /** CALABARZON: Cavite, Laguna, Batangas, Rizal, Quezon */
  calabarzon: {
    name:    "CALABARZON",
    bbox:    "13.80,120.55,14.50,122.10",
    gridLat: 2,
    gridLng: 3
  },

  /** Individual provinces — useful for targeted re-imports */
  cavite: {
    name: "Cavite",
    bbox: "14.03,120.55,14.45,121.05"
  },
  laguna: {
    name: "Laguna",
    bbox: "13.85,121.00,14.40,121.70"
  },
  batangas: {
    name: "Batangas",
    bbox: "13.48,120.65,14.15,121.30"
  },
  rizal: {
    name: "Rizal",
    bbox: "14.35,121.05,14.85,121.60"
  },
  quezon: {
    name: "Quezon Province",
    bbox: "13.80,121.30,14.35,122.10"
  },

  custom: {
    name: "Custom",
    bbox: env.importDefaultBbox
  }
};

/**
 * Resolve a region key + optional explicit bbox into { regionKey, bbox }.
 * If an explicit bbox is supplied it always wins.
 */
export function resolveRegionConfig(regionKey, explicitBbox) {
  if (explicitBbox) {
    return { regionKey: regionKey || "custom", bbox: explicitBbox };
  }
  const key = (regionKey || env.importDefaultRegion || "metro-manila-calabarzon").toLowerCase();
  const region = REGION_CONFIG[key];
  if (region) return { regionKey: key, bbox: region.bbox };
  return { regionKey: "custom", bbox: env.importDefaultBbox };
}
