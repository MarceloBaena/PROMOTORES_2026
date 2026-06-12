import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  API_BASE_URL,
  downloadMobileSnapshot,
  login,
  refreshSession,
  testApiConnection,
  type LoginResponse,
  type MobileSnapshot
} from "./api";
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
  listQueueDiagnostics,
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

const TEST_PROMOTER_EMAIL = "promotor.teste@formula.local";
const TEST_PROMOTER_PASSWORD = "Promotor@123";
const OFFLINE_DEMO_ACCESS_TOKEN = "offline-demo-access-token";
const OFFLINE_DEMO_REFRESH_TOKEN = "offline-demo-refresh-token";
const GPS_CAPTURE_TIMEOUT_MS = 8000;

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

function createOfflineDemoSession(): LoginResponse {
  return {
    accessToken: OFFLINE_DEMO_ACCESS_TOKEN,
    refreshToken: OFFLINE_DEMO_REFRESH_TOKEN,
    user: {
      id: "c7eaf11f-86be-4548-be9a-635d5298abf2",
      email: TEST_PROMOTER_EMAIL,
      name: "Promotor Teste",
      role: "PROMOTOR",
      status: "ACTIVE"
    }
  };
}

function createOfflineDemoSnapshot(): MobileSnapshot {
  const client = {
    id: "c5a8a99c-980a-4fc7-9552-3b47fbd7da67",
    code: "9001",
    name: "CLIENTE TESTE MOBILE",
    document: null,
    address: "Cliente salvo para teste offline",
    city: "Varzea Grande",
    state: "MT",
    latitude: null,
    longitude: null
  };

  return {
    downloadedAt: nowIso(),
    promoter: {
      id: "c7eaf11f-86be-4548-be9a-635d5298abf2",
      code: 4,
      name: "Promotor Teste",
      email: TEST_PROMOTER_EMAIL
    },
    clients: [client],
    routes: [
      {
        id: "3c8f8836-d8b3-4418-8339-d911bcfc1555",
        name: "ROTA TESTE MOBILE",
        status: "PUBLISHED",
        scheduledDate: nowIso(),
        items: [
          {
            id: "1841813b-4410-4a63-97fe-aa61d2413e70",
            routeId: "3c8f8836-d8b3-4418-8339-d911bcfc1555",
            clientId: client.id,
            sequence: 1,
            status: "PENDING",
            plannedStart: null,
            plannedEnd: null,
            client
          }
        ]
      }
    ]
  };
}

function isOfflineDemoSession(session: LoginResponse | null) {
  return session?.accessToken === OFFLINE_DEMO_ACCESS_TOKEN || session?.refreshToken === OFFLINE_DEMO_REFRESH_TOKEN;
}

function isNetworkConnectionError(message: string) {
  return /nao foi possivel conectar|tempo esgotado|network request failed|failed to fetch|conexao|internet|timeout/i.test(message);
}

function isExpiredSessionError(message: string) {
  return /invalid or expired access token|sessao expirada|token/i.test(message);
}

async function getGps() {
  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== "granted") {
    addSyncLog("failed", "GPS sem permissao. A visita continua offline com excecao de auditoria registrada.");
    return null;
  }

  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("GPS_TIMEOUT")), GPS_CAPTURE_TIMEOUT_MS);
      })
    ]);

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? undefined
    };
  } catch {
    const lastKnownPosition = await Location.getLastKnownPositionAsync({
      maxAge: 300000,
      requiredAccuracy: 500
    }).catch(() => null);

    if (lastKnownPosition) {
      addSyncLog("pending", "GPS atual demorou. Evidencia registrada com a ultima localizacao conhecida do aparelho.");
      return {
        latitude: lastKnownPosition.coords.latitude,
        longitude: lastKnownPosition.coords.longitude,
        accuracyMeters: lastKnownPosition.coords.accuracy ?? undefined
      };
    }

    addSyncLog("failed", "GPS indisponivel no aparelho. A evidencia foi mantida localmente sem coordenada.");
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
  const [email, setEmail] = useState(TEST_PROMOTER_EMAIL);
  const [password, setPassword] = useState(TEST_PROMOTER_PASSWORD);
  const [routeItems, setRouteItems] = useState<RouteItem[]>([]);
  const [activeItem, setActiveItem] = useState<RouteItem | null>(null);
  const [activeVisit, setActiveVisit] = useState<LocalVisit | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Inicializando banco local...");
  const [syncSummary, setSyncSummary] = useState(getQueueSummary());
  const [syncDiagnostics, setSyncDiagnostics] = useState(listQueueDiagnostics());
  const trackerRef = useRef<ReturnType<typeof createForegroundLocationTracker> | null>(null);

  const completedPhotoTypes = useMemo(() => new Set(photos.map((photo) => photo.type)), [photos]);
  const requiredReady = completedPhotoTypes.has("checkin") && completedPhotoTypes.has("before") && completedPhotoTypes.has("after");

  function reloadLocalData() {
    setRouteItems(listRouteItems());
    setSyncSummary(getQueueSummary());
    setSyncDiagnostics(listQueueDiagnostics());

    if (activeVisit) {
      const latestVisit = getVisit(activeVisit.localId);
      setActiveVisit(latestVisit);
      setPhotos(latestVisit ? listPhotos(latestVisit.localId) : []);
    }
  }

  function returnToHome(nextMessage = "Voltou ao menu principal. Toque em Sync para enviar os dados pendentes.") {
    setRouteItems(listRouteItems());
    setSyncSummary(getQueueSummary());
    setSyncDiagnostics(listQueueDiagnostics());
    setActiveVisit(null);
    setActiveItem(null);
    setPhotos([]);
    setNotes("");
    setScreen("home");
    setMessage(nextMessage);
  }

  async function renewSession() {
    if (!session) {
      throw new Error("Sessao local nao encontrada. Faca login novamente.");
    }

    if (isOfflineDemoSession(session)) {
      setEmail(session.user.email);
      setPassword("");
      setScreen("login");
      throw new Error("Voce esta em modo teste offline. Para sincronizar com a retaguarda, entre novamente com internet.");
    }

    try {
      const renewed = await refreshSession(session.refreshToken);
      saveSession(renewed);
      setSession(renewed);
      return renewed;
    } catch {
      setEmail(session.user.email);
      setPassword("");
      setScreen("login");
      throw new Error("Sessao expirada. Faca login novamente com internet. A fila offline continua salva no aparelho.");
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
    setSyncDiagnostics(listQueueDiagnostics());
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
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      const validationMessage = "Informe e-mail e senha do promotor para entrar.";
      setMessage(validationMessage);
      Alert.alert("Login incompleto", validationMessage);
      return;
    }

    try {
      setBusy(true);
      setMessage(`Conectando na API: ${API_BASE_URL}. No primeiro acesso pode levar alguns segundos.`);
      const result = await login(normalizedEmail, password);

      if (result.user.role !== "PROMOTOR") {
        throw new Error("Este app e exclusivo para usuario PROMOTOR.");
      }

      setMessage("Senha validada. Baixando roteiro do promotor...");
      saveSession(result);
      setSession(result);
      const snapshot = await downloadMobileSnapshot(result.accessToken);
      setMessage("Roteiro recebido. Salvando dados offline no aparelho...");
      saveSnapshot(snapshot);
      setRouteItems(listRouteItems());
      setScreen("home");
      setMessage(`Login feito. ${snapshot.routes.length} rota(s) e ${snapshot.clients.length} cliente(s) salvos para uso offline.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro no login.";

      if (
        normalizedEmail === TEST_PROMOTER_EMAIL &&
        password === TEST_PROMOTER_PASSWORD &&
        isNetworkConnectionError(errorMessage)
      ) {
        startOfflineDemoMode(
          "Nao foi possivel conectar na API pelo aparelho. O modo teste offline foi ativado para validar o fluxo de atendimento. Para sincronizar com a retaguarda, entre novamente quando a internet/API estiver acessivel."
        );
        return;
      }

      setMessage(errorMessage);
      Alert.alert("Nao foi possivel entrar", errorMessage);
    } finally {
      setBusy(false);
    }
  }

  function startOfflineDemoMode(reason?: string) {
    const demoSession = createOfflineDemoSession();
    const demoSnapshot = createOfflineDemoSnapshot();
    saveSession(demoSession);
    saveSnapshot(demoSnapshot);
    setSession(demoSession);
    setRouteItems(listRouteItems());
    setScreen("home");
    setMessage(reason ?? "Modo teste offline ativado. O roteiro esta salvo no aparelho.");
    Alert.alert(
      "Modo teste offline",
      "Roteiro local liberado para testar o atendimento. A sincronizacao com a retaguarda exige entrar novamente com internet."
    );
  }

  async function handleApiConnectionTest() {
    try {
      setBusy(true);
      setMessage(`Testando API: ${API_BASE_URL}`);
      const result = await testApiConnection();
      const successMessage = `API respondeu no aparelho: ${result.status}.`;
      setMessage(successMessage);
      Alert.alert("API conectada", successMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Falha ao testar API.";
      setMessage(errorMessage);
      Alert.alert("API nao respondeu", errorMessage);
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
      setMessage("Atualizando roteiro direto da retaguarda...");
      let currentSession = session;
      let snapshot: MobileSnapshot;

      try {
        snapshot = await downloadMobileSnapshot(currentSession.accessToken);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";

        if (!isExpiredSessionError(errorMessage)) {
          throw error;
        }

        setMessage("Sessao renovada. Continuando atualizacao do roteiro...");
        currentSession = await renewSession();
        snapshot = await downloadMobileSnapshot(currentSession.accessToken);
      }

      saveSnapshot(snapshot);
      reloadLocalData();
      setMessage(`Roteiro atualizado: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s).`);
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

    if (activeVisit.status === "completed") {
      Alert.alert("Atendimento concluido", "Esta visita ja foi encerrada. Volte ao menu principal para sincronizar.");
      return;
    }

    if (type !== "occurrence_extra" && completedPhotoTypes.has(type)) {
      Alert.alert("Foto ja capturada", "Esta evidencia obrigatoria ja foi registrada para esta visita.");
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
      quality: 0.35,
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
    returnToHome("Visita encerrada offline. Toque em Sync para enviar o atendimento.");
  }

  async function runSync() {
    if (!session) {
      return;
    }

    try {
      setBusy(true);
      const currentSession = await renewSession();
      setMessage("Enviando fila local para a retaguarda...");
      reloadLocalData();
      const result = await syncPending(currentSession.accessToken, (progress) => {
        setSyncSummary(getQueueSummary());
        setSyncDiagnostics(listQueueDiagnostics());
        const itemName = progress.item.kind === "visit" ? "visita" : "foto";
        const statusText = progress.status === "syncing" ? "enviando" : progress.status === "synced" ? "enviada" : "com falha";
        setMessage(`Sincronizando ${itemName}: ${statusText}. Enviados: ${progress.synced}. Falhas: ${progress.failed}.`);
      });
      const snapshot = await downloadMobileSnapshot(currentSession.accessToken);
      saveSnapshot(snapshot);
      reloadLocalData();
      setMessage(
        `Sincronizacao concluida. Enviados: ${result.synced}. Falhas: ${result.failed}. Roteiros baixados: ${snapshot.routes.length}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na sincronizacao.");
      setSyncSummary(getQueueSummary());
      setSyncDiagnostics(listQueueDiagnostics());
    } finally {
      setBusy(false);
    }
  }

  if (screen === "login") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.loginPanel} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>PROMOTORES 2026</Text>
          <Text style={styles.title}>Operacao de campo</Text>
          <Text style={styles.muted}>Faca o primeiro login com internet. Depois disso, roteiro, clientes, fotos e visitas ficam salvos no aparelho.</Text>
          <View style={styles.loginHint}>
            <Text style={styles.loginHintTitle}>Usuario de teste do app</Text>
            <Text style={styles.loginHintText}>promotor.teste@formula.local</Text>
            <Text style={styles.loginHintText}>Senha: Promotor@123</Text>
            <Text style={styles.loginHintApi}>API: {API_BASE_URL}</Text>
          </View>
          <TextInput style={styles.input} placeholder="email do promotor" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="senha" secureTextEntry value={password} onChangeText={setPassword} />
          <PrimaryButton label={busy ? "Entrando..." : "Entrar e baixar roteiro"} disabled={busy} onPress={handleLogin} />
          <SecondaryButton label="Testar conexao da API" disabled={busy} onPress={handleApiConnectionTest} />
          <SecondaryButton label="Entrar em modo teste offline" disabled={busy} onPress={() => startOfflineDemoMode()} />
          <Text style={[styles.statusText, message.toLowerCase().includes("erro") || message.toLowerCase().includes("nao foi") || message.toLowerCase().includes("invalid") ? styles.statusError : null]}>
            {message}
          </Text>
        </ScrollView>
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
          <PrimaryButton label={busy ? "Sincronizando..." : "Sincronizar agora"} disabled={busy} onPress={runSync} />
        </View>
        <SyncDiagnostics
          diagnostics={syncDiagnostics}
          onLoginAgain={() => {
            if (session) {
              setEmail(session.user.email);
            }

            setPassword("");
            setScreen("login");
            setMessage("Entre novamente para renovar a sessao. A fila offline continua salva.");
          }}
        />
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
    const visitCompleted = activeVisit?.status === "completed";

    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Atendimento" onBack={() => returnToHome()} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.cardStrong}>
            <Text style={styles.kicker}>Cliente #{activeItem.sequence}</Text>
            <Text style={styles.titleSmall}>{client?.name ?? activeItem.clientName}</Text>
            <Text style={styles.muted}>{client?.address ?? "Endereco nao informado"}</Text>
            <StatusPill status={activeVisit?.status ?? "pending"} />
          </View>

          {!activeVisit ? (
            <PrimaryButton label="Iniciar atendimento" onPress={startVisit} />
          ) : visitCompleted ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Atendimento concluido</Text>
              <Text style={styles.muted}>Esta visita foi encerrada localmente. Volte ao menu principal para sincronizar ou conferir o roteiro.</Text>
              <View style={styles.actionStack}>
                <PrimaryButton label="Voltar ao menu principal" onPress={() => returnToHome("Atendimento concluido. Toque em Sync para enviar a visita.")} />
                <SecondaryButton label="Ir para sincronizacao" onPress={() => setScreen("sync")} />
              </View>
            </View>
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
        <SecondaryButton label="Atualizar roteiro" grow disabled={busy} onPress={refreshSnapshot} />
        <SecondaryButton label="Sync" grow disabled={busy} onPress={() => setScreen("sync")} />
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

function SecondaryButton(props: { label: string; grow?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.secondaryButton, props.grow ? styles.buttonGrow : null, props.disabled ? styles.disabled : null]} disabled={props.disabled} onPress={props.onPress}>
      <Text style={styles.secondaryText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

function SyncDiagnostics(props: { diagnostics: ReturnType<typeof listQueueDiagnostics>; onLoginAgain: () => void }) {
  const failedItems = props.diagnostics.filter((item) => item.status === "failed");
  const activeItems = props.diagnostics.filter((item) => item.status === "syncing" || item.status === "pending");
  const visibleItems = failedItems.length > 0 ? failedItems : activeItems;
  const hasExpiredToken = visibleItems.some((item) => /expired access token|invalid or expired|token/i.test(item.lastError ?? ""));

  if (visibleItems.length === 0) {
    return (
      <View style={styles.diagnosticOk}>
        <Text style={styles.diagnosticTitle}>Sem criticas no sincronismo</Text>
        <Text style={styles.diagnosticText}>Nao ha itens presos na fila local neste momento.</Text>
      </View>
    );
  }

  if (failedItems.length === 0) {
    return (
      <View style={styles.diagnosticPending}>
        <Text style={styles.diagnosticTitle}>Fila aguardando envio</Text>
        <Text style={styles.diagnosticText}>
          Estes itens ainda nao sao erro. Para 1 atendimento completo e normal aparecer 1 visita e 3 fotos na fila.
        </Text>
        {visibleItems.slice(0, 6).map((item) => (
          <View key={item.id} style={styles.diagnosticItem}>
            <Text style={styles.diagnosticItemTitle}>
              {item.kind === "visit" ? "Visita" : photoLabels[item.photoType ?? "occurrence_extra"]} - {item.clientName ?? "cliente nao identificado"}
            </Text>
            <Text style={styles.diagnosticText}>
              {item.status === "syncing" ? "Enviando agora" : "Aguardando envio"} | Tentativas: {item.attempts}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.diagnosticCard}>
      <Text style={styles.diagnosticTitle}>Critica do sincronismo</Text>
      <Text style={styles.diagnosticText}>{syncDiagnosticSummary(visibleItems[0]?.lastError)}</Text>
      {hasExpiredToken ? (
        <SecondaryButton label="Entrar novamente" onPress={props.onLoginAgain} />
      ) : null}
      {visibleItems.slice(0, 6).map((item) => (
        <View key={item.id} style={styles.diagnosticItem}>
          <Text style={styles.diagnosticItemTitle}>
            {item.kind === "visit" ? "Visita" : photoLabels[item.photoType ?? "occurrence_extra"]} - {item.clientName ?? "cliente nao identificado"}
          </Text>
          <Text style={styles.diagnosticText}>Status: {item.status} | Tentativas: {item.attempts}</Text>
          <Text style={styles.diagnosticError}>{item.lastError ?? "Sem mensagem tecnica registrada."}</Text>
        </View>
      ))}
      {visibleItems.length > 6 ? (
        <Text style={styles.diagnosticText}>Mais {visibleItems.length - 6} item(ns) com critica. Corrija a causa acima e toque em Sincronizar agora.</Text>
      ) : null}
    </View>
  );
}

function syncDiagnosticSummary(error?: string | null) {
  const message = error ?? "";

  if (/expired access token|invalid or expired|token/i.test(message)) {
    return "A sessao do promotor expirou. Entre novamente com internet e toque em Sincronizar agora. As visitas e fotos continuam salvas no aparelho.";
  }

  if (/missing|required photo|foto/i.test(message)) {
    return "Existe visita tentando concluir sem todas as fotos obrigatorias sincronizadas. Confira check-in, foto before e foto after.";
  }

  if (/network|internet|failed to fetch|conexao|connection/i.test(message)) {
    return "Falha de conexao com a retaguarda. Verifique internet do aparelho e tente novamente.";
  }

  if (/visit.*not found|visita/i.test(message)) {
    return "A visita local nao foi reconciliada corretamente com a retaguarda. Toque em Sincronizar agora para reprocessar com seguranca.";
  }

  return "Existe item pendente com falha na fila local. Veja o erro tecnico abaixo e tente sincronizar novamente.";
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
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 14
  },
  loginHint: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFD8CE",
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 14
  },
  loginHintTitle: {
    color: "#12312C",
    fontSize: 14,
    fontWeight: "900"
  },
  loginHintText: {
    color: "#0E5A49",
    fontSize: 15,
    fontWeight: "800"
  },
  loginHintApi: {
    color: "#66756F",
    fontSize: 12,
    marginTop: 4
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
    backgroundColor: "#FFFFFF",
    borderColor: "#C7D8D0",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center"
  },
  buttonGrow: {
    flex: 1
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
  statusError: {
    backgroundColor: "#FDECEC",
    borderColor: "#F5B5B5",
    borderRadius: 14,
    borderWidth: 1,
    color: "#9F1D1D",
    fontWeight: "800"
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
  actionStack: {
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
  },
  diagnosticCard: {
    backgroundColor: "#FFF4E5",
    borderColor: "#E6A23C",
    borderWidth: 1,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    gap: 10
  },
  diagnosticOk: {
    backgroundColor: "#E8F5EE",
    borderColor: "#A5D6BA",
    borderWidth: 1,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    gap: 6
  },
  diagnosticPending: {
    backgroundColor: "#EAF4FF",
    borderColor: "#8CB9E8",
    borderWidth: 1,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    gap: 10
  },
  diagnosticTitle: {
    color: "#12312C",
    fontSize: 18,
    fontWeight: "900"
  },
  diagnosticText: {
    color: "#52645E",
    fontSize: 14,
    lineHeight: 20
  },
  diagnosticItem: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8D5B8",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4
  },
  diagnosticItemTitle: {
    color: "#12312C",
    fontSize: 14,
    fontWeight: "900"
  },
  diagnosticError: {
    color: "#9A3412",
    fontSize: 13,
    lineHeight: 18
  }
});
