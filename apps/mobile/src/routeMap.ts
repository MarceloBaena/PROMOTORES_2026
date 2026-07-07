export interface RouteMapPromoterLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt?: string | null;
}

export interface RouteMapPoint {
  routeItemId: string;
  clientId: string;
  sequence: number;
  clientName: string;
  address: string;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
}

interface RouteMapHtmlInput {
  points: RouteMapPoint[];
  selectedRouteItemId?: string | null;
  promoterLocation?: RouteMapPromoterLocation | null;
}

const DEFAULT_CENTER = {
  latitude: -15.6014,
  longitude: -56.0979
};

export function toCoordinateNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

export function hasRouteMapCoordinates(point: Pick<RouteMapPoint, "latitude" | "longitude">) {
  return typeof point.latitude === "number" && Number.isFinite(point.latitude) && typeof point.longitude === "number" && Number.isFinite(point.longitude);
}

export function haversineDistanceKm(
  origin: Pick<RouteMapPromoterLocation, "latitude" | "longitude">,
  destination: Pick<RouteMapPoint, "latitude" | "longitude">
) {
  if (!hasRouteMapCoordinates(destination)) {
    return null;
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians((destination.latitude ?? 0) - origin.latitude);
  const dLon = toRadians((destination.longitude ?? 0) - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude ?? 0);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function formatDistanceLabel(distanceKm: number | null) {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return "Distancia indisponivel";
  }

  if (distanceKm < 1) {
    return `${Math.max(50, Math.round(distanceKm * 1000))} m`;
  }

  return `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km`;
}

export function routeMapStatusLabel(status: string) {
  if (status === "completed") {
    return "Concluido";
  }

  if (status === "in_progress") {
    return "Em atendimento";
  }

  if (status === "skipped") {
    return "Pulado";
  }

  if (status === "not_completed") {
    return "Nao concluido";
  }

  if (status === "canceled") {
    return "Cancelado";
  }

  return "Pendente";
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function createRouteMapHtml(input: RouteMapHtmlInput) {
  const mappedPoints = input.points.filter(hasRouteMapCoordinates);
  const payload = safeJson({
    points: mappedPoints,
    selectedRouteItemId: input.selectedRouteItemId ?? null,
    promoterLocation: input.promoterLocation ?? null,
    defaultCenter: DEFAULT_CENTER
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #dbeafe; font-family: Arial, sans-serif; }
      body {
        background:
          radial-gradient(circle at 18% 18%, rgba(37, 99, 235, 0.14), transparent 24rem),
          radial-gradient(circle at 80% 72%, rgba(16, 185, 129, 0.12), transparent 26rem),
          #eaf2ff;
      }
      #map { position: absolute; inset: 0; }
      .leaflet-container { background: #dbeafe; }
      .route-seq-tooltip {
        background: transparent;
        border: 0;
        box-shadow: none;
        color: #ffffff;
        font-size: 11px;
        font-weight: 900;
        margin-top: 0;
        text-align: center;
      }
      .leaflet-popup-content-wrapper {
        border-radius: 16px;
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
      }
      .leaflet-popup-content {
        margin: 12px 14px;
        min-width: 180px;
      }
      .popup-kicker {
        color: #2563eb;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .popup-title {
        color: #0f172a;
        font-size: 15px;
        font-weight: 900;
        margin-top: 4px;
      }
      .popup-subtitle {
        color: #475569;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        margin-top: 4px;
      }
      .map-overlay {
        position: absolute;
        top: 14px;
        left: 14px;
        z-index: 999;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(255,255,255,0.8);
        border-radius: 18px;
        padding: 12px 14px;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
        backdrop-filter: blur(10px);
      }
      .map-overlay-title {
        color: #64748b;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .map-overlay-value {
        color: #0f172a;
        font-size: 14px;
        font-weight: 900;
        margin-top: 4px;
      }
      .map-footer {
        position: absolute;
        left: 14px;
        right: 14px;
        bottom: 14px;
        z-index: 999;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        pointer-events: none;
      }
      .map-chip {
        background: rgba(15, 23, 42, 0.9);
        color: #ffffff;
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.06em;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.24);
      }
      .map-chip.light {
        background: rgba(255,255,255,0.92);
        color: #0f172a;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div class="map-overlay">
      <div class="map-overlay-title">Mapa do roteiro</div>
      <div class="map-overlay-value">${mappedPoints.length} cliente(s) com coordenada</div>
    </div>
    <div class="map-footer">
      <div class="map-chip">Vista operacional estilo rota</div>
      <div class="map-chip light">Toque no ponto para selecionar</div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const payload = ${payload};
      const map = L.map("map", {
        zoomControl: false,
        preferCanvas: true
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19
      }).addTo(map);

      const routePoints = payload.points || [];
      const markersByRouteItem = {};
      let selectedRouteItemId = payload.selectedRouteItemId || null;

      function markerStyle(selected) {
        return {
          radius: selected ? 14 : 11,
          color: selected ? "#0f172a" : "#ffffff",
          weight: selected ? 4 : 3,
          fillColor: selected ? "#2563eb" : "#f59e0b",
          fillOpacity: 1
        };
      }

      function popupHtml(point) {
        const address = [point.address, [point.city, point.state].filter(Boolean).join("/")].filter(Boolean).join(" - ");
        return [
          '<div class="popup-kicker">Cliente #' + point.sequence + "</div>",
          '<div class="popup-title">' + point.clientName + "</div>",
          address ? '<div class="popup-subtitle">' + address + "</div>" : ""
        ].join("");
      }

      function focusRouteItem(routeItemId, shouldFly) {
        selectedRouteItemId = routeItemId || null;

        Object.keys(markersByRouteItem).forEach((key) => {
          const marker = markersByRouteItem[key];
          marker.setStyle(markerStyle(key === selectedRouteItemId));
        });

        if (!routeItemId || !markersByRouteItem[routeItemId]) {
          return;
        }

        const marker = markersByRouteItem[routeItemId];
        if (shouldFly !== false) {
          map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
        }
        marker.openPopup();
      }

      routePoints.forEach((point) => {
        const marker = L.circleMarker([point.latitude, point.longitude], markerStyle(point.routeItemId === selectedRouteItemId)).addTo(map);
        marker.bindPopup(popupHtml(point));
        marker.bindTooltip(String(point.sequence), {
          permanent: true,
          direction: "center",
          className: "route-seq-tooltip"
        });
        marker.on("click", () => {
          focusRouteItem(point.routeItemId, false);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: "select-route-item",
              routeItemId: point.routeItemId
            }));
          }
        });
        markersByRouteItem[point.routeItemId] = marker;
      });

      if (routePoints.length >= 2) {
        L.polyline(
          routePoints.map((point) => [point.latitude, point.longitude]),
          {
            color: "#ffffff",
            weight: 10,
            opacity: 0.92,
            lineCap: "round",
            lineJoin: "round"
          }
        ).addTo(map);

        L.polyline(
          routePoints.map((point) => [point.latitude, point.longitude]),
          {
            color: "#2563eb",
            weight: 4,
            opacity: 0.98,
            lineCap: "round",
            lineJoin: "round"
          }
        ).addTo(map);
      }

      if (payload.promoterLocation && Number.isFinite(payload.promoterLocation.latitude) && Number.isFinite(payload.promoterLocation.longitude)) {
        const promoterCircle = L.circleMarker(
          [payload.promoterLocation.latitude, payload.promoterLocation.longitude],
          {
            radius: 10,
            color: "#ffffff",
            weight: 3,
            fillColor: "#10b981",
            fillOpacity: 1
          }
        ).addTo(map);

        promoterCircle.bindPopup(
          '<div class="popup-kicker">Minha posicao</div><div class="popup-title">Promotor no aparelho</div><div class="popup-subtitle">Atualize a localizacao quando precisar recalcular o deslocamento.</div>'
        );
      }

      const boundsPoints = routePoints.map((point) => [point.latitude, point.longitude]);
      if (payload.promoterLocation && Number.isFinite(payload.promoterLocation.latitude) && Number.isFinite(payload.promoterLocation.longitude)) {
        boundsPoints.push([payload.promoterLocation.latitude, payload.promoterLocation.longitude]);
      }

      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 15);
      } else if (boundsPoints.length > 1) {
        map.fitBounds(boundsPoints, { padding: [40, 40], maxZoom: 16 });
      } else {
        map.setView([payload.defaultCenter.latitude, payload.defaultCenter.longitude], 12);
      }

      window.setSelectedRouteItem = function(routeItemId) {
        focusRouteItem(routeItemId, true);
      };

      if (selectedRouteItemId) {
        setTimeout(() => focusRouteItem(selectedRouteItemId, false), 180);
      }
    </script>
  </body>
</html>`;
}
