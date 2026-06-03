import type { Coordinates } from '@promotor/types';

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 20_000,
};

const GEOLOCATION_PERMISSION_REQUIRED_MESSAGE =
  'Permissao de localizacao necessaria para confirmar o check-in.';

export const getGeolocationErrorMessage = (error: GeolocationPositionError | null) => {
  if (!error) {
    return GEOLOCATION_PERMISSION_REQUIRED_MESSAGE;
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return GEOLOCATION_PERMISSION_REQUIRED_MESSAGE;
    case error.POSITION_UNAVAILABLE:
      return 'Nao foi possivel obter a localizacao agora. Tente novamente para confirmar o check-in.';
    case error.TIMEOUT:
      return 'A localizacao demorou demais para responder. Tente novamente para confirmar o check-in.';
    default:
      return error.message || GEOLOCATION_PERMISSION_REQUIRED_MESSAGE;
  }
};

export const getBrowserCoordinates = () =>
  new Promise<Coordinates>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error(GEOLOCATION_PERMISSION_REQUIRED_MESSAGE));
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    ) {
      reject(
        new Error(
          `${GEOLOCATION_PERMISSION_REQUIRED_MESSAGE} Em tablets e celulares, abra o sistema por uma conexao segura para liberar a localizacao.`,
        ),
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(getGeolocationErrorMessage(error)));
      },
      GEOLOCATION_OPTIONS,
    );
  });

export const watchBrowserLocation = (
  onPosition: (payload: { location: Coordinates; accuracyM?: number }) => void,
  onError: (message: string) => void,
) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('Geolocalizacao indisponivel neste navegador.');
    return () => undefined;
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onPosition({
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        accuracyM: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : undefined,
      });
    },
    (error) => {
      onError(getGeolocationErrorMessage(error));
    },
    GEOLOCATION_OPTIONS,
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
};
