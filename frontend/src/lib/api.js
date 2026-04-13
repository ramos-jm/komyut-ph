const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const LOCAL_CACHE_KEY = "phcg:lastSearch";

async function parseErrorMessage(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return payload?.error?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function searchRoute(origin, destination) {
  const url = new URL(`${API_BASE_URL}/search-route`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const message = await parseErrorMessage(response, "Route search failed");
      throw new Error(message);
    }
    const data = await response.json();
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (error) {
    const fallback = localStorage.getItem(LOCAL_CACHE_KEY);
    if (fallback) {
      return JSON.parse(fallback);
    }

    if (error instanceof TypeError) {
      throw new Error("Hindi maabot ang backend API. Check mo kung tama ang VITE_API_BASE_URL at live ang server.");
    }

    throw error;
  }
}

export async function fetchTrainInfo() {
  const response = await fetch(`${API_BASE_URL}/train-info`);
  if (!response.ok) {
    throw new Error("Failed to load train info");
  }
  return response.json();
}

export async function saveRoute(payload) {
  const response = await fetch(`${API_BASE_URL}/save-route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Save route failed");
  }

  return response.json();
}

export async function getSavedRoutes() {
  const response = await fetch(`${API_BASE_URL}/saved-routes`);
  if (!response.ok) {
    throw new Error("Cannot load saved routes");
  }
  return response.json();
}

export async function getNearbyStops(lat, lng, radius = 1000) {
  const url = new URL(`${API_BASE_URL}/stops/nearby`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("radius", String(radius));

  const response = await fetch(url.toString());
  if (!response.ok) {
    const message = await parseErrorMessage(response, "Failed to load nearby stops");
    throw new Error(message);
  }

  return response.json();
}

export async function searchStops(query) {
  const url = new URL(`${API_BASE_URL}/stops/search`);
  url.searchParams.set("q", query);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Failed to search stops");
  }

  return response.json();
}
