import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const ROUTE_SOURCE_ID = "route-source";
const ROUTE_LAYER_ID = "route-layer";
const POINT_SOURCE_ID = "route-points-source";
const POINT_LAYER_ID = "route-points-layer";
const POINT_LABEL_LAYER_ID = "route-points-label-layer";

const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
    }
  },
  layers: [
    {
      id: "osm-base",
      type: "raster",
      source: "osm"
    }
  ]
};

export default function MapView({ activeRoute }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let loadWatchdog;
    let handleResize;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_RASTER_STYLE,
        center: [121.0437, 14.5995],
        zoom: 11
      });

      mapRef.current = map;

      map.on("error", (event) => {
        if (!map.loaded()) {
          console.warn("Map initialization warning:", event?.error || event);
        }
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        try {
          setMapReady(true);
          setMapError("");

          if (!map.getSource(ROUTE_SOURCE_ID)) {
            map.addSource(ROUTE_SOURCE_ID, {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: []
              }
            });
          }

          if (!map.getLayer(ROUTE_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              paint: {
                "line-color": [
                  "match",
                  ["get", "mode"],
                  "walk",
                  "#64748b",
                  "jeep",
                  "#16a34a",
                  "bus",
                  "#0284c7",
                  "uv",
                  "#7c3aed",
                  "train",
                  "#dc2626",
                  "#0ea5e9"
                ],
                "line-width": 5,
                "line-opacity": 0.9
              }
            });
          }

          if (!map.getSource(POINT_SOURCE_ID)) {
            map.addSource(POINT_SOURCE_ID, {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: []
              }
            });
          }

          if (!map.getLayer(POINT_LAYER_ID)) {
            map.addLayer({
              id: POINT_LAYER_ID,
              type: "circle",
              source: POINT_SOURCE_ID,
              paint: {
                "circle-radius": [
                  "match",
                  ["get", "kind"],
                  "start",
                  8,
                  "end",
                  8,
                  "ride_start",
                  7,
                  "ride_end",
                  7,
                  "transfer",
                  6,
                  5
                ],
                "circle-color": [
                  "match",
                  ["get", "kind"],
                  "start",
                  "#16a34a",
                  "end",
                  "#dc2626",
                  "ride_start",
                  "#2563eb",
                  "ride_end",
                  "#7c3aed",
                  "transfer",
                  "#f59e0b",
                  "#0f172a"
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff"
              }
            });
          }

          if (!map.getLayer(POINT_LABEL_LAYER_ID)) {
            map.addLayer({
              id: POINT_LABEL_LAYER_ID,
              type: "symbol",
              source: POINT_SOURCE_ID,
              layout: {
                "text-field": ["get", "label"],
                "text-size": 11,
                "text-offset": [0, 1.2],
                "text-anchor": "top"
              },
              paint: {
                "text-color": "#0f172a",
                "text-halo-color": "#ffffff",
                "text-halo-width": 1.2
              }
            });
          }

          map.on("mouseenter", POINT_LAYER_ID, () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", POINT_LAYER_ID, () => {
            map.getCanvas().style.cursor = "";
          });

          map.on("click", POINT_LAYER_ID, (event) => {
            const feature = event.features?.[0];
            if (!feature || !feature.geometry || feature.geometry.type !== "Point") {
              return;
            }

            const coordinates = feature.geometry.coordinates.slice();
            const label = feature.properties?.label || "Stop";
            const instruction = feature.properties?.instruction || "";

            if (popupRef.current) {
              popupRef.current.remove();
            }

            popupRef.current = new maplibregl.Popup({ offset: 16 })
              .setLngLat(coordinates)
              .setHTML(`<div style="font-size:12px;line-height:1.4"><strong>${label}</strong><br/>${instruction}</div>`)
              .addTo(map);
          });

          map.resize();
        } catch {
          setMapError("Nagka-problema sa map setup. Paki-refresh ang page.");
        }
      });

      loadWatchdog = window.setTimeout(() => {
        if (!map.loaded()) {
          setMapError("Hindi nag-initialize ang map view. Check internet, disable strict blockers, then refresh.");
        }
      }, 10000);

      handleResize = () => mapRef.current?.resize();
      window.addEventListener("resize", handleResize);
    } catch {
      setMapError("Hindi ma-initialize ang map sa browser na ito. Pwede ka pa rin mag-search ng route gamit ang cards.");
    }

    return () => {
      if (loadWatchdog) {
        window.clearTimeout(loadWatchdog);
      }
      if (handleResize) {
        window.removeEventListener("resize", handleResize);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const coordinates = activeRoute?.pathCoordinates || [];
    const backendSegments = activeRoute?.mapSegments || [];
    const backendMarkers = activeRoute?.mapMarkers || [];
    const source = map.getSource(ROUTE_SOURCE_ID);
    const pointSource = map.getSource(POINT_SOURCE_ID);

    if (!source || !pointSource) {
      return;
    }

    const routeFeatures = backendSegments.length
      ? backendSegments.map((segment, index) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: segment.coordinates
          },
          properties: {
            mode: segment.mode,
            signboard: segment.signboard,
            segmentIndex: index + 1
          }
        }))
      : coordinates.length
        ? [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates
              },
              properties: {
                mode: "jeep"
              }
            }
          ]
        : [];

    source.setData({
      type: "FeatureCollection",
      features: routeFeatures
    });

    if (coordinates.length > 1) {
      const bounds = coordinates.reduce(
        (acc, coord) => acc.extend(coord),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
    }

    const pointFeatures = backendMarkers.length
      ? backendMarkers.map((marker) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: marker.coordinates
          },
          properties: {
            kind: marker.kind,
            label: marker.stop ? `${marker.label}: ${marker.stop}` : marker.label,
            instruction: marker.instruction || ""
          }
        }))
      : [];

    pointSource.setData({
      type: "FeatureCollection",
      features: pointFeatures
    });
  }, [activeRoute, mapReady]);

  return (
    <div className="relative h-[380px] w-full overflow-hidden rounded-2xl shadow-card">
      <div ref={containerRef} className="h-full w-full" />
      {activeRoute ? (
        <div className="absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-xs text-ink shadow">
          <p className="font-semibold">Map Guide</p>
          <p><span className="font-semibold text-green-700">Start</span> - where to begin</p>
          <p><span className="font-semibold text-blue-700">Ride</span> - sakayan point</p>
          <p><span className="font-semibold text-violet-700">Get off</span> - babaan point</p>
          <p><span className="font-semibold text-amber-600">Transfer</span> - possible switch point</p>
          <p><span className="font-semibold text-red-700">End</span> - drop-off near destination</p>
          <p className="mt-1 text-ink/70">Colored lines show mode per segment (jeep, bus, uv, train).</p>
        </div>
      ) : (
        <div className="absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-xs text-ink/80 shadow">
          Search a route to see ride and transfer indicators on the map.
        </div>
      )}
      {mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-4 text-center text-sm text-ink/80">
          {mapError}
        </div>
      ) : null}
      {!mapReady && !mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-4 text-center text-sm text-ink/70">
          Loading map...
        </div>
      ) : null}
    </div>
  );
}
