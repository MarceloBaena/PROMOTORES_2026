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
    throw new Error(message || `Location heartbeat failed with HTTP ${response.status}.`);
  }

  return response.json() as Promise<LocationHeartbeatResponse>;
}
