import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/geocodingService.js", () => ({
  geocodePlace: vi.fn()
}));

vi.mock("../src/services/routingService.js", () => ({
  searchCommuteRoutes: vi.fn()
}));

import { geocodePlace } from "../src/services/geocodingService.js";
import { searchCommuteRoutes } from "../src/services/routingService.js";
import { app } from "../src/app.js";

describe("API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /health returns service health", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("GET /api/train-info returns static train schedule info", async () => {
    const response = await request(app).get("/api/train-info");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.lines)).toBe(true);
    expect(response.body.lines.length).toBe(3);
  });

  it("GET /api/search-route returns route payload shape", async () => {
    geocodePlace
      .mockResolvedValueOnce({ latitude: 14.6031, longitude: 120.9851, source: "cache" })
      .mockResolvedValueOnce({ latitude: 14.619, longitude: 121.0537, source: "nominatim" });

    searchCommuteRoutes.mockResolvedValue({
      routes: [
        {
          type: "fastest",
          estimatedMinutes: 35,
          estimatedFare: 13,
          transfers: 0,
          steps: [
            {
              mode: "jeep",
              signboard: "Cubao-Divisoria",
              instruction: "Sakay ng jeep na may signboard na Cubao-Divisoria"
            }
          ],
          pathCoordinates: [
            [120.9851, 14.6031],
            [121.0537, 14.619]
          ]
        }
      ]
    });

    const response = await request(app)
      .get("/api/search-route")
      .query({ origin: "Recto Manila", destination: "Cubao QC" });

    expect(response.status).toBe(200);
    expect(response.body.origin.text).toBe("Recto Manila");
    expect(response.body.destination.text).toBe("Cubao QC");
    expect(Array.isArray(response.body.routes)).toBe(true);
    expect(response.body.routes[0].steps[0].signboard).toBe("Cubao-Divisoria");
  });
});
