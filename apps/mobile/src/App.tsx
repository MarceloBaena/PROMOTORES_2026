import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
  clearLocalOperationalData,
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
import promotorProIcon from "../assets/icon.png";

type Screen = "login" | "home" | "visit" | "sync";
type RouteItem = ReturnType<typeof listRouteItems>[number];

const TEST_PROMOTER_EMAIL = "promotor.teste@formula.local";
const TEST_PROMOTER_PASSWORD = "Promotor@123";
const OFFLINE_DEMO_ACCESS_TOKEN = "offline-demo-access-token";
const OFFLINE_DEMO_REFRESH_TOKEN = "offline-demo-refresh-token";
const GPS_CAPTURE_TIMEOUT_MS = 8000;

const photoLabels: Record<PhotoType, string> = {
  checkin: "Check-in",
  before: "Foto antes",
  after: "Foto depois",
  occurrence_extra: "Ocorrencia"
};

const syncStatusLabels: Record<string, string> = {
  pending: "Pendente",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  failed: "Falha"
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
    address: "Cliente salvo para teste sem internet",
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
    addSyncLog("failed", "GPS sem permissao. A visita continua localmente com excecao de auditoria registrada.");
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

  function returnToHome(nextMessage = "Voltou ao menu principal. Toque em Sincronizar para enviar os dados pendentes.") {
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
      throw new Error("Sessao local nao encontrada. Faca novo acesso.");
    }

    if (isOfflineDemoSession(session)) {
      setEmail(session.user.email);
      setPassword("");
      setScreen("login");
      throw new Error("Voce esta em modo teste sem internet. Para sincronizar com a retaguarda, entre novamente com internet.");
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
      throw new Error("Sessao expirada. Faca novo acesso com internet. A fila local continua salva no aparelho.");
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
      setMessage("Sessao local carregada. O aplicativo pode operar sem internet.");
    } else {
      setMessage("Faca o primeiro acesso com internet para baixar seu roteiro.");
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
      Alert.alert("Acesso incompleto", validationMessage);
      return;
    }

    try {
      setBusy(true);
      setMessage(`Conectando na API: ${API_BASE_URL}. No primeiro acesso pode levar alguns segundos.`);
      const result = await login(normalizedEmail, password);

      if (result.user.role !== "PROMOTOR") {
        throw new Error("Este aplicativo e exclusivo para usuario PROMOTOR.");
      }

      setMessage("Senha validada. Baixando roteiro do promotor...");
      saveSession(result);
      setSession(result);
      const snapshot = await downloadMobileSnapshot(result.accessToken);
      setMessage("Roteiro recebido. Salvando dados locais no aparelho...");
      saveSnapshot(snapshot);
      setRouteItems(listRouteItems());
      setScreen("home");
      setMessage(`Entrada realizada. ${snapshot.routes.length} rota(s) e ${snapshot.clients.length} cliente(s) salvos para uso sem internet.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro no acesso.";

      if (
        normalizedEmail === TEST_PROMOTER_EMAIL &&
        password === TEST_PROMOTER_PASSWORD &&
        isNetworkConnectionError(errorMessage)
      ) {
        startOfflineDemoMode(
          "Nao foi possivel conectar na API pelo aparelho. O modo teste sem internet foi ativado para validar o fluxo de atendimento. Para sincronizar com a retaguarda, entre novamente quando a internet/API estiver acessivel."
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
    setMessage(reason ?? "Modo teste sem internet ativado. O roteiro esta salvo no aparelho.");
    Alert.alert(
      "Modo teste sem internet",
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

        if (isNetworkConnectionError(errorMessage)) {
          setMessage("Primeira tentativa falhou. Tentando novamente com a API...");
          snapshot = await downloadMobileSnapshot(currentSession.accessToken);
        } else if (isExpiredSessionError(errorMessage)) {
          setMessage("Sessao renovada. Continuando atualizacao do roteiro...");
          currentSession = await renewSession();
          snapshot = await downloadMobileSnapshot(currentSession.accessToken);
        } else {
          throw error;
        }
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

  function confirmClearLocalData() {
    Alert.alert(
      "Limpar dados do aparelho?",
      "Use apenas quando a retaguarda foi zerada ou quando houver sujeira local. Isso apaga visitas, fotos e fila ainda nao sincronizadas deste aparelho, mas mantem o acesso.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar aparelho",
          style: "destructive",
          onPress: () => {
            clearLocalOperationalData();
            setActiveVisit(null);
            setActiveItem(null);
            setPhotos([]);
            setNotes("");
            reloadLocalData();
            setMessage("Dados locais limpos. Toque em Atualizar roteiro para baixar a base limpa.");
          }
        }
      ]
    );
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
      Alert.alert("Evidencias obrigatorias", "Nao e possivel encerrar sem check-in, foto antes e foto depois.");
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
    returnToHome("Visita encerrada localmente. Toque em Sincronizar para enviar o atendimento.");
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

  const completedHomeVisits = routeItems.filter((item) => getVisitByRouteItem(item.id)?.status === "completed").length;
  const inProgressHomeVisits = routeItems.filter((item) => getVisitByRouteItem(item.id)?.status === "in_progress").length;
  const pendingHomeVisits = Math.max(0, routeItems.length - completedHomeVisits - inProgressHomeVisits);

  if (screen === "login") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.loginPanel} keyboardShouldPersistTaps="handled">
          <View style={styles.mobileBrand}>
            <Image source={promotorProIcon} style={styles.mobileBrandIcon} />
            <View>
              <Text style={styles.mobileBrandTitle}>PromotorPro</Text>
              <Text style={styles.mobileBrandSubtitle}>GESTAO • EXECUCAO • RESULTADOS</Text>
            </View>
          </View>
          <Text style={styles.title}>Operacao de campo</Text>
          <Text style={styles.muted}>Primeiro acesso com internet. Depois disso, roteiro, clientes, fotos e visitas ficam salvos no aparelho.</Text>
          <View style={styles.loginHint}>
            <Text style={styles.loginHintTitle}>Usuario de teste do aplicativo</Text>
            <Text style={styles.loginHintText}>promotor.teste@formula.local</Text>
            <Text style={styles.loginHintText}>Senha: Promotor@123</Text>
            <Text style={styles.loginHintApi}>API: {API_BASE_URL}</Text>
          </View>
          <TextInput style={styles.input} placeholder="email do promotor" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="senha" secureTextEntry value={password} onChangeText={setPassword} />
          <PrimaryButton label={busy ? "Entrando..." : "Entrar e baixar roteiro"} disabled={busy} onPress={handleLogin} />
          <SecondaryButton label="Testar conexao da API" disabled={busy} onPress={handleApiConnectionTest} />
          <SecondaryButton label="Entrar em modo teste sem internet" disabled={busy} onPress={() => startOfflineDemoMode()} />
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
          <SecondaryButton label="Limpar dados locais deste aparelho" disabled={busy} onPress={confirmClearLocalData} />
        </View>
        <SyncDiagnostics
          diagnostics={syncDiagnostics}
          onLoginAgain={() => {
            if (session) {
              setEmail(session.user.email);
            }

            setPassword("");
            setScreen("login");
            setMessage("Entre novamente para renovar a sessao. A fila local continua salva.");
          }}
        />
        <FlatList
          data={listSyncLogs()}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <Text style={item.status === "failed" ? styles.danger : styles.ok}>{syncStatusLabels[item.status] ?? item.status}</Text>
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
                <PrimaryButton label="Voltar ao menu principal" onPress={() => returnToHome("Atendimento concluido. Toque em Sincronizar para enviar a visita.")} />
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
      <View style={styles.homeHero}>
        <View>
          <Text style={styles.heroKicker}>Execucao de hoje</Text>
          <Text style={styles.heroTitle}>{routeItems.length} cliente(s) no roteiro</Text>
          <Text style={styles.heroSubtitle}>Atenda, registre fotos e sincronize quando houver internet.</Text>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>{syncSummary.pending ?? 0}</Text>
          <Text style={styles.heroBadgeLabel}>na fila</Text>
        </View>
      </View>
      <View style={styles.statsGrid}>
        <StatTile label="Pendentes" value={pendingHomeVisits} tone="warning" />
        <StatTile label="Em atendimento" value={inProgressHomeVisits} tone="brand" />
        <StatTile label="Concluidas" value={completedHomeVisits} tone="success" />
      </View>
      <View style={styles.toolbar}>
        <SecondaryButton label="Atualizar roteiro" grow disabled={busy} onPress={refreshSnapshot} />
        <SecondaryButton label="Sincronizar" grow disabled={busy} onPress={() => setScreen("sync")} />
      </View>
      <Text style={styles.statusText}>{message}</Text>
      <FlatList
        data={routeItems}
        contentContainerStyle={styles.content}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum roteiro salvo. Faca o primeiro acesso com internet ou toque em Atualizar roteiro.</Text>}
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
      <View style={styles.headerBrandRow}>
        <Image source={promotorProIcon} style={styles.headerIcon} />
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerBrandText}>PromotorPro</Text>
          <Text style={styles.headerTitle}>{props.title}</Text>
        </View>
      </View>
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

function StatTile(props: { label: string; value: number; tone: "warning" | "brand" | "success" }) {
  const toneStyle = props.tone === "success" ? styles.statSuccess : props.tone === "brand" ? styles.statBrand : styles.statWarning;

  return (
    <View style={[styles.statTile, toneStyle]}>
      <Text style={styles.statValue}>{props.value}</Text>
      <Text style={styles.statLabel}>{props.label}</Text>
    </View>
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
          <Text style={styles.diagnosticText}>Situacao: {syncStatusLabels[item.status] ?? item.status} | Tentativas: {item.attempts}</Text>
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
    return "Existe visita tentando concluir sem todas as fotos obrigatorias sincronizadas. Confira check-in, foto antes e foto depois.";
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
    backgroundColor: "#F8FAFC"
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
  mobileBrand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginBottom: 8
  },
  mobileBrandIcon: {
    borderRadius: 22,
    height: 74,
    width: 74
  },
  mobileBrandTitle: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1
  },
  mobileBrandSubtitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: 3
  },
  loginHint: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DBEAFE",
    borderRadius: 24,
    borderWidth: 1,
    gap: 4,
    padding: 16
  },
  loginHintTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  loginHintText: {
    color: "#2563EB",
    fontSize: 15,
    fontWeight: "800"
  },
  loginHintApi: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4
  },
  header: {
    minHeight: 76,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingTop: 10
  },
  headerBrandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  headerIcon: {
    borderRadius: 14,
    height: 44,
    width: 44
  },
  headerTextBlock: {
    flex: 1
  },
  headerBrandText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900"
  },
  back: {
    color: "#93C5FD",
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
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1
  },
  title: {
    color: "#0F172A",
    fontSize: 34,
    fontWeight: "900"
  },
  titleSmall: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "900"
  },
  muted: {
    color: "#64748B",
    fontSize: 15,
    lineHeight: 21
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 17,
    padding: 16
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
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
    borderColor: "#E2E8F0",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    alignItems: "center"
  },
  buttonGrow: {
    flex: 1
  },
  secondaryText: {
    color: "#0F172A",
    fontWeight: "900"
  },
  disabled: {
    opacity: 0.55
  },
  statusText: {
    color: "#64748B",
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
    borderColor: "#E2E8F0",
    borderWidth: 1,
    borderRadius: 26,
    flexDirection: "row",
    gap: 14,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  sequenceBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#0F172A",
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
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 8
  },
  cardStrong: {
    backgroundColor: "#DBEAFE",
    borderColor: "#BFDBFE",
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    gap: 8
  },
  cardTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  metric: {
    color: "#0F172A",
    fontSize: 26,
    fontWeight: "900"
  },
  danger: {
    color: "#B83B39",
    fontWeight: "900"
  },
  ok: {
    color: "#10B981",
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
    backgroundColor: "#D1FAE5",
    color: "#047857"
  },
  pillWarn: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8"
  },
  stepGrid: {
    gap: 10
  },
  actionStack: {
    gap: 10
  },
  photoButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18
  },
  photoDone: {
    borderColor: "#10B981",
    backgroundColor: "#D1FAE5"
  },
  photoTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  photoState: {
    color: "#61726C",
    marginTop: 4
  },
  photoRow: {
    color: "#0F172A",
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
    color: "#0F172A",
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
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  diagnosticError: {
    color: "#9A3412",
    fontSize: 13,
    lineHeight: 18
  },
  homeHero: {
    backgroundColor: "#0F172A",
    borderRadius: 30,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    margin: 16,
    marginBottom: 10,
    padding: 18
  },
  heroKicker: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6
  },
  heroSubtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 260
  },
  heroBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  heroBadgeText: {
    color: "#10B981",
    fontSize: 24,
    fontWeight: "900"
  },
  heroBadgeLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "900"
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16
  },
  statTile: {
    borderRadius: 22,
    flex: 1,
    padding: 14
  },
  statBrand: {
    backgroundColor: "#DBEAFE"
  },
  statSuccess: {
    backgroundColor: "#D1FAE5"
  },
  statWarning: {
    backgroundColor: "#FEF3C7"
  },
  statValue: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "900"
  },
  statLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 3
  }
});
