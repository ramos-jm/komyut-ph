import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const ROUTE_SOURCE_ID = "route-source";
const ROUTE_LAYER_ID = "route-layer";

export default function MapView({ activeRoute }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [121.0437, 14.5995],
      zoom: 11
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current.on("load", () => {
      mapRef.current.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      mapRef.current.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 5,
          "line-opacity": 0.9
        }
      });
    });

    return () => mapRef.current?.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const coordinates = activeRoute?.pathCoordinates || [];
    const source = map.getSource(ROUTE_SOURCE_ID);

    if (!source) {
      return;
    }

    source.setData({
      type: "FeatureCollection",
      features: coordinates.length
        ? [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates
              },
              properties: {}
            }
          ]
        : []
    });

    if (coordinates.length > 1) {
      const bounds = coordinates.reduce(
        (acc, coord) => acc.extend(coord),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
    }
  }, [activeRoute]);

  return <div ref={containerRef} className="h-[380px] w-full overflow-hidden rounded-2xl shadow-card" />;
}
