import { useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "./api";
import { useCompanyScope } from "../context/CompanyScopeContext";

export interface LivePromoter {
  promoter: {
    id: string;
    code: number;
    name: string;
    email: string;
    supervisorName?: string | null;
  };
  activeVisit?: {
    id: string;
    clientName: string;
    routeName?: string | null;
    startedAt?: string | null;
  } | null;
  activeRoute?: {
    id: string;
    name: string;
    scheduledDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    nextClientName?: string | null;
    pendingItems?: number | null;
  } | null;
  location?: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters?: number | null;
    capturedAt: string;
    receivedAt: string;
    source: string;
  } | null;
  trail?: Array<{
    latitude: number | null;
    longitude: number | null;
    accuracyMeters?: number | null;
    capturedAt: string;
  }>;
  status: "online" | "stale" | "offline";
}

export const LIVE_MAP_REFRESH_INTERVAL_MS = 10 * 1000;

export const liveStatusStyles = {
  online: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  stale: "bg-amber-50 text-amber-800 ring-amber-200",
  offline: "bg-stone-100 text-stone-600 ring-stone-200"
} as const;

export const liveStatusLabels = {
  online: "Conectado",
  stale: "Sem sinal recente",
  offline: "Desconectado"
} as const;

export function promoterCode(code: number) {
  return `PRO-${String(code).padStart(4, "0")}`;
}

export function formatLiveTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function minutesAgo(value?: string | null) {
  if (!value) {
    return "Sem sinal";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));

  if (diffMinutes < 1) {
    return "Agora";
  }

  if (diffMinutes === 1) {
    return "1 min atras";
  }

  return `${diffMinutes} min atras`;
}

export function statusPriority(status: LivePromoter["status"]) {
  switch (status) {
    case "online":
      return 0;
    case "stale":
      return 1;
    default:
      return 2;
  }
}

export function sortLivePromoters(items: LivePromoter[]) {
  return [...items].sort((left, right) => {
    const leftPriority = statusPriority(left.status);
    const rightPriority = statusPriority(right.status);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    if (left.activeVisit && !right.activeVisit) {
      return -1;
    }

    if (!left.activeVisit && right.activeVisit) {
      return 1;
    }

    if (left.activeRoute && !right.activeRoute) {
      return -1;
    }

    if (!left.activeRoute && right.activeRoute) {
      return 1;
    }

    return left.promoter.code - right.promoter.code;
  });
}

export function operationalLabel(item: LivePromoter) {
  if (item.activeVisit) {
    return `Em atendimento: ${item.activeVisit.clientName}`;
  }

  if (item.activeRoute) {
    const pendingItems = item.activeRoute.pendingItems ?? 0;
    return pendingItems > 0
      ? `Roteiro ativo: ${item.activeRoute.name} - ${pendingItems} cliente(s) pendente(s)`
      : `Roteiro ativo: ${item.activeRoute.name}`;
  }

  return "Sem jornada ativa no momento";
}

export function accuracyLabel(location?: LivePromoter["location"] | null) {
  if (!location || typeof location.accuracyMeters !== "number") {
    return "Precisao GPS nao informada";
  }

  return `Precisao GPS: ${Math.round(location.accuracyMeters)} m`;
}

export function mapsUrl(location: NonNullable<LivePromoter["location"]>) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  location?: T | null
): location is T & { latitude: number; longitude: number } {
  return typeof location?.latitude === "number" && typeof location?.longitude === "number";
}

export function useLivePromoters() {
  const { scopeKey } = useCompanyScope();
  const [items, setItems] = useState<LivePromoter[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  loadRef.current = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiJson<{ data: LivePromoter[] }>("/locations/live");
      setItems(sortLivePromoters(response.data));
      setLastRefresh(new Date());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel carregar o mapa.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRef.current();
    const intervalId = window.setInterval(() => void loadRef.current(), LIVE_MAP_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [scopeKey]);

  const connectedCount = useMemo(() => items.filter((item) => item.status === "online").length, [items]);
  const inVisitCount = useMemo(() => items.filter((item) => item.activeVisit).length, [items]);
  const inRouteCount = useMemo(() => items.filter((item) => item.activeRoute).length, [items]);

  return {
    items,
    message,
    loading,
    lastRefresh,
    connectedCount,
    inVisitCount,
    inRouteCount,
    reload: () => loadRef.current()
  };
}
