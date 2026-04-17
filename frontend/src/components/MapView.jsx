import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ROUTE_OPTION_META, getTrainLineTheme, getTransitTheme } from "../lib/transitTheme.js";

const ROUTE_SOURCE_ID = "route-source";
const ROUTE_CASING_LAYER_ID = "route-casing-layer";
const ROUTE_ALT_LAYER_ID = "route-alt-layer";
const ROUTE_PRIMARY_LAYER_ID = "route-primary-layer";
const ROUTE_DIRECTION_LAYER_ID = "route-direction-layer";
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

export default function MapView({ routes, selectedRouteType, onSelectRoute }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const onSelectRouteRef = useRef(onSelectRoute);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [showDirections, setShowDirections] = useState(false);

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

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

          if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_CASING_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              paint: {
                "line-color": "#ffffff",
                "line-opacity": ["case", ["get", "isPrimary"], 0.95, 0.6],
                "line-width": ["case", ["get", "isPrimary"], 9, 6]
              }
            });
          }

          if (!map.getLayer(ROUTE_ALT_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_ALT_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              filter: ["==", ["get", "isPrimary"], false],
              paint: {
                "line-color": ["coalesce", ["get", "transportColor"], "#06b6d4"],
                "line-width": 4,
                "line-opacity": 0.55,
                "line-dasharray": [2, 2]
              }
            });
          }

          if (!map.getLayer(ROUTE_PRIMARY_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_PRIMARY_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              filter: ["==", ["get", "isPrimary"], true],
              paint: {
                "line-color": ["coalesce", ["get", "transportColor"], "#06b6d4"],
                "line-width": 6,
                "line-opacity": 0.98
              }
            });
          }

          if (!map.getLayer(ROUTE_DIRECTION_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_DIRECTION_LAYER_ID,
              type: "symbol",
              source: ROUTE_SOURCE_ID,
              filter: ["==", ["get", "isPrimary"], true],
              layout: {
                "symbol-placement": "line",
                "symbol-spacing": 90,
                "text-field": ["coalesce", ["get", "directionGlyph"], ">"],
                "text-size": 11,
                "text-allow-overlap": true,
                "text-ignore-placement": true
              },
              paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#0f172a",
                "text-halo-width": 0.8,
                "text-opacity": 0.85
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

          const handleRouteClick = (event) => {
            const feature = event.features?.[0];
            const optionType = feature?.properties?.optionType;
            if (!optionType || !onSelectRouteRef.current) {
              return;
            }

            onSelectRouteRef.current(optionType);
          };

          map.on("click", ROUTE_ALT_LAYER_ID, handleRouteClick);
          map.on("click", ROUTE_PRIMARY_LAYER_ID, handleRouteClick);

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

    const selectedRoute = routes.find((route) => route.type === selectedRouteType) || routes[0];
    const selectedCoordinates = selectedRoute?.pathCoordinates || [];
    const backendMarkers = selectedRoute?.mapMarkers || [];
    const source = map.getSource(ROUTE_SOURCE_ID);
    const pointSource = map.getSource(POINT_SOURCE_ID);

    if (!source || !pointSource) {
      return;
    }

    const routeFeatures = routes.flatMap((route) => {
      const isPrimary = route.type === selectedRouteType;
      const segments = route?.mapSegments || [];

      if (segments.length > 0) {
        return segments
          .filter((segment) => segment.coordinates?.length > 1)
          .map((segment, index) => {
            const theme = getTransitTheme(segment.mode, segment.signboard);
            const lineTheme = segment.mode === "train" ? getTrainLineTheme(segment.signboard) : null;
            const directionGlyph = getDirectionGlyph(segment.mode, lineTheme?.lineCode);

            return {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: segment.coordinates
              },
              properties: {
                mode: segment.mode,
                signboard: segment.signboard,
                segmentIndex: index + 1,
                optionType: route.type,
                isPrimary,
                transportColor: theme.color,
                lineCode: lineTheme?.lineCode || segment.mode,
                directionGlyph
              }
            };
          });
      }

      const coordinates = route?.pathCoordinates || [];
      if (coordinates.length > 1) {
        return [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates
            },
            properties: {
              mode: "jeep",
              optionType: route.type,
              isPrimary,
              transportColor: getTransitTheme("jeep").color,
              lineCode: "jeep",
              directionGlyph: getDirectionGlyph("jeep")
            }
          }
        ];
      }

      return [];
    });

    source.setData({
      type: "FeatureCollection",
      features: routeFeatures
    });

    if (selectedCoordinates.length > 1) {
      const bounds = selectedCoordinates.reduce(
        (acc, coord) => acc.extend(coord),
        new maplibregl.LngLatBounds(selectedCoordinates[0], selectedCoordinates[0])
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 14 });
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
  }, [routes, selectedRouteType, mapReady]);

  const selectedRoute = routes.find((route) => route.type === selectedRouteType) || routes[0];
  const hasRoutes = routes.length > 0;

  return (
    <div className="surface-card relative h-[420px] w-full overflow-hidden rounded-[1.6rem] p-1.5">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowLegend((prev) => !prev)}
          className="rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow ring-1 ring-slate-200/80 backdrop-blur transition hover:bg-slate-100"
        >
          {showLegend ? "Hide legend" : "Show legend"}
        </button>

        {hasRoutes && selectedRoute?.mapSegments?.length ? (
          <button
            type="button"
            onClick={() => setShowDirections((prev) => !prev)}
            className="rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow ring-1 ring-slate-200/80 backdrop-blur transition hover:bg-slate-100"
          >
            {showDirections ? "Hide directions" : "Show directions"}
          </button>
        ) : null}
      </div>

      {showLegend ? (
        <div className="absolute left-4 top-14 z-10 max-w-[min(16.5rem,calc(100%-2rem))] rounded-2xl bg-white/95 p-3 text-xs shadow-xl ring-1 ring-slate-200/70 backdrop-blur">
          {hasRoutes ? (
            <>
              <p className="font-bold text-slate-900">Transit Legend</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <LegendDot label="Walk" color={getTransitTheme("walk").color} />
                <LegendDot label="Jeepney" color={getTransitTheme("jeep").color} />
                <LegendDot label="Bus" color={getTransitTheme("bus").color} />
                <LegendDot label="UV" color={getTransitTheme("uv").color} />
                <LegendDot label="MRT-3" color={getTrainLineTheme("MRT-3").color} />
                <LegendDot label="LRT-1" color={getTrainLineTheme("LRT-1").color} />
                <LegendDot label="LRT-2" color={getTrainLineTheme("LRT-2").color} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Solid = selected route, dashed = alternatives.</p>
            </>
          ) : (
            <p className="text-[11px] text-slate-600">Search a route to view transit options and map legends.</p>
          )}
        </div>
      ) : null}

      {hasRoutes ? (
        <div className="absolute right-4 top-4 flex max-w-[70%] flex-wrap justify-end gap-2">
          {routes.map((route) => {
            const option = ROUTE_OPTION_META[route.type];
            const active = route.type === selectedRoute?.type;

            return (
              <button
                key={route.type}
                type="button"
                onClick={() => onSelectRoute(route.type)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {option?.label || route.type}
              </button>
            );
          })}
        </div>
      ) : null}

      {showDirections && hasRoutes && selectedRoute?.mapSegments?.length ? (
        <div className="absolute bottom-4 right-4 z-10 max-h-[34%] w-[min(22rem,calc(100%-2rem))] overflow-y-auto rounded-2xl bg-white/95 p-3 text-xs shadow-xl ring-1 ring-slate-200/70 backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-slate-500">Direction by Segment</p>
          <ul className="mt-2 space-y-1.5">
            {selectedRoute.mapSegments.map((segment) => {
              const theme = getTransitTheme(segment.mode, segment.signboard);
              const lineTheme = segment.mode === "train" ? getTrainLineTheme(segment.signboard) : null;

              return (
                <li key={`${selectedRoute.type}-${segment.segmentIndex}`} className="rounded-xl border border-slate-100 bg-white p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500">Direction: {segment.from} -&gt; {segment.to}</p>
                  <div className="mt-1 inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${theme.color}22`, color: theme.color }}>
                    <span className="font-mono">{getDirectionGlyph(segment.mode, lineTheme?.lineCode)}</span>
                    <span>{theme.label}</span>
                    {segment.signboard ? <span className="text-slate-600">{segment.signboard}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-4 text-center text-sm text-slate-700">
          {mapError}
        </div>
      ) : null}
      {!mapReady && !mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-4 text-center text-sm text-slate-600">
          Loading map...
        </div>
      ) : null}
    </div>
  );
}

function LegendDot({ label, color }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

function getDirectionGlyph(mode, lineCode = "") {
  if (mode === "train") {
    if (lineCode === "mrt3") {
      return "M3>";
    }
    if (lineCode === "lrt1") {
      return "L1>";
    }
    if (lineCode === "lrt2") {
      return "L2>";
    }
    return "TR>";
  }

  if (mode === "bus") {
    return "B>";
  }

  if (mode === "jeep") {
    return "J>";
  }

  if (mode === "uv") {
    return "U>";
  }

  return "W>";
}
