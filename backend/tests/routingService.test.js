import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/transitRepository.js", () => ({
  findNearbyStops: vi.fn(),
  getTransitGraph: vi.fn()
}));

import { findNearbyStops, getTransitGraph } from "../src/repositories/transitRepository.js";
import { searchCommuteRoutes } from "../src/services/routingService.js";

describe("routingService searchCommuteRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ranked route options with signboard-based steps", async () => {
    findNearbyStops
      .mockResolvedValueOnce([
        { id: 1, name: "Origin Stop", distance_m: 120 },
        { id: 5, name: "Alt Origin", distance_m: 180 }
      ])
      .mockResolvedValueOnce([{ id: 3, name: "Destination Stop", distance_m: 160 }]);

    const stopsById = new Map([
      [1, { id: 1, name: "Origin Stop", latitude: 14.1, longitude: 121.1 }],
      [2, { id: 2, name: "Mid A", latitude: 14.11, longitude: 121.12 }],
      [3, { id: 3, name: "Destination Stop", latitude: 14.12, longitude: 121.13 }],
      [5, { id: 5, name: "Alt Origin", latitude: 14.09, longitude: 121.09 }],
      [6, { id: 6, name: "Mid B", latitude: 14.105, longitude: 121.1 }]
    ]);

    const adjacency = new Map([
      [1, [
        { fromStopId: 1, toStopId: 2, routeId: 10, routeType: "jeep", signboard: "Cubao-Divisoria" },
        { fromStopId: 1, toStopId: 6, routeId: 20, routeType: "bus", signboard: "Ortigas-Recto" }
      ]],
      [2, [
        { fromStopId: 2, toStopId: 3, routeId: 10, routeType: "jeep", signboard: "Cubao-Divisoria" }
      ]],
      [6, [
        { fromStopId: 6, toStopId: 3, routeId: 20, routeType: "bus", signboard: "Ortigas-Recto" }
      ]],
      [5, [
        { fromStopId: 5, toStopId: 6, routeId: 30, routeType: "jeep", signboard: "Marikina-Cubao" }
      ]],
      [3, []]
    ]);

    getTransitGraph.mockResolvedValue({ adjacency, stopsById });

    const result = await searchCommuteRoutes({
      originText: "UP Diliman",
      destinationText: "Cubao",
      originCoords: { latitude: 14.65, longitude: 121.07 },
      destinationCoords: { latitude: 14.62, longitude: 121.05 }
    });

    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.routes.some((route) => route.type === "fastest")).toBe(true);

    const first = result.routes[0];
    expect(first.steps.some((step) => step.mode === "jeep" || step.mode === "bus")).toBe(true);
    expect(first.steps.some((step) => (step.instruction || "").includes("signboard"))).toBe(true);
    expect(first.estimatedMinutes).toBeGreaterThan(0);
    expect(first.estimatedFare).toBeGreaterThan(0);
  });
});
