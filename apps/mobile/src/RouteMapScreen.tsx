import { useEffect, useMemo, useRef } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  createRouteMapHtml,
  formatDistanceLabel,
  hasRouteMapCoordinates,
  haversineDistanceKm,
  routeMapStatusLabel,
  type RouteMapPoint,
  type RouteMapPromoterLocation
} from "./routeMap";

interface RouteMapScreenProps {
  points: RouteMapPoint[];
  selectedRouteItemId: string | null;
  promoterLocation: RouteMapPromoterLocation | null;
  busy?: boolean;
  onSelectRouteItem: (routeItemId: string) => void;
  onOpenVisit: (routeItemId: string) => void;
  onRefreshPromoterLocation: () => void | Promise<void>;
}

function mapsNavigationUrl(point: RouteMapPoint, promoterLocation?: RouteMapPromoterLocation | null) {
  const origin =
    promoterLocation && Number.isFinite(promoterLocation.latitude) && Number.isFinite(promoterLocation.longitude)
      ? `&origin=${promoterLocation.latitude},${promoterLocation.longitude}`
      : "";

  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${point.latitude},${point.longitude}&travelmode=driving`;
}

function wazeNavigationUrl(point: RouteMapPoint) {
  return `waze://?ll=${point.latitude},${point.longitude}&navigate=yes`;
}

function formatCapturedAtLabel(value?: string | null) {
  if (!value) {
    return "Aguardando leitura do GPS";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Horario indisponivel";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAccuracyLabel(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Sem precisao";
  }

  return `${Math.round(value)} m`;
}

export function RouteMapScreen(props: RouteMapScreenProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const webViewRef = useRef<WebView>(null);

  const mappedPoints = useMemo(() => props.points.filter(hasRouteMapCoordinates), [props.points]);
  const selectedPoint = useMemo(() => {
    return (
      props.points.find((point) => point.routeItemId === props.selectedRouteItemId) ??
      mappedPoints[0] ??
      props.points[0] ??
      null
    );
  }, [mappedPoints, props.points, props.selectedRouteItemId]);

  const html = useMemo(
    () =>
      createRouteMapHtml({
        points: mappedPoints,
        promoterLocation: props.promoterLocation,
        selectedRouteItemId: selectedPoint?.routeItemId ?? null
      }),
    [mappedPoints, props.promoterLocation, selectedPoint?.routeItemId]
  );

  const pointsWithoutCoordinates = props.points.length - mappedPoints.length;
  const directDistanceKm = useMemo(() => {
    if (!props.promoterLocation || !selectedPoint || !hasRouteMapCoordinates(selectedPoint)) {
      return null;
    }

    return haversineDistanceKm(props.promoterLocation, selectedPoint);
  }, [props.promoterLocation, selectedPoint]);
  const nextOperationalPoint = useMemo(() => {
    return (
      props.points.find((point) => point.status !== "completed" && point.status !== "canceled") ??
      props.points.find((point) => point.status !== "completed") ??
      props.points[0] ??
      null
    );
  }, [props.points]);
  const selectedIsNextStop = selectedPoint?.routeItemId === nextOperationalPoint?.routeItemId;
  const selectedDistanceLabel = formatDistanceLabel(directDistanceKm);
  const promoterLocationCapturedLabel = formatCapturedAtLabel(props.promoterLocation?.capturedAt);
  const promoterLocationAccuracyLabel = formatAccuracyLabel(props.promoterLocation?.accuracyMeters);

  useEffect(() => {
    if (!selectedPoint?.routeItemId) {
      return;
    }

    webViewRef.current?.injectJavaScript(
      `window.setSelectedRouteItem && window.setSelectedRouteItem(${JSON.stringify(selectedPoint.routeItemId)}); true;`
    );
  }, [selectedPoint?.routeItemId]);

  async function openExternalNavigation(app: "google" | "waze" = "google") {
    if (!selectedPoint || !hasRouteMapCoordinates(selectedPoint)) {
      Alert.alert("Cliente sem coordenada", "Este cliente ainda nao possui latitude e longitude para abrir navegacao.");
      return;
    }

    const googleNavigationUrl = `google.navigation:q=${selectedPoint.latitude},${selectedPoint.longitude}`;
    const wazeUrl = wazeNavigationUrl(selectedPoint);
    const fallbackUrl = mapsNavigationUrl(selectedPoint, props.promoterLocation);

    try {
      if (app === "waze") {
        const canOpenWaze = await Linking.canOpenURL(wazeUrl);
        await Linking.openURL(canOpenWaze ? wazeUrl : fallbackUrl);
        return;
      }

      const canOpenGoogleNavigation = await Linking.canOpenURL(googleNavigationUrl);
      await Linking.openURL(canOpenGoogleNavigation ? googleNavigationUrl : fallbackUrl);
    } catch {
      Alert.alert("Nao foi possivel abrir a navegacao", "Tente novamente com internet ou abra o mapa manualmente no aparelho.");
    }
  }

  function focusPromoterOnMap() {
    webViewRef.current?.injectJavaScript("window.focusPromoterLocation && window.focusPromoterLocation(); true;");
  }

  function focusNextStop() {
    if (!nextOperationalPoint?.routeItemId) {
      return;
    }

    props.onSelectRouteItem(nextOperationalPoint.routeItemId);
  }

  function handleWebViewMessage(rawData: string) {
    try {
      const payload = JSON.parse(rawData) as { type?: string; routeItemId?: string };
      if (payload.type === "select-route-item" && payload.routeItemId) {
        props.onSelectRouteItem(payload.routeItemId);
      }
    } catch {
      // ignora mensagens invalidas do webview
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, isTablet ? styles.contentTablet : null]}>
      <View style={styles.heroCard}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroKicker}>Mapa de deslocamento</Text>
          <Text style={styles.heroTitle}>Jornada do promotor em campo</Text>
          <Text style={styles.heroSubtitle}>
            Veja a proxima parada, sua localizacao atual e abra a navegacao do aparelho para chegar mais rapido ao cliente.
          </Text>
        </View>
        <View style={styles.heroMetrics}>
          <MetricChip label="No roteiro" value={String(props.points.length)} />
          <MetricChip label="Com coordenada" value={String(mappedPoints.length)} />
          <MetricChip label="Pendentes" value={String(props.points.filter((point) => point.status !== "completed").length)} />
          <MetricChip label="Sem coordenada" value={String(Math.max(0, pointsWithoutCoordinates))} tone="warning" />
        </View>
      </View>

      <View style={styles.actionRow}>
        <ActionButton label="Atualizar minha posicao" onPress={props.onRefreshPromoterLocation} disabled={props.busy} />
        <ActionButton label="Proxima parada" onPress={focusNextStop} disabled={!nextOperationalPoint} />
        <ActionButton label="Ver minha posicao" onPress={focusPromoterOnMap} disabled={!props.promoterLocation} />
        <ActionButton label="Abrir no Google Maps" onPress={() => void openExternalNavigation("google")} disabled={!selectedPoint || !hasRouteMapCoordinates(selectedPoint)} tone="primary" />
        <ActionButton label="Abrir no Waze" onPress={() => void openExternalNavigation("waze")} disabled={!selectedPoint || !hasRouteMapCoordinates(selectedPoint)} />
      </View>

      <View style={styles.operationalCard}>
        <DetailTile
          label="Proxima parada"
          value={nextOperationalPoint ? `${nextOperationalPoint.sequence}. ${nextOperationalPoint.clientName}` : "Roteiro concluido"}
          helper={nextOperationalPoint?.address ?? "Sem cliente pendente no momento"}
        />
        <DetailTile
          label="Minha posicao"
          value={props.promoterLocation ? "GPS atualizado" : "Sem GPS ativo"}
          helper={`Leitura: ${promoterLocationCapturedLabel}`}
        />
        <DetailTile
          label="Precisao"
          value={promoterLocationAccuracyLabel}
          helper="Baseado na ultima coleta do aparelho"
        />
        <DetailTile
          label="Distancia atual"
          value={selectedDistanceLabel}
          helper={selectedPoint ? `Destino selecionado: ${selectedPoint.clientName}` : "Selecione um cliente no mapa"}
        />
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Como este mapa funciona</Text>
        <Text style={styles.noteText}>
          O mapa mostra somente clientes com latitude e longitude. Sem internet, a lista do roteiro continua funcionando e a navegacao externa abre quando o aparelho tiver acesso ao app de mapas.
        </Text>
      </View>

      <View style={styles.mapCard}>
        {mappedPoints.length > 0 ? (
          <WebView
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html }}
            style={[styles.webView, isTablet ? styles.webViewTablet : null]}
            javaScriptEnabled
            domStorageEnabled
            onMessage={(event) => handleWebViewMessage(event.nativeEvent.data)}
          />
        ) : (
          <View style={styles.emptyMapState}>
            <Text style={styles.emptyMapTitle}>Nenhum cliente com coordenada</Text>
            <Text style={styles.emptyMapText}>
              Cadastre latitude e longitude no cliente para habilitar o mapa de deslocamento no aplicativo.
            </Text>
          </View>
        )}
      </View>

      {selectedPoint ? (
        <View style={styles.selectedCard}>
          <View style={styles.selectedHeader}>
            <View style={styles.selectedHeaderText}>
              <Text style={styles.selectedKicker}>Cliente #{selectedPoint.sequence}</Text>
              <Text style={styles.selectedTitle}>{selectedPoint.clientName}</Text>
              <Text style={styles.selectedSubtitle}>
                {[selectedPoint.address, [selectedPoint.city, selectedPoint.state].filter(Boolean).join("/")].filter(Boolean).join(" - ") || "Endereco nao informado"}
              </Text>
              {selectedIsNextStop ? <Text style={styles.nextStopBadge}>Proxima parada sugerida</Text> : null}
            </View>
            <Text style={[styles.statusPill, selectedPoint.status === "in_progress" ? styles.statusPillBrand : selectedPoint.status === "completed" ? styles.statusPillSuccess : null]}>
              {routeMapStatusLabel(selectedPoint.status)}
            </Text>
          </View>

          <View style={styles.detailGrid}>
            <DetailTile label="Distancia direta" value={selectedDistanceLabel} helper="Estimativa reta entre sua posicao e o cliente" />
            <DetailTile
              label="Latitude"
              value={selectedPoint.latitude !== null && selectedPoint.latitude !== undefined ? selectedPoint.latitude.toFixed(6) : "Nao informada"}
              helper="Coordenada usada pelo mapa"
            />
            <DetailTile
              label="Longitude"
              value={selectedPoint.longitude !== null && selectedPoint.longitude !== undefined ? selectedPoint.longitude.toFixed(6) : "Nao informada"}
              helper="Coordenada usada pela navegacao"
            />
          </View>

          <View style={styles.actionRow}>
            <ActionButton label="Atender este cliente" onPress={() => props.onOpenVisit(selectedPoint.routeItemId)} tone="primary" />
            <ActionButton label="Google Maps" onPress={() => void openExternalNavigation("google")} disabled={!hasRouteMapCoordinates(selectedPoint)} />
            <ActionButton label="Waze" onPress={() => void openExternalNavigation("waze")} disabled={!hasRouteMapCoordinates(selectedPoint)} />
          </View>
        </View>
      ) : null}

      <View style={styles.listCard}>
        <Text style={styles.listTitle}>Clientes do roteiro</Text>
        <Text style={styles.listSubtitle}>Toque em um card para destacar o cliente no mapa. A lista continua operacional mesmo quando o fundo do mapa estiver sem internet.</Text>
        <View style={styles.routeList}>
          {props.points.map((point) => {
            const selected = point.routeItemId === selectedPoint?.routeItemId;
            const hasCoordinates = hasRouteMapCoordinates(point);
            const pointDistanceLabel =
              props.promoterLocation && hasCoordinates
                ? formatDistanceLabel(haversineDistanceKm(props.promoterLocation, point))
                : "Distancia indisponivel";
            const isNextOperationalPoint = point.routeItemId === nextOperationalPoint?.routeItemId;

            return (
              <TouchableOpacity
                key={point.routeItemId}
                style={[styles.routeCard, selected ? styles.routeCardSelected : null]}
                onPress={() => props.onSelectRouteItem(point.routeItemId)}
              >
                <View style={styles.routeSequenceBadge}>
                  <Text style={styles.routeSequenceText}>{point.sequence}</Text>
                </View>
                <View style={styles.routeCardBody}>
                  <Text style={styles.routeCardTitle}>{point.clientName}</Text>
                  <Text style={styles.routeCardSubtitle}>{point.address || "Endereco nao informado"}</Text>
                  <View style={styles.routeCardMetaRow}>
                    {isNextOperationalPoint ? <Text style={styles.routeMetaPillNext}>Proxima parada</Text> : null}
                    <Text style={[styles.routeMetaPill, hasCoordinates ? styles.routeMetaPillOk : styles.routeMetaPillWarn]}>
                      {hasCoordinates ? "Com mapa" : "Sem coordenada"}
                    </Text>
                    <Text style={styles.routeMetaPill}>{routeMapStatusLabel(point.status)}</Text>
                    <Text style={styles.routeMetaPill}>{pointDistanceLabel}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.routeOpenButton} onPress={() => props.onOpenVisit(point.routeItemId)}>
                  <Text style={styles.routeOpenButtonText}>Abrir</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function MetricChip(props: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <View style={[styles.metricChip, props.tone === "warning" ? styles.metricChipWarning : null]}>
      <Text style={styles.metricChipValue}>{props.value}</Text>
      <Text style={styles.metricChipLabel}>{props.label}</Text>
    </View>
  );
}

function DetailTile(props: { label: string; value: string; helper?: string }) {
  return (
    <View style={styles.detailTile}>
      <Text style={styles.detailTileLabel}>{props.label}</Text>
      <Text style={styles.detailTileValue}>{props.value}</Text>
      {props.helper ? <Text style={styles.detailTileHelper}>{props.helper}</Text> : null}
    </View>
  );
}

function ActionButton(props: { label: string; onPress: () => void; disabled?: boolean; tone?: "default" | "primary" }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        props.tone === "primary" ? styles.actionButtonPrimary : null,
        props.disabled ? styles.actionButtonDisabled : null
      ]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={[styles.actionButtonText, props.tone === "primary" ? styles.actionButtonTextPrimary : null]}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 16
  },
  contentTablet: {
    alignSelf: "center",
    maxWidth: 980,
    width: "100%"
  },
  heroCard: {
    backgroundColor: "#0F172A",
    borderRadius: 28,
    gap: 14,
    padding: 18
  },
  heroTextBlock: {
    gap: 6
  },
  heroKicker: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900"
  },
  heroSubtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  heroMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metricChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 102,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  metricChipWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderColor: "rgba(245, 158, 11, 0.26)"
  },
  metricChipValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900"
  },
  metricChipLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 180,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  actionButtonPrimary: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  actionButtonDisabled: {
    opacity: 0.45
  },
  actionButtonText: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900"
  },
  actionButtonTextPrimary: {
    color: "#FFFFFF"
  },
  noteCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
    padding: 16
  },
  noteTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900"
  },
  noteText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  operationalCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  mapCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden"
  },
  webView: {
    backgroundColor: "#DBEAFE",
    height: 360,
    width: "100%"
  },
  webViewTablet: {
    height: 480
  },
  emptyMapState: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    gap: 8,
    justifyContent: "center",
    minHeight: 260,
    padding: 24
  },
  emptyMapTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  emptyMapText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    maxWidth: 420,
    textAlign: "center"
  },
  selectedCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  selectedHeader: {
    gap: 10
  },
  selectedHeaderText: {
    gap: 4
  },
  selectedKicker: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  selectedTitle: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "900"
  },
  selectedSubtitle: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  nextStopBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusPill: {
    alignSelf: "flex-start",
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusPillBrand: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8"
  },
  statusPillSuccess: {
    backgroundColor: "#D1FAE5",
    color: "#047857"
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  detailTile: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  detailTileLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  detailTileValue: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4
  },
  detailTileHelper: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6
  },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  listTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  listSubtitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  routeList: {
    gap: 10
  },
  routeCard: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  routeCardSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  routeSequenceBadge: {
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  routeSequenceText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900"
  },
  routeCardBody: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  routeCardTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900"
  },
  routeCardSubtitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700"
  },
  routeCardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  routeMetaPill: {
    alignSelf: "flex-start",
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  routeMetaPillOk: {
    backgroundColor: "#D1FAE5",
    color: "#047857"
  },
  routeMetaPillWarn: {
    backgroundColor: "#FEF3C7",
    color: "#B45309"
  },
  routeMetaPillNext: {
    alignSelf: "flex-start",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  routeOpenButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 70,
    paddingHorizontal: 12
  },
  routeOpenButtonText: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900"
  }
});
