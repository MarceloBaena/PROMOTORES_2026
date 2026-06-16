interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

interface SendLocationHeartbeatInput {
  apiBaseUrl: string;
  accessToken: string;
  visitId?: string;
  coordinates: Coordinates;
  capturedAt?: Date;
}

interface LocationHeartbeatResponse {
  data: {
    id: string;
    promoterId: string;
    visitId: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    capturedAt: string;
    receivedAt: string;
  };
}

interface LocationTrackerOptions {
  apiBaseUrl: string;
  getAccessToken: () => string | null | Promise<string | null>;
  getVisitId?: () => string | undefined | Promise<string | undefined>;
  getCoordinates: () => Coordinates | null | Promise<Coordinates | null>;
  isOperationallyActive?: () => boolean | Promise<boolean>;
  intervalMs?: number;
  onError?: (error: Error) => void;
  onSuccess?: (response: LocationHeartbeatResponse) => void;
}

export async function sendLocationHeartbeat(input: SendLocationHeartbeatInput) {
  const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/locations/heartbeat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      latitude: input.coordinates.latitude,
      longitude: input.coordinates.longitude,
      accuracyMeters: input.coordinates.accuracyMeters,
      capturedAt: (input.capturedAt ?? new Date()).toISOString(),
      visitId: input.visitId
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Envio de localizacao falhou com HTTP ${response.status}.`);
  }

  return response.json() as Promise<LocationHeartbeatResponse>;
}

export function createForegroundLocationTracker(options: LocationTrackerOptions) {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function sendNow() {
    const operationallyActive = options.isOperationallyActive ? await options.isOperationallyActive() : true;

    if (!operationallyActive) {
      return null;
    }

    const [accessToken, visitId, coordinates] = await Promise.all([
      options.getAccessToken(),
      options.getVisitId?.(),
      options.getCoordinates()
    ]);

    if (!accessToken || !coordinates) {
      return null;
    }

    try {
      const response = await sendLocationHeartbeat({
        apiBaseUrl: options.apiBaseUrl,
        accessToken,
        visitId,
        coordinates,
        capturedAt: new Date()
      });

      options.onSuccess?.(response);
      return response;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Envio de localizacao falhou.");
      options.onError?.(normalizedError);
      return null;
    }
  }

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      void sendNow();
      intervalId = setInterval(() => void sendNow(), options.intervalMs ?? 30000);
    },
    stop() {
      running = false;

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    sendNow,
    isRunning() {
      return running;
    }
  };
}
