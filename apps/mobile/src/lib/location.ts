import * as Location from 'expo-location';
import type { Coordinates } from '@promotor/types';
import type { PhotoGpsStatus } from './types';

type LocationFailureCode =
  | 'PERMISSION_DENIED'
  | 'SERVICES_DISABLED'
  | 'POSITION_UNAVAILABLE';

type OptionalLocationResult =
  | {
      status: Extract<PhotoGpsStatus, 'CAPTURED'>;
      location: Coordinates;
      accuracyM?: number;
      capturedAt: string;
    }
  | {
      status: Exclude<PhotoGpsStatus, 'CAPTURED'>;
      errorCode: LocationFailureCode;
      message: string;
      capturedAt: string;
    };

const buildLocationFailure = (
  status: Exclude<PhotoGpsStatus, 'CAPTURED'>,
  errorCode: LocationFailureCode,
  message: string,
): OptionalLocationResult => ({
  status,
  errorCode,
  message,
  capturedAt: new Date().toISOString(),
});

const requestForegroundPermission = async () => {
  const currentPermission = await Location.getForegroundPermissionsAsync();

  if (currentPermission.status === Location.PermissionStatus.GRANTED) {
    return currentPermission.status;
  }

  if (currentPermission.status === Location.PermissionStatus.DENIED) {
    return currentPermission.status;
  }

  const requestedPermission = await Location.requestForegroundPermissionsAsync();
  return requestedPermission.status;
};

const getPositionWithFallback = async () => {
  const lastKnown = await Location.getLastKnownPositionAsync();

  if (lastKnown) {
    return lastKnown;
  }

  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  });
};

export const captureOptionalLocation = async (): Promise<OptionalLocationResult> => {
  const permissionStatus = await requestForegroundPermission();

  if (permissionStatus !== Location.PermissionStatus.GRANTED) {
    return buildLocationFailure(
      'PERMISSION_DENIED',
      'PERMISSION_DENIED',
      'Permissao de localizacao negada no aparelho.',
    );
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();

  if (!servicesEnabled) {
    return buildLocationFailure(
      'UNAVAILABLE',
      'SERVICES_DISABLED',
      'GPS ou servico de localizacao indisponivel no aparelho.',
    );
  }

  try {
    const position = await getPositionWithFallback();

    return {
      status: 'CAPTURED',
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      accuracyM: position.coords.accuracy ?? undefined,
      capturedAt: new Date(position.timestamp).toISOString(),
    };
  } catch {
    return buildLocationFailure(
      'UNAVAILABLE',
      'POSITION_UNAVAILABLE',
      'Nao foi possivel obter a posicao atual do aparelho.',
    );
  }
};

export const requestLocationPermissions = async () => {
  const permissionStatus = await requestForegroundPermission();

  if (permissionStatus !== Location.PermissionStatus.GRANTED) {
    throw new Error('Permissao de localizacao negada no aparelho.');
  }
};

export const getCurrentCoordinates = async (): Promise<Coordinates> => {
  const result = await captureOptionalLocation();

  if (result.status !== 'CAPTURED') {
    throw new Error(result.message);
  }

  return result.location;
};

export const startActiveJourneyTracking = async (
  onPoint: (input: {
    capturedAt: string;
    location: Coordinates;
    accuracyM?: number;
  }) => void,
) => {
  await requestLocationPermissions();

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 120000,
      distanceInterval: 50,
    },
    (position) => {
      onPoint({
        capturedAt: new Date(position.timestamp).toISOString(),
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        accuracyM: position.coords.accuracy ?? undefined,
      });
    },
  );
};
