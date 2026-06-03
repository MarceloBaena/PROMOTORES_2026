import { describe, expect, it } from 'vitest';
import { calculateDistanceInMeters, isInsideGeofence } from './utils';

describe('geo helpers', () => {
  it('calcula distancia entre coordenadas', () => {
    const distance = calculateDistanceInMeters(
      { latitude: -16.4706, longitude: -54.6355 },
      { latitude: -16.4682, longitude: -54.6384 },
    );

    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(500);
  });

  it('valida se ponto esta dentro da geofence', () => {
    expect(
      isInsideGeofence(
        { latitude: -16.4706, longitude: -54.6355 },
        { latitude: -16.4705, longitude: -54.6354, radiusInMeters: 150 },
      ),
    ).toBe(true);
  });
});
