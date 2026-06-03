import type { Coordinates } from './types';

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const calculateDistanceInMeters = (origin: Coordinates, target: Coordinates) => {
  const dLatitude = toRadians(target.latitude - origin.latitude);
  const dLongitude = toRadians(target.longitude - origin.longitude);
  const latitude1 = toRadians(origin.latitude);
  const latitude2 = toRadians(target.latitude);

  const a =
    Math.sin(dLatitude / 2) * Math.sin(dLatitude / 2) +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLongitude / 2) * Math.sin(dLongitude / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

export const isInsideGeofence = (
  current: Coordinates,
  geofence: { latitude: number; longitude: number; radiusInMeters: number },
) =>
  calculateDistanceInMeters(current, {
    latitude: geofence.latitude,
    longitude: geofence.longitude,
  }) <= geofence.radiusInMeters;
