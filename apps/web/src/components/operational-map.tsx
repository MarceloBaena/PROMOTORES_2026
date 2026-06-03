'use client';

import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import type { PromoterOperationalStatus, VisitProgressStatus } from '@promotor/types';
import type { OperationalMapResponse } from '@/lib/types';

const promoterColorByStatus: Record<PromoterOperationalStatus, string> = {
  ON_ROUTE: '#2f8f6f',
  DELAYED: '#d07d2b',
  READY: '#36596d',
  IDLE: '#c45345',
};

const stopColorByStatus: Record<VisitProgressStatus, string> = {
  PLANNED: '#36596d',
  IN_PROGRESS: '#d07d2b',
  SYNC_PENDING: '#d07d2b',
  COMPLETED: '#2f8f6f',
  PARTIAL: '#d07d2b',
  NOT_DONE: '#c45345',
  CHECKED_OUT: '#2f8f6f',
};

const buildPromoterIcon = (status: PromoterOperationalStatus) =>
  L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:999px;background:${promoterColorByStatus[status] ?? '#36596d'};border:3px solid rgba(255,255,255,0.95);box-shadow:0 10px 24px rgba(20,34,45,0.25);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

interface OperationalMapProps {
  data: OperationalMapResponse;
}

export const OperationalMap = ({ data }: OperationalMapProps) => {
  const fallback = [-16.4706, -54.6355] as [number, number];
  const firstPromoter = data.promoters[0];
  const center =
    firstPromoter !== undefined
      ? ([firstPromoter.latitude, firstPromoter.longitude] as [number, number])
      : fallback;

  return (
    <div className="map-frame map-frame-large">
      <MapContainer center={center} zoom={12} className="map-canvas map-canvas-large">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {data.routeCustomers.map((stop) => (
          <CircleMarker
            key={stop.routeStopId}
            center={[stop.latitude, stop.longitude]}
            color={stopColorByStatus[stop.status] ?? '#36596d'}
            fillColor={stopColorByStatus[stop.status] ?? '#36596d'}
            fillOpacity={0.65}
            radius={7}
            weight={2}
          >
            <Popup>
              <strong>{stop.customerName}</strong>
              <br />
              {stop.promoterName}
              <br />
              Status: {stop.status}
              <br />
              Sequencia: {stop.sequence}
            </Popup>
          </CircleMarker>
        ))}

        {data.promoters.map((promoter) => (
          <Marker
            key={promoter.promoterId}
            icon={buildPromoterIcon(promoter.status)}
            position={[promoter.latitude, promoter.longitude]}
          >
            <Popup>
              <strong>{promoter.promoterName}</strong>
              <br />
              Status: {promoter.status}
              <br />
              Cliente atual: {promoter.currentCustomerName ?? 'Nenhum'}
              <br />
              Proximo: {promoter.nextCustomerName ?? 'Nenhum'}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
