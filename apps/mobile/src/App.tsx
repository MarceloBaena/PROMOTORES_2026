import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { API_BASE_URL, downloadMobileSnapshot, login, type LoginResponse } from "./api";
import {
  addPhoto,
  addSyncLog,
  enqueue,
  getClient,
  getQueueSummary,
  getSession,
  getVisit,
  getVisitByRouteItem,
  initDatabase,
  listPhotos,
  listRouteItems,
  listSyncLogs,
  saveSession,
  saveSnapshot,
  upsertVisit,
  type LocalPhoto,
  type LocalVisit,
  type PhotoType
} from "./database";
import { createForegroundLocationTracker } from "./locationHeartbeat";
import { syncPending } from "./sync";

type Screen = "login" | "home" | "visit" | "sync";
type RouteItem = ReturnType<typeof listRouteItems>[number];

const photoLabels: Record<PhotoType, string> = {
  checkin: "Check-in",
  before: "Foto before",
  after: "Foto after",
  occurrence_extra: "Ocorrencia"
};

function nowIso() {
  return new Date().toISOString();
}

function createLocalId(prefix: string) {
  return `${prefix}_${Crypto.randomUUID()}`;
}

async function getGps() {
  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== "granted") {
    addSyncLog("failed", "GPS sem permissao. A visita continua offline com excecao de auditoria registrada.");
    return null;
  }

  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? undefined
    };
  } catch {
    addSyncLog("failed", "GPS indisponivel no aparelho. A evidencia foi mantida localmente.");
    return null;
  }
}

async function copyPhotoToLocalStore(sourceUri: string, localId: string) {
  const directory = `${FileSystem.documentDirectory}promotor-photos/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  const targetUri = `${directory}${localId}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [routeItems, setRouteItems] = useState<RouteItem[]>([]);
  const [activeItem, setActiveItem] = useState<RouteItem | null>(null);
  const [activeVisit, setActiveVisit] = useState<LocalVisit | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Inicializando banco local...");
  const [syncSummary, setSyncSummary] = useState(getQueueSummary());
  const trackerRef = useRef<ReturnType<typeof createForegroundLocationTracker> | null>(null);

  const completedPhotoTypes = useMemo(() => new Set(photos.map((photo) => photo.type)), [photos]);
  const requiredReady = completedPhotoTypes.has("checkin") && completedPhotoTypes.has("before") && completedPhotoTypes.has("after");

  function reloadLocalData() {
    setRouteItems(listRouteItems());
    setSyncSummary(getQueueSummary());

    if (activeVisit) {
      const latestVisit = getVisit(activeVisit.localId);
      setActiveVisit(latestVisit);
      setPhotos(latestVisit ? listPhotos(latestVisit.localId) : []);
    }
  }

  useEffect(() => {
    initDatabase();
    const stored = getSession();

    if (stored) {
      setSession({
        accessToken: stored.accessToken,
        refreshToken: stored.refreshToken,
        user: JSON.parse(stored.userJson) as LoginResponse["user"]
      });
      setScreen("home");
      setMessage("Sessao local carregada. O app pode operar offline.");
    } else {
      setMessage("Faca o primeiro login com internet para baixar seu roteiro.");
    }

    setRouteItems(listRouteItems());
    setSyncSummary(getQueueSummary());
  }, []);

  useEffect(() => {
    trackerRef.current?.stop();

    if (!session || activeVisit?.status !== "in_progress") {
      return;
    }

    trackerRef.current = createForegroundLocationTracker({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => session.accessToken,
      getVisitId: () => activeVisit.serverId ?? undefined,
      getCoordinates: async () => {
        const gps = await getGps();
        return gps ? { latitude: gps.latitude, longitude: gps.longitude, accuracyMeters: gps.accuracyMeters } : null;
      },
      isOperationallyActive: () => activeVisit.status === "in_progress",
      intervalMs: 45000,
      onError: (error) => addSyncLog("failed", `Mapa ao vivo nao atualizado: ${error.message}`),
      onSuccess: () => addSyncLog("synced", "Mapa ao vivo atualizado durante atendimento ativo.")
    });
    trackerRef.current.start();

    return () => trackerRef.current?.stop();
  }, [activeVisit, session]);

  async function handleLogin() {
    try {
      setBusy(true);
      const result = await login(email, password);

      if (result.user.role !== "PROMOTOR") {
        throw new Error("Este app e exclusivo para usuario PROMOTOR.");
      }

      saveSession(result);
      setSession(result);
      const snapshot = await downloadMobileSnapshot(result.accessToken);
      saveSnapshot(snapshot);
      setRouteItems(listRouteItems());
      setScreen("home");
      setMessage("Login feito. Roteiro e clientes foram salvos para uso offline.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro no login.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshSnapshot() {
    if (!session) {
      return;
    }

    try {
      setBusy(true);
      const snapshot = await downloadMobileSnapshot(session.accessToken);
      saveSnapshot(snapshot);
      reloadLocalData();
      setMessage("Roteiro atualizado e salvo no SQLite.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sem internet. Usando roteiro salvo localmente.");
    } finally {
      setBusy(false);
    }
  }

  async function openVisit(item: RouteItem) {
    const existing = getVisitByRouteItem(item.id);
    setActiveItem(item);
    setActiveVisit(existing);
    setNotes(existing?.notes ?? "");
    setPhotos(existing ? listPhotos(existing.localId) : []);
    setScreen("visit");
  }

  async function startVisit() {
    if (!activeItem) {
      return;
    }

    const gps = await getGps();
    const localVisit: LocalVisit = activeVisit ?? {
      localId: createLocalId("visit"),
      routeId: activeItem.routeId,
      routeItemId: activeItem.id,
      clientId: activeItem.clientId,
      status: "in_progress",
      startedAt: nowIso(),
      gpsLatitude: gps?.latitude ?? null,
      gpsLongitude: gps?.longitude ?? null,
      notes: "",
      syncStatus: "pending",
      updatedAt: nowIso()
    };

    const nextVisit = {
      ...localVisit,
      status: "in_progress" as const,
      startedAt: localVisit.startedAt ?? nowIso(),
      gpsLatitude: localVisit.gpsLatitude ?? gps?.latitude ?? null,
      gpsLongitude: localVisit.gpsLongitude ?? gps?.longitude ?? null,
      syncStatus: "pending" as const,
      updatedAt: nowIso()
    };

    upsertVisit(nextVisit);
    enqueue("visit", nextVisit.localId);
    setActiveVisit(nextVisit);
    setMessage("Atendimento iniciado localmente.");
    reloadLocalData();
  }

  async function capturePhoto(type: PhotoType) {
    if (!activeVisit) {
      Alert.alert("Inicie o atendimento", "Antes da foto, toque em Iniciar atendimento.");
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (permission.status !== "granted") {
      addSyncLog("failed", "Camera negada pelo aparelho.");
      Alert.alert("Camera negada", "Libere a camera para registrar as evidencias obrigatorias.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.7,
      exif: false
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const localId = createLocalId(`photo_${type}`);
    const gps = await getGps();
    const uri = await copyPhotoToLocalStore(result.assets[0].uri, localId);
    const photo: LocalPhoto = {
      localId,
      visitLocalId: activeVisit.localId,
      type,
      uri,
      capturedAt: nowIso(),
      gpsLatitude: gps?.latitude ?? null,
      gpsLongitude: gps?.longitude ?? null,
      syncStatus: "pending"
    };

    addPhoto(photo);
    enqueue("photo", photo.localId);
    setPhotos(listPhotos(activeVisit.localId));
    setMessage(`${photoLabels[type]} salva localmente.`);
  }

  function finishVisit() {
    if (!activeVisit) {
      return;
    }

    if (!requiredReady) {
      Alert.alert("Evidencias obrigatorias", "Nao e possivel encerrar sem check-in, foto before e foto after.");
      return;
    }

    const nextVisit = {
      ...activeVisit,
      status: "completed" as const,
      finishedAt: nowIso(),
      notes,
      syncStatus: "pending" as const,
      updatedAt: nowIso()
    };

    upsertVisit(nextVisit);
    enqueue("visit", nextVisit.localId);
    setActiveVisit(nextVisit);
    setMessage("Visita encerrada offline. Sincronize quando tiver internet.");
    reloadLocalData();
  }

  async function runSync() {
    if (!session) {
      return;
    }

    try {
      setBusy(true);
      const result = await syncPending(session.accessToken);
      reloadLocalData();
      setMessage(`Sincronizacao concluida. Enviados: ${result.synced}. Falhas: ${result.failed}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na sincronizacao.");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "login") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loginPanel}>
          <Text style={styles.kicker}>PROMOTORES 2026</Text>
          <Text style={styles.title}>Operacao de campo</Text>
          <Text style={styles.muted}>Faca o primeiro login com internet. Depois disso, roteiro, clientes, fotos e visitas ficam salvos no aparelho.</Text>
          <TextInput style={styles.input} placeholder="email do promotor" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="senha" secureTextEntry value={password} onChangeText={setPassword} />
          <PrimaryButton label={busy ? "Entrando..." : "Entrar e baixar roteiro"} disabled={busy} onPress={handleLogin} />
          <Text style={styles.statusText}>{message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "sync") {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Sincronizacao" onBack={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fila local persistente</Text>
          <Text style={styles.metric}>{syncSummary.pending ?? 0} pendente(s)</Text>
          <Text style={styles.danger}>{syncSummary.failed ?? 0} falha(s)</Text>
          <PrimaryButton label={busy ? "Sincronizando..." : "Reprocessar agora"} disabled={busy} onPress={runSync} />
        </View>
        <FlatList
          data={listSyncLogs()}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <Text style={item.status === "failed" ? styles.danger : styles.ok}>{item.status}</Text>
              <Text style={styles.logText}>{item.message}</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  if (screen === "visit" && activeItem) {
    const client = getClient(activeItem.clientId);

    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Atendimento" onBack={() => setScreen("home")} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.cardStrong}>
            <Text style={styles.kicker}>Cliente #{activeItem.sequence}</Text>
            <Text style={styles.titleSmall}>{client?.name ?? activeItem.clientName}</Text>
            <Text style={styles.muted}>{client?.address ?? "Endereco nao informado"}</Text>
            <StatusPill status={activeVisit?.status ?? "pending"} />
          </View>

          {!activeVisit ? (
            <PrimaryButton label="Iniciar atendimento" onPress={startVisit} />
          ) : (
            <>
              <View style={styles.stepGrid}>
                <PhotoButton type="checkin" done={completedPhotoTypes.has("checkin")} onPress={capturePhoto} />
                <PhotoButton type="before" done={completedPhotoTypes.has("before")} onPress={capturePhoto} />
                <PhotoButton type="after" done={completedPhotoTypes.has("after")} onPress={capturePhoto} />
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Resumo da execucao, ruptura, observacoes..."
                multiline
                value={notes}
                onChangeText={setNotes}
              />
              <PrimaryButton label="Encerrar visita" disabled={activeVisit.status === "completed"} onPress={finishVisit} />
            </>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Evidencias locais</Text>
            {photos.length === 0 ? <Text style={styles.muted}>Nenhuma foto capturada ainda.</Text> : null}
            {photos.map((photo) => (
              <Text key={photo.localId} style={styles.photoRow}>{photoLabels[photo.type]} salva em {new Date(photo.capturedAt).toLocaleTimeString()}</Text>
            ))}
          </View>
          <Text style={styles.statusText}>{message}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Roteiro do promotor" />
      <View style={styles.toolbar}>
        <SecondaryButton label="Atualizar roteiro" disabled={busy} onPress={refreshSnapshot} />
        <SecondaryButton label="Sync" disabled={busy} onPress={() => setScreen("sync")} />
      </View>
      <Text style={styles.statusText}>{message}</Text>
      <FlatList
        data={routeItems}
        contentContainerStyle={styles.content}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum roteiro salvo. Faca login com internet ou toque em Atualizar roteiro.</Text>}
        renderItem={({ item }) => {
          const visit = getVisitByRouteItem(item.id);
          return (
            <TouchableOpacity style={styles.routeCard} onPress={() => openVisit(item)}>
              <View style={styles.sequenceBadge}>
                <Text style={styles.sequence}>{item.sequence}</Text>
              </View>
              <View style={styles.routeBody}>
                <Text style={styles.routeName}>{item.clientName}</Text>
                <Text style={styles.muted}>{item.clientAddress ?? item.routeName}</Text>
                <StatusPill status={visit?.status ?? "pending"} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Header(props: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {props.onBack ? <TouchableOpacity onPress={props.onBack}><Text style={styles.back}>Voltar</Text></TouchableOpacity> : null}
      <Text style={styles.headerTitle}>{props.title}</Text>
    </View>
  );
}

function PrimaryButton(props: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, props.disabled ? styles.disabled : null]} disabled={props.disabled} onPress={props.onPress}>
      <Text style={styles.primaryText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton(props: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.secondaryButton, props.disabled ? styles.disabled : null]} disabled={props.disabled} onPress={props.onPress}>
      <Text style={styles.secondaryText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

function PhotoButton(props: { type: PhotoType; done: boolean; onPress: (type: PhotoType) => void }) {
  return (
    <TouchableOpacity style={[styles.photoButton, props.done ? styles.photoDone : null]} onPress={() => props.onPress(props.type)}>
      <Text style={styles.photoTitle}>{photoLabels[props.type]}</Text>
      <Text style={styles.photoState}>{props.done ? "capturada" : "obrigatoria"}</Text>
    </TouchableOpacity>
  );
}

function StatusPill(props: { status: string }) {
  const label = props.status === "completed" ? "concluida" : props.status === "in_progress" ? "em atendimento" : "pendente";
  return <Text style={[styles.pill, props.status === "completed" ? styles.pillOk : props.status === "in_progress" ? styles.pillWarn : null]}>{label}</Text>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#EEF3F1"
  },
  content: {
    padding: 16,
    gap: 12
  },
  loginPanel: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 14
  },
  header: {
    minHeight: 72,
    backgroundColor: "#12312C",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingTop: 10
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800"
  },
  back: {
    color: "#BFE5D8",
    fontWeight: "800",
    marginBottom: 4
  },
  toolbar: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingBottom: 4
  },
  kicker: {
    color: "#477166",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1
  },
  title: {
    color: "#12312C",
    fontSize: 34,
    fontWeight: "900"
  },
  titleSmall: {
    color: "#12312C",
    fontSize: 24,
    fontWeight: "900"
  },
  muted: {
    color: "#66756F",
    fontSize: 15,
    lineHeight: 21
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D2DED9",
    borderRadius: 16,
    borderWidth: 1,
    color: "#11231F",
    fontSize: 17,
    padding: 16
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  primaryButton: {
    backgroundColor: "#0E5A49",
    borderRadius: 18,
    padding: 18,
    alignItems: "center"
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900"
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderColor: "#C7D8D0",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center"
  },
  secondaryText: {
    color: "#12312C",
    fontWeight: "900"
  },
  disabled: {
    opacity: 0.55
  },
  statusText: {
    color: "#52645E",
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  empty: {
    color: "#52645E",
    fontSize: 16,
    padding: 16,
    textAlign: "center"
  },
  routeCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D9E4DF",
    borderWidth: 1,
    borderRadius: 22,
    flexDirection: "row",
    gap: 14,
    padding: 16
  },
  sequenceBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#12312C",
    alignItems: "center",
    justifyContent: "center"
  },
  sequence: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900"
  },
  routeBody: {
    flex: 1,
    gap: 6
  },
  routeName: {
    color: "#12312C",
    fontSize: 18,
    fontWeight: "900"
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    gap: 8
  },
  cardStrong: {
    backgroundColor: "#DCEBE4",
    borderRadius: 24,
    padding: 18,
    gap: 8
  },
  cardTitle: {
    color: "#12312C",
    fontSize: 18,
    fontWeight: "900"
  },
  metric: {
    color: "#12312C",
    fontSize: 26,
    fontWeight: "900"
  },
  danger: {
    color: "#B83B39",
    fontWeight: "900"
  },
  ok: {
    color: "#0E7A55",
    fontWeight: "900"
  },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#E6ECE9",
    borderRadius: 999,
    color: "#41544E",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  pillOk: {
    backgroundColor: "#CBEFDC",
    color: "#0A633F"
  },
  pillWarn: {
    backgroundColor: "#FFE5B8",
    color: "#8A5200"
  },
  stepGrid: {
    gap: 10
  },
  photoButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#C9D9D2",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18
  },
  photoDone: {
    borderColor: "#0E7A55",
    backgroundColor: "#E0F3EA"
  },
  photoTitle: {
    color: "#12312C",
    fontSize: 18,
    fontWeight: "900"
  },
  photoState: {
    color: "#61726C",
    marginTop: 4
  },
  photoRow: {
    color: "#12312C",
    fontSize: 15,
    paddingVertical: 4
  },
  logRow: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E5ECE9",
    borderBottomWidth: 1,
    padding: 14
  },
  logText: {
    color: "#41544E",
    marginTop: 4
  }
});
