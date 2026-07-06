import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, FlatList, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  API_BASE_URL,
  downloadMobileSnapshot,
  login,
  refreshSession,
  testApiConnection,
  type ClientSnapshot,
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
  getSupplierExecutionBySupplier,
  getVisit,
  getVisitByRouteItem,
  initDatabase,
  listQueueDiagnostics,
  listPhotos,
  listRouteItems,
  listSupplierExecutions,
  listSyncLogs,
  saveSession,
  saveSnapshot,
  upsertSupplierExecution,
  upsertVisit,
  type LocalPhoto,
  type LocalSupplierExecution,
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
const LIVE_TRACKING_VISIT_INTERVAL_MS = 20 * 1000;
const LIVE_TRACKING_ROUTE_INTERVAL_MS = 60 * 1000;
const LIVE_TRACKING_ERROR_LOG_WINDOW_MS = 5 * 60 * 1000;
const extraPhotoTypes = ["leaflet", "gondola", "display", "island", "promotional_material", "store_extra"] as const;
const FALLBACK_APP_VERSION = "0.1.25";
const FALLBACK_ANDROID_BUILD = 26;

const photoLabels: Record<PhotoType, string> = {
  checkin: "Check-in",
  before: "Foto antes",
  after: "Foto depois",
  supplier_before: "Foto antes do fornecedor",
  supplier_after: "Foto depois do fornecedor",
  leaflet: "Panfleto",
  gondola: "Ponta de gondola",
  display: "Display",
  island: "Ilha",
  promotional_material: "Material promocional",
  checkout: "Checkout",
  store_extra: "Foto extra da loja",
  occurrence_extra: "Ocorrencia"
};

const syncStatusLabels: Record<string, string> = {
  pending: "Pendente",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  failed: "Falha"
};

function resolveAppRelease() {
  const version = Constants.expoConfig?.version ?? FALLBACK_APP_VERSION;
  const buildNumber = String(Constants.expoConfig?.android?.versionCode ?? FALLBACK_ANDROID_BUILD);

  return {
    version,
    buildNumber,
    label: `APK v${version} (build ${buildNumber})`
  };
}

const APP_RELEASE = resolveAppRelease();

function nowIso() {
  return new Date().toISOString();
}

function createLocalId(prefix: string) {
  return `${prefix}_${Crypto.randomUUID()}`;
}

function parseClientPayload(client?: ReturnType<typeof getClient> | null) {
  if (!client?.payloadJson) {
    return null;
  }

  return JSON.parse(client.payloadJson) as ClientSnapshot;
}

function supplierLabel(supplier: NonNullable<ClientSnapshot["suppliers"]>[number]) {
  return supplier.tradeName?.trim() || supplier.name;
}

function supplierNameById(suppliers: NonNullable<ClientSnapshot["suppliers"]>, supplierId?: string | null) {
  if (!supplierId) {
    return "";
  }

  const supplier = suppliers.find((item) => item.id === supplierId);
  return supplier ? supplierLabel(supplier) : "Fornecedor vinculado";
}

function answerLabel(value: boolean | null | undefined) {
  if (value === true) {
    return "Sim";
  }

  if (value === false) {
    return "Nao";
  }

  return "Nao respondido";
}

function supplierRequiresDeliveryFlow(deliveryReceived: boolean | null | undefined) {
  return deliveryReceived !== false;
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
    suppliers: [
      {
        id: "b9a59d57-4838-4a87-af3e-8dd393458201",
        name: "Fornecedor Exemplo 01",
        tradeName: "Marca Exemplo 01",
        document: null,
        status: "ACTIVE"
      },
      {
        id: "696d6d6f-4838-4a87-af3e-8dd393458202",
        name: "Fornecedor Exemplo 02",
        tradeName: "Marca Exemplo 02",
        document: null,
        status: "ACTIVE"
      }
    ],
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

function isOpenRouteItem(item: RouteItem) {
  const status = String(item.status ?? "").toUpperCase();
  return !["COMPLETED", "CANCELLED", "SKIPPED"].includes(status);
}

function isNetworkConnectionError(message: string) {
  return /nao foi possivel conectar|tempo esgotado|network request failed|failed to fetch|conexao|internet|timeout/i.test(message);
}

function isExpiredSessionError(message: string) {
  return /invalid or expired access token|sessao expirada|token/i.test(message);
}

async function getGps(options: { silent?: boolean } = {}) {
  const currentPermission = await Location.getForegroundPermissionsAsync();
  const permission =
    currentPermission.status === "granted"
      ? currentPermission
      : currentPermission.canAskAgain
        ? await Location.requestForegroundPermissionsAsync()
        : currentPermission;

  if (permission.status !== "granted") {
    if (!options.silent) {
      addSyncLog("failed", "GPS sem permissao. A visita continua localmente com excecao de auditoria registrada.");
    }
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
      if (!options.silent) {
        addSyncLog("pending", "GPS atual demorou. Evidencia registrada com a ultima localizacao conhecida do aparelho.");
      }
      return {
        latitude: lastKnownPosition.coords.latitude,
        longitude: lastKnownPosition.coords.longitude,
        accuracyMeters: lastKnownPosition.coords.accuracy ?? undefined
      };
    }

    if (!options.silent) {
      addSyncLog("failed", "GPS indisponivel no aparelho. A evidencia foi mantida localmente sem coordenada.");
    }
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
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("login");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [email, setEmail] = useState(TEST_PROMOTER_EMAIL);
  const [password, setPassword] = useState(TEST_PROMOTER_PASSWORD);
  const [routeItems, setRouteItems] = useState<RouteItem[]>([]);
  const [activeItem, setActiveItem] = useState<RouteItem | null>(null);
  const [activeVisit, setActiveVisit] = useState<LocalVisit | null>(null);
  const [supplierExecutions, setSupplierExecutions] = useState<LocalSupplierExecution[]>([]);
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [notes, setNotes] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [deliveryReceived, setDeliveryReceived] = useState<boolean | null>(null);
  const [productsReplenished, setProductsReplenished] = useState<boolean | null>(null);
  const [stockoutFound, setStockoutFound] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Inicializando banco local...");
  const [syncSummary, setSyncSummary] = useState(getQueueSummary());
  const [syncDiagnostics, setSyncDiagnostics] = useState(listQueueDiagnostics());
  const trackerRef = useRef<ReturnType<typeof createForegroundLocationTracker> | null>(null);
  const liveTrackingLogRef = useRef<{ mode: "visit" | "route" | null; lastErrorMessage: string | null; lastErrorAt: number }>({
    mode: null,
    lastErrorMessage: null,
    lastErrorAt: 0
  });

  const isCompact = width < 390;
  const isTablet = width >= 720;
  const activeClient = useMemo(() => (activeItem ? getClient(activeItem.clientId) : null), [activeItem, activeVisit?.localId]);
  const activeClientPayload = useMemo(() => parseClientPayload(activeClient), [activeClient]);
  const clientSuppliers = activeClientPayload?.suppliers ?? [];
  const visitLevelPhotos = useMemo(
    () => photos.filter((photo) => !photo.supplierExecutionLocalId),
    [photos]
  );
  const completedPhotoTypes = useMemo(() => new Set(visitLevelPhotos.map((photo) => photo.type)), [visitLevelPhotos]);
  const legacyFlowEnabled = clientSuppliers.length === 0;
  const hasVisitCheckin = completedPhotoTypes.has("checkin");
  const hasVisitCheckout = completedPhotoTypes.has("checkout");
  const requiredReady = legacyFlowEnabled
    ? hasVisitCheckin && completedPhotoTypes.has("before") && completedPhotoTypes.has("after") && hasVisitCheckout
    : hasVisitCheckin && hasVisitCheckout;
  const activeSupplierExecution = useMemo(
    () => (activeVisit && activeSupplierId ? getSupplierExecutionBySupplier(activeVisit.localId, activeSupplierId) : null),
    [activeSupplierId, activeVisit?.localId, supplierExecutions]
  );
  const completedSupplierExecutions = supplierExecutions.filter((execution) => execution.status === "completed").length;
  const incompleteSuppliers = useMemo(
    () =>
      clientSuppliers.filter((supplier) => {
        const execution = supplierExecutions.find((item) => item.supplierId === supplier.id);
        return !execution || execution.status !== "completed";
      }),
    [clientSuppliers, supplierExecutions]
  );
  const allSuppliersCompleted = legacyFlowEnabled || incompleteSuppliers.length === 0;

  function reloadLocalData() {
    setRouteItems(listRouteItems());
    setSyncSummary(getQueueSummary());
    setSyncDiagnostics(listQueueDiagnostics());

    if (activeVisit) {
      const latestVisit = getVisit(activeVisit.localId);
      setActiveVisit(latestVisit);
      setPhotos(latestVisit ? listPhotos(latestVisit.localId) : []);
      setSupplierExecutions(latestVisit ? listSupplierExecutions(latestVisit.localId) : []);
    }
  }

  function returnToHome(nextMessage = "Voltou ao menu principal. Toque em Sincronizar para enviar os dados pendentes.") {
    setRouteItems(listRouteItems());
    setSyncSummary(getQueueSummary());
    setSyncDiagnostics(listQueueDiagnostics());
    setActiveVisit(null);
    setActiveItem(null);
    setSupplierExecutions([]);
    setActiveSupplierId(null);
    setPhotos([]);
    setNotes("");
    setSupplierNotes("");
    setDeliveryReceived(null);
    setProductsReplenished(null);
    setStockoutFound(null);
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

    const hasActiveVisit = activeVisit?.status === "in_progress";
    const hasOpenRoute = routeItems.some(isOpenRouteItem);

    if (!session || isOfflineDemoSession(session) || (!hasActiveVisit && !hasOpenRoute)) {
      liveTrackingLogRef.current = {
        mode: null,
        lastErrorMessage: null,
        lastErrorAt: 0
      };
      return;
    }

    const trackingMode = hasActiveVisit ? "visit" : "route";
    const intervalMs = hasActiveVisit ? LIVE_TRACKING_VISIT_INTERVAL_MS : LIVE_TRACKING_ROUTE_INTERVAL_MS;

    if (liveTrackingLogRef.current.mode !== trackingMode) {
      addSyncLog(
        "synced",
        trackingMode === "visit"
          ? "Rastreamento online ativado durante atendimento em andamento."
          : "Rastreamento online ativado para roteiro em campo."
      );
      liveTrackingLogRef.current = {
        mode: trackingMode,
        lastErrorMessage: null,
        lastErrorAt: 0
      };
    }

    trackerRef.current = createForegroundLocationTracker({
      apiBaseUrl: API_BASE_URL,
      getAccessToken: () => session.accessToken,
      getVisitId: () => (hasActiveVisit ? activeVisit?.serverId ?? undefined : undefined),
      getCoordinates: async () => {
        const gps = await getGps({ silent: true });
        return gps ? { latitude: gps.latitude, longitude: gps.longitude, accuracyMeters: gps.accuracyMeters } : null;
      },
      isOperationallyActive: () => hasActiveVisit || routeItems.some(isOpenRouteItem),
      intervalMs,
      onError: (error) => {
        const technicalMessage = `Mapa ao vivo nao atualizado: ${error.message}`;
        const shouldLog =
          liveTrackingLogRef.current.lastErrorMessage !== technicalMessage ||
          Date.now() - liveTrackingLogRef.current.lastErrorAt >= LIVE_TRACKING_ERROR_LOG_WINDOW_MS;

        if (!shouldLog) {
          return;
        }

        liveTrackingLogRef.current.lastErrorMessage = technicalMessage;
        liveTrackingLogRef.current.lastErrorAt = Date.now();
        addSyncLog("failed", technicalMessage);
      },
      onSuccess: () => {
        liveTrackingLogRef.current.lastErrorMessage = null;
        liveTrackingLogRef.current.lastErrorAt = 0;
      }
    });
    trackerRef.current.start();

    return () => trackerRef.current?.stop();
  }, [activeVisit, routeItems, session]);

  useEffect(() => {
    if (!activeSupplierExecution) {
      setSupplierNotes("");
      setDeliveryReceived(null);
      setProductsReplenished(null);
      setStockoutFound(null);
      return;
    }

    setSupplierNotes(activeSupplierExecution.notes ?? "");
    setDeliveryReceived(activeSupplierExecution.deliveryReceived ?? null);
    setProductsReplenished(activeSupplierExecution.productsReplenished ?? null);
    setStockoutFound(activeSupplierExecution.stockoutFound ?? null);
  }, [activeSupplierExecution?.localId, activeSupplierExecution?.updatedAt]);

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
      setMessage(`Roteiro atualizado: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s) pendente(s).`);
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

  function confirmExitApp() {
    const pendingItems = syncSummary.pending ?? 0;
    const failedItems = syncSummary.failed ?? 0;
    const hasVisitInProgress = activeVisit?.status === "in_progress";
    const bodyText = hasVisitInProgress
      ? "Existe um atendimento em andamento neste aparelho. Sair agora fecha o aplicativo, mas mantem a visita, as fotos e a fila local salvas para continuar depois."
      : pendingItems > 0 || failedItems > 0
        ? `Existem ${pendingItems} item(ns) pendente(s) e ${failedItems} falha(s) na fila local. Sair agora fecha o aplicativo, mas nao apaga nenhum dado salvo no aparelho.`
        : "O aplicativo sera fechado agora. Seus dados locais e a sessao atual continuam salvos neste aparelho.";

    Alert.alert("Sair do app agora?", bodyText, [
      { text: "Continuar no app", style: "cancel" },
      {
        text: "Sair agora",
        style: "destructive",
        onPress: () => BackHandler.exitApp()
      }
    ]);
  }

  async function openVisit(item: RouteItem) {
    const existing = getVisitByRouteItem(item.id);
    setActiveItem(item);
    setActiveVisit(existing);
    setNotes(existing?.notes ?? "");
    setPhotos(existing ? listPhotos(existing.localId) : []);
    setSupplierExecutions(existing ? listSupplierExecutions(existing.localId) : []);
    setActiveSupplierId(null);
    setScreen("visit");
  }

  function ensureSupplierExecution(supplierId: string) {
    if (!activeVisit || !activeItem) {
      return null;
    }

    const existingExecution = getSupplierExecutionBySupplier(activeVisit.localId, supplierId);

    if (existingExecution) {
      return existingExecution;
    }

    const createdExecution: LocalSupplierExecution = {
      localId: createLocalId("supplier_execution"),
      visitLocalId: activeVisit.localId,
      supplierId,
      clientId: activeItem.clientId,
      status: "in_progress",
      startedAtDevice: nowIso(),
      syncStatus: "pending",
      updatedAt: nowIso()
    };

    upsertSupplierExecution(createdExecution);
    enqueue("supplierExecution", createdExecution.localId);
    setSupplierExecutions(listSupplierExecutions(activeVisit.localId));
    return createdExecution;
  }

  function openSupplierExecution(supplierId: string) {
    if (!activeVisit) {
      Alert.alert("Inicie o atendimento", "Primeiro registre o inicio da visita e o check-in.");
      return;
    }

    const execution = ensureSupplierExecution(supplierId);

    if (!execution) {
      return;
    }

    if (execution.status === "pending" || execution.status === "skipped") {
      upsertSupplierExecution({
        ...execution,
        status: "in_progress",
        syncStatus: "pending",
        updatedAt: nowIso()
      });
      enqueue("supplierExecution", execution.localId);
      setSupplierExecutions(listSupplierExecutions(activeVisit.localId));
    }

    setActiveSupplierId(supplierId);
    setSupplierNotes(execution.notes ?? "");
    setDeliveryReceived(execution.deliveryReceived ?? null);
    setProductsReplenished(execution.productsReplenished ?? null);
    setStockoutFound(execution.stockoutFound ?? null);
  }

  function saveSupplierExecutionDraft(partial: Partial<LocalSupplierExecution>) {
    if (!activeSupplierId) {
      return null;
    }

    const execution = ensureSupplierExecution(activeSupplierId);

    if (!execution || !activeVisit) {
      return null;
    }

    const nextExecution: LocalSupplierExecution = {
      ...execution,
      ...partial,
      status: partial.status ?? (execution.status === "pending" ? "in_progress" : execution.status),
      syncStatus: "pending",
      updatedAt: nowIso()
    };

    upsertSupplierExecution(nextExecution);
    enqueue("supplierExecution", nextExecution.localId);
    setSupplierExecutions(listSupplierExecutions(activeVisit.localId));
    return nextExecution;
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
    setSupplierExecutions(listSupplierExecutions(nextVisit.localId));
    setMessage("Atendimento iniciado localmente.");
    reloadLocalData();
  }

  async function capturePhoto(type: PhotoType, supplierId?: string) {
    if (!activeVisit) {
      Alert.alert("Inicie o atendimento", "Antes da foto, toque em Iniciar atendimento.");
      return;
    }

    if (activeVisit.status === "completed") {
      Alert.alert("Atendimento concluido", "Esta visita ja foi encerrada. Volte ao menu principal para sincronizar.");
      return;
    }

    const execution = supplierId ? ensureSupplierExecution(supplierId) : null;
    const executionPhotos = execution ? photos.filter((photo) => photo.supplierExecutionLocalId === execution.localId) : [];
    const executionPhotoTypes = new Set(executionPhotos.map((photo) => photo.type));

    if (!supplierId && type !== "occurrence_extra" && completedPhotoTypes.has(type)) {
      Alert.alert("Foto ja capturada", "Esta evidencia obrigatoria ja foi registrada para esta visita.");
      return;
    }

    if (supplierId && (type === "supplier_before" || type === "supplier_after") && executionPhotoTypes.has(type)) {
      Alert.alert("Foto ja capturada", "Esta evidencia do fornecedor ja foi registrada.");
      return;
    }

    if (!supplierId && type === "checkout" && !allSuppliersCompleted) {
      Alert.alert(
        "Conclua os fornecedores primeiro",
        `Ainda existem ${incompleteSuppliers.length} fornecedor(es) sem foto antes, foto depois ou respostas obrigatorias. Finalize todos eles antes do check-out.`
      );
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
      supplierExecutionLocalId: execution?.localId ?? null,
      supplierId: supplierId ?? null,
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

  function completeSupplierExecution() {
    if (!activeVisit || !activeSupplierId) {
      return;
    }

    const execution = ensureSupplierExecution(activeSupplierId);

    if (!execution) {
      return;
    }

    const executionPhotos = photos.filter((photo) => photo.supplierExecutionLocalId === execution.localId);
    const executionPhotoTypes = new Set(executionPhotos.map((photo) => photo.type));
    const requiresDeliveryFlow = supplierRequiresDeliveryFlow(deliveryReceived);

    if (deliveryReceived === null) {
      Alert.alert("Entrega obrigatoria", "Informe primeiro se o fornecedor recebeu mercadoria.");
      return;
    }

    if (requiresDeliveryFlow && (!executionPhotoTypes.has("supplier_before") || !executionPhotoTypes.has("supplier_after"))) {
      Alert.alert("Fotos obrigatorias", "Conclua o fornecedor com foto antes e foto depois.");
      return;
    }

    if (requiresDeliveryFlow && (productsReplenished === null || stockoutFound === null)) {
      Alert.alert("Perguntas obrigatorias", "Responda abastecimento e ruptura antes de concluir o fornecedor.");
      return;
    }

    saveSupplierExecutionDraft({
      status: "completed",
      deliveryReceived,
      productsReplenished: requiresDeliveryFlow ? productsReplenished : false,
      stockoutFound: requiresDeliveryFlow ? stockoutFound : false,
      notes: supplierNotes,
      finishedAtDevice: nowIso()
    });
    setActiveSupplierId(null);
    setSupplierNotes("");
    setDeliveryReceived(null);
    setProductsReplenished(null);
    setStockoutFound(null);
    setMessage("Fornecedor concluido e salvo localmente.");
  }

  function persistVisitCompletion() {
    if (!activeVisit) {
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

  function finishVisit() {
    if (!activeVisit) {
      return;
    }

    if (!requiredReady) {
      Alert.alert(
        "Evidencias obrigatorias",
        legacyFlowEnabled
          ? "Nao e possivel encerrar sem check-in, foto antes, foto depois e foto de check-out."
          : "Nao e possivel encerrar sem a foto de check-in e a foto de check-out da visita."
      );
      return;
    }

    if (legacyFlowEnabled) {
      persistVisitCompletion();
      return;
    }

    if (!allSuppliersCompleted) {
      Alert.alert(
        "Fornecedores pendentes",
        `Ainda existem ${incompleteSuppliers.length} fornecedor(es) sem conclusao. Passe por todas as fotos e perguntas dos fornecedores antes de encerrar o atendimento.`
      );
      return;
    }

    persistVisitCompletion();
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
        const itemName =
          progress.item.kind === "visit"
            ? "visita"
            : progress.item.kind === "supplierExecution"
              ? "fornecedor"
              : "foto";
        const statusText = progress.status === "syncing" ? "enviando" : progress.status === "synced" ? "enviada" : "com falha";
        setMessage(`Sincronizando ${itemName}: ${statusText}. Enviados: ${progress.synced}. Falhas: ${progress.failed}.`);
      });
      const snapshot = await downloadMobileSnapshot(currentSession.accessToken);
      saveSnapshot(snapshot);
      reloadLocalData();
      setMessage(
        `Sincronizacao concluida. Enviados: ${result.synced}. Falhas: ${result.failed}. Rotas pendentes baixadas: ${snapshot.routes.length}.`
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
        <ScrollView contentContainerStyle={[styles.loginPanel, isCompact ? styles.loginPanelCompact : null, isTablet ? styles.loginPanelTablet : null]} keyboardShouldPersistTaps="handled">
          <View style={[styles.mobileBrand, isCompact ? styles.mobileBrandCompact : null]}>
            <Image source={promotorProIcon} style={[styles.mobileBrandIcon, isCompact ? styles.mobileBrandIconCompact : null]} />
            <View>
              <Text style={[styles.mobileBrandTitle, isCompact ? styles.mobileBrandTitleCompact : null]}>PromotorPro</Text>
              <Text style={styles.mobileBrandSubtitle}>GESTAO / EXECUCAO / RESULTADOS</Text>
            </View>
          </View>
          <View style={styles.releaseRow}>
            <View style={styles.releaseChip}>
              <Text style={styles.releaseChipText}>{APP_RELEASE.label}</Text>
            </View>
            <View style={[styles.releaseChip, styles.releaseChipSoft]}>
              <Text style={styles.releaseChipSoftText}>API {API_BASE_URL.replace(/^https?:\/\//, "")}</Text>
            </View>
          </View>
          <Text style={[styles.title, isCompact ? styles.titleCompact : null]}>Operacao de campo</Text>
          <Text style={styles.muted}>Primeiro acesso com internet. Depois disso, roteiro, clientes, fotos e visitas ficam salvos no aparelho.</Text>
          <View style={styles.loginHint}>
            <Text style={styles.loginHintTitle}>Release instalada no aparelho</Text>
            <Text style={styles.loginHintText}>{APP_RELEASE.label}</Text>
            <Text style={styles.loginHintApi}>Esta identificacao ajuda a conferir se o APK novo foi realmente instalado.</Text>
          </View>
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
          <SecondaryButton label="Sair do app" tone="danger" disabled={busy} onPress={confirmExitApp} />
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
          <Header title="Sincronizacao" onBack={() => setScreen("home")} onExitApp={confirmExitApp} />
          <View style={[styles.card, styles.screenCard, isTablet ? styles.screenCardTablet : null]}>
            <View style={styles.syncMetaRow}>
              <View style={styles.syncMetaCard}>
                <Text style={styles.syncMetaLabel}>Versao do APK</Text>
                <Text style={styles.syncMetaValue}>{APP_RELEASE.label}</Text>
              </View>
              <View style={styles.syncMetaCard}>
                <Text style={styles.syncMetaLabel}>Ambiente da API</Text>
                <Text style={styles.syncMetaValue}>{API_BASE_URL.replace(/^https?:\/\//, "")}</Text>
              </View>
            </View>
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
          contentContainerStyle={[styles.content, isTablet ? styles.contentTablet : null]}
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
    const client = activeClient ?? getClient(activeItem.clientId);
    const visitCompleted = activeVisit?.status === "completed";
    const selectedSupplier = clientSuppliers.find((supplier) => supplier.id === activeSupplierId) ?? null;
    const supplierProgress = clientSuppliers.length > 0 ? completedSupplierExecutions / clientSuppliers.length : 0;

    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Atendimento" onBack={() => returnToHome()} onExitApp={confirmExitApp} />
        <ScrollView contentContainerStyle={[styles.content, isCompact ? styles.contentCompact : null, isTablet ? styles.contentTablet : null]}>
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
              <View style={[styles.stepGrid, isTablet ? styles.stepGridTablet : null]}>
                <PhotoButton type="checkin" done={completedPhotoTypes.has("checkin")} onPress={capturePhoto} />
                {legacyFlowEnabled ? (
                  <>
                    <PhotoButton type="before" done={completedPhotoTypes.has("before")} onPress={capturePhoto} />
                    <PhotoButton type="after" done={completedPhotoTypes.has("after")} onPress={capturePhoto} />
                    <PhotoButton type="checkout" done={completedPhotoTypes.has("checkout")} onPress={capturePhoto} />
                  </>
                ) : (
                  <PhotoButton
                    type="checkout"
                    done={completedPhotoTypes.has("checkout")}
                    disabled={!allSuppliersCompleted && !completedPhotoTypes.has("checkout")}
                    helperText={!allSuppliersCompleted ? "libera apos concluir fornecedores" : undefined}
                    onPress={capturePhoto}
                  />
                )}
              </View>

              {!legacyFlowEnabled ? (
                <>
                  <View style={styles.card}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionHeaderText}>
                        <Text style={styles.cardTitle}>Execucao por fornecedor</Text>
                        <Text style={styles.muted}>
                          Atendidos {completedSupplierExecutions} de {clientSuppliers.length}. Se nao houve entrega, marque "Nao" em entrega para concluir o fornecedor.
                        </Text>
                      </View>
                      <View style={styles.sectionBadge}>
                        <Text style={styles.sectionBadgeValue}>{Math.round(supplierProgress * 100)}%</Text>
                        <Text style={styles.sectionBadgeLabel}>concluido</Text>
                      </View>
                    </View>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${supplierProgress <= 0 ? 0 : Math.max(6, supplierProgress * 100)}%` }]} />
                    </View>
                    <View style={styles.supplierGrid}>
                      {clientSuppliers.map((supplier) => {
                        const execution = supplierExecutions.find((item) => item.supplierId === supplier.id);
                        const executionPhotos = execution ? photos.filter((photo) => photo.supplierExecutionLocalId === execution.localId) : [];
                        const executionTypes = new Set(executionPhotos.map((photo) => photo.type));
                        const hasBefore = executionTypes.has("supplier_before");
                        const hasAfter = executionTypes.has("supplier_after");

                        return (
                          <TouchableOpacity
                            key={supplier.id}
                            style={[styles.supplierCard, activeSupplierId === supplier.id ? styles.supplierCardActive : null]}
                            onPress={() => openSupplierExecution(supplier.id)}
                          >
                            <View style={styles.supplierCardHeader}>
                              <View style={styles.supplierTextBlock}>
                                <Text style={styles.supplierName}>{supplierLabel(supplier)}</Text>
                                <Text style={styles.supplierMeta}>{supplier.document || "Fornecedor vinculado ao cliente"}</Text>
                              </View>
                              <StatusPill status={execution?.status ?? "pending"} />
                            </View>
                            <View style={styles.supplierChecklist}>
                              <MiniPill label="Antes" done={hasBefore} />
                              <MiniPill label="Depois" done={hasAfter} />
                              <MiniPill label="Entrega" done={execution?.deliveryReceived !== null && execution?.deliveryReceived !== undefined} />
                              <MiniPill label="Abasteceu" done={execution?.productsReplenished !== null && execution?.productsReplenished !== undefined} />
                              <MiniPill label="Ruptura" done={execution?.stockoutFound !== null && execution?.stockoutFound !== undefined} />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {selectedSupplier ? (
                    <View style={styles.cardStrong}>
                      <Text style={styles.kicker}>Fornecedor selecionado</Text>
                      <Text style={styles.titleSmall}>{supplierLabel(selectedSupplier)}</Text>
                      <Text style={styles.muted}>{selectedSupplier.document || "Sem documento informado"}</Text>
                      <View style={styles.supplierChecklist}>
                        <MiniPill label="Foto antes" done={photos.some((photo) => photo.supplierExecutionLocalId === activeSupplierExecution?.localId && photo.type === "supplier_before")} />
                        <MiniPill label="Foto depois" done={photos.some((photo) => photo.supplierExecutionLocalId === activeSupplierExecution?.localId && photo.type === "supplier_after")} />
                        <MiniPill label={`Entrega: ${answerLabel(deliveryReceived)}`} done={deliveryReceived !== null} />
                        <MiniPill label={`Abastecimento: ${answerLabel(productsReplenished)}`} done={productsReplenished !== null} />
                        <MiniPill label={`Ruptura: ${answerLabel(stockoutFound)}`} done={stockoutFound !== null} />
                      </View>
                      <View style={[styles.stepGrid, isTablet ? styles.stepGridTablet : null]}>
                        <TouchableOpacity
                          style={[
                            styles.photoButton,
                            photos.some((photo) => photo.supplierExecutionLocalId === activeSupplierExecution?.localId && photo.type === "supplier_before") ? styles.photoDone : null
                          ]}
                          onPress={() => void capturePhoto("supplier_before", selectedSupplier.id)}
                        >
                          <Text style={styles.photoTitle}>{photoLabels.supplier_before}</Text>
                          <Text style={styles.photoState}>obrigatoria</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.photoButton,
                            photos.some((photo) => photo.supplierExecutionLocalId === activeSupplierExecution?.localId && photo.type === "supplier_after") ? styles.photoDone : null
                          ]}
                          onPress={() => void capturePhoto("supplier_after", selectedSupplier.id)}
                        >
                          <Text style={styles.photoTitle}>{photoLabels.supplier_after}</Text>
                          <Text style={styles.photoState}>obrigatoria</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.questionGrid}>
                        <QuestionToggle
                          label="Recebeu mercadoria?"
                          value={deliveryReceived}
                          onChange={(value) => {
                            setDeliveryReceived(value);
                            const nextPartial =
                              value === false
                                ? { deliveryReceived: value, productsReplenished: false, stockoutFound: false }
                                : { deliveryReceived: value };
                            saveSupplierExecutionDraft(nextPartial);
                            if (value === false) {
                              setProductsReplenished(false);
                              setStockoutFound(false);
                            }
                          }}
                        />
                        <QuestionToggle
                          label="Produtos abastecidos?"
                          value={productsReplenished}
                          disabled={deliveryReceived === false}
                          onChange={(value) => {
                            setProductsReplenished(value);
                            saveSupplierExecutionDraft({ productsReplenished: value });
                          }}
                        />
                        <QuestionToggle
                          label="Houve ruptura?"
                          value={stockoutFound}
                          disabled={deliveryReceived === false}
                          onChange={(value) => {
                            setStockoutFound(value);
                            saveSupplierExecutionDraft({ stockoutFound: value });
                          }}
                        />
                      </View>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Observacoes do fornecedor, ruptura, falta de material..."
                        multiline
                        value={supplierNotes}
                        onChangeText={(value) => {
                          setSupplierNotes(value);
                          saveSupplierExecutionDraft({ notes: value });
                        }}
                      />
                      <View style={styles.actionStack}>
                        <PrimaryButton label="Concluir fornecedor" onPress={completeSupplierExecution} />
                        <SecondaryButton label="Continuar depois" onPress={() => setActiveSupplierId(null)} />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Selecione um fornecedor</Text>
                      <Text style={styles.muted}>Toque em um fornecedor acima para registrar fotos antes/depois e responder as perguntas obrigatorias.</Text>
                    </View>
                  )}

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Fotos extras da visita</Text>
                    <Text style={styles.muted}>Use quando houver panfleto, ponta de gondola, display, ilha, material promocional ou outra evidencia da loja.</Text>
                    <View style={[styles.stepGrid, isTablet ? styles.stepGridTablet : null]}>
                      {extraPhotoTypes.map((type) => (
                        <TouchableOpacity key={type} style={styles.photoButton} onPress={() => void capturePhoto(type)}>
                          <Text style={styles.photoTitle}>{photoLabels[type]}</Text>
                          <Text style={styles.photoState}>
                            {visitLevelPhotos.filter((photo) => photo.type === type).length} registrada(s)
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={legacyFlowEnabled ? "Resumo da execucao, ruptura, observacoes..." : "Observacoes gerais da visita e checkout do cliente..."}
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
              <Text key={photo.localId} style={styles.photoRow}>
                {photoLabels[photo.type]}
                {photo.supplierId ? ` - ${supplierNameById(clientSuppliers, photo.supplierId)}` : ""}
                {" "}salva em {new Date(photo.capturedAt).toLocaleTimeString()}
              </Text>
            ))}
          </View>
          <Text style={styles.statusText}>{message}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Roteiro do promotor" onExitApp={confirmExitApp} />
      <View style={[styles.homeHero, isCompact ? styles.homeHeroCompact : null, isTablet ? styles.homeHeroTablet : null]}>
        <View>
          <Text style={styles.heroKicker}>Execucao de hoje</Text>
          <Text style={styles.heroTitle}>{routeItems.length} cliente(s) no roteiro</Text>
          <Text style={styles.heroSubtitle}>Atenda, registre fotos e sincronize quando houver internet.</Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroMetaPill}>{APP_RELEASE.label}</Text>
            <Text style={styles.heroMetaPill}>API pronta para sincronizar</Text>
          </View>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>{syncSummary.pending ?? 0}</Text>
          <Text style={styles.heroBadgeLabel}>na fila</Text>
        </View>
      </View>
      <View style={[styles.statsGrid, isCompact ? styles.statsGridCompact : null, isTablet ? styles.statsGridTablet : null]}>
        <StatTile label="Pendentes" value={pendingHomeVisits} tone="warning" />
        <StatTile label="Em atendimento" value={inProgressHomeVisits} tone="brand" />
        <StatTile label="Concluidas" value={completedHomeVisits} tone="success" />
      </View>
      <View style={[styles.toolbar, isCompact ? styles.toolbarCompact : null, isTablet ? styles.toolbarTablet : null]}>
        <SecondaryButton label="Atualizar roteiro" grow disabled={busy} onPress={refreshSnapshot} />
        <SecondaryButton label="Sincronizar" grow disabled={busy} onPress={() => setScreen("sync")} />
      </View>
      <Text style={styles.statusText}>{message}</Text>
      <FlatList
        data={routeItems}
        contentContainerStyle={[styles.content, isCompact ? styles.contentCompact : null, isTablet ? styles.contentTablet : null]}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum atendimento pendente. Toque em Atualizar roteiro para conferir se ha nova rota publicada.</Text>}
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

function Header(props: { title: string; onBack?: () => void; onExitApp?: () => void }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const isTablet = width >= 720;

  return (
    <View style={[styles.header, isCompact ? styles.headerCompact : null]}>
      <View style={[styles.headerBrandRow, isTablet ? styles.headerBrandRowTablet : null]}>
        <Image source={promotorProIcon} style={[styles.headerIcon, isCompact ? styles.headerIconCompact : null]} />
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerBrandText}>PromotorPro</Text>
          <Text style={[styles.headerTitle, isCompact ? styles.headerTitleCompact : null]} numberOfLines={2}>{props.title}</Text>
          <Text style={styles.headerVersionText}>{APP_RELEASE.label}</Text>
        </View>
        {props.onBack || props.onExitApp ? (
          <View style={styles.headerActions}>
            {props.onBack ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar ao menu principal" style={[styles.backButton, isCompact ? styles.backButtonCompact : null]} onPress={props.onBack}>
                <Text style={styles.backButtonText}>Voltar</Text>
              </TouchableOpacity>
            ) : null}
            {props.onExitApp ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sair do aplicativo" style={[styles.headerExitButton, isCompact ? styles.headerExitButtonCompact : null]} onPress={props.onExitApp}>
                <Text style={styles.headerExitButtonText}>Sair</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
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

function SecondaryButton(props: { label: string; grow?: boolean; tone?: "default" | "danger"; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        props.tone === "danger" ? styles.secondaryButtonDanger : null,
        props.grow ? styles.buttonGrow : null,
        props.disabled ? styles.disabled : null
      ]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={[styles.secondaryText, props.tone === "danger" ? styles.secondaryTextDanger : null]}>{props.label}</Text>
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
              {item.kind === "visit"
                ? "Visita"
                : item.kind === "supplierExecution"
                  ? "Fornecedor"
                  : photoLabels[item.photoType ?? "occurrence_extra"]} - {item.clientName ?? "cliente nao identificado"}
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
            {item.kind === "visit"
              ? "Visita"
              : item.kind === "supplierExecution"
                ? "Fornecedor"
                : photoLabels[item.photoType ?? "occurrence_extra"]} - {item.clientName ?? "cliente nao identificado"}
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
    return "Existe envio sem todas as evidencias obrigatorias. Confira check-in, fornecedor, foto antes, foto depois e respostas obrigatorias.";
  }

  if (/network|internet|failed to fetch|conexao|connection/i.test(message)) {
    return "Falha de conexao com a retaguarda. Verifique internet do aparelho e tente novamente.";
  }

  if (/visit.*not found|visita/i.test(message)) {
    return "A visita local nao foi reconciliada corretamente com a retaguarda. Toque em Sincronizar agora para reprocessar com seguranca.";
  }

  return "Existe item pendente com falha na fila local. Veja o erro tecnico abaixo e tente sincronizar novamente.";
}

function PhotoButton(props: {
  type: PhotoType;
  done: boolean;
  disabled?: boolean;
  helperText?: string;
  onPress: (type: PhotoType) => void;
}) {
  return (
    <TouchableOpacity
      disabled={props.disabled}
      style={[styles.photoButton, props.done ? styles.photoDone : null, props.disabled && !props.done ? styles.photoDisabled : null]}
      onPress={() => props.onPress(props.type)}
    >
      <Text style={styles.photoTitle}>{photoLabels[props.type]}</Text>
      <Text style={styles.photoState}>{props.done ? "capturada" : props.helperText ?? "obrigatoria"}</Text>
    </TouchableOpacity>
  );
}

function StatusPill(props: { status: string }) {
  const label =
    props.status === "completed"
      ? "concluida"
      : props.status === "in_progress"
        ? "em atendimento"
        : props.status === "skipped"
          ? "pulado"
        : props.status === "not_completed"
          ? "nao concluida"
          : props.status === "canceled"
            ? "cancelada"
            : "pendente";

  return (
    <Text
      style={[
        styles.pill,
        props.status === "completed" ? styles.pillOk : null,
        props.status === "in_progress" ? styles.pillWarn : null,
        props.status === "skipped" ? styles.pillMuted : null
      ]}
    >
      {label}
    </Text>
  );
}

function MiniPill(props: { label: string; done: boolean }) {
  return <Text style={[styles.miniPill, props.done ? styles.miniPillDone : null]}>{props.label}</Text>;
}

function QuestionToggle(props: { label: string; value: boolean | null; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={[styles.questionCard, props.disabled ? styles.questionCardDisabled : null]}>
      <Text style={styles.questionLabel}>{props.label}</Text>
      <View style={styles.questionActions}>
        <TouchableOpacity
          disabled={props.disabled}
          style={[styles.answerButton, props.value === true ? styles.answerButtonYes : null, props.disabled ? styles.answerButtonDisabled : null]}
          onPress={() => props.onChange(true)}
        >
          <Text style={[styles.answerButtonText, props.value === true ? styles.answerButtonTextActive : null]}>Sim</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={props.disabled}
          style={[styles.answerButton, props.value === false ? styles.answerButtonNo : null, props.disabled ? styles.answerButtonDisabled : null]}
          onPress={() => props.onChange(false)}
        >
          <Text style={[styles.answerButtonText, props.value === false ? styles.answerButtonTextActive : null]}>Nao</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
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
  contentCompact: {
    padding: 12,
    gap: 10
  },
  contentTablet: {
    alignSelf: "center",
    maxWidth: 860,
    width: "100%"
  },
  loginPanel: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 14
  },
  loginPanelCompact: {
    justifyContent: "flex-start",
    padding: 16,
    paddingTop: 28
  },
  loginPanelTablet: {
    alignSelf: "center",
    maxWidth: 620,
    width: "100%"
  },
  mobileBrand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginBottom: 8
  },
  mobileBrandCompact: {
    gap: 10
  },
  mobileBrandIcon: {
    borderRadius: 22,
    height: 72,
    resizeMode: "contain",
    width: 72
  },
  mobileBrandIconCompact: {
    borderRadius: 18,
    height: 58,
    width: 58
  },
  mobileBrandTitle: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1
  },
  mobileBrandTitleCompact: {
    fontSize: 24
  },
  mobileBrandSubtitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: 3
  },
  releaseRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  releaseChip: {
    alignSelf: "flex-start",
    backgroundColor: "#DBEAFE",
    borderColor: "#BFDBFE",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  releaseChipSoft: {
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE"
  },
  releaseChipText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900"
  },
  releaseChipSoftText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
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
    minHeight: 96,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 12
  },
  headerCompact: {
    minHeight: 88,
    paddingHorizontal: 12,
    paddingTop: 22
  },
  headerBrandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  headerBrandRowTablet: {
    alignSelf: "center",
    maxWidth: 860,
    width: "100%"
  },
  headerIcon: {
    borderRadius: 14,
    height: 44,
    resizeMode: "contain",
    width: 44
  },
  headerIconCompact: {
    borderRadius: 12,
    height: 38,
    width: 38
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
  headerVersionText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900"
  },
  headerTitleCompact: {
    fontSize: 19,
    lineHeight: 23
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  backButtonCompact: {
    borderRadius: 14,
    minHeight: 40,
    paddingHorizontal: 12
  },
  backButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  headerExitButton: {
    alignItems: "center",
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16
  },
  headerExitButtonCompact: {
    borderRadius: 14,
    minHeight: 40,
    paddingHorizontal: 12
  },
  headerExitButtonText: {
    color: "#BE123C",
    fontSize: 14,
    fontWeight: "900"
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 16,
    paddingBottom: 4
  },
  toolbarCompact: {
    paddingHorizontal: 12
  },
  toolbarTablet: {
    alignSelf: "center",
    maxWidth: 860,
    width: "100%"
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
  titleCompact: {
    fontSize: 29
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
    minHeight: 50,
    padding: 14,
    alignItems: "center"
  },
  secondaryButtonDanger: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3"
  },
  buttonGrow: {
    flex: 1,
    minWidth: 150
  },
  secondaryText: {
    color: "#0F172A",
    fontWeight: "900"
  },
  secondaryTextDanger: {
    color: "#BE123C"
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
    width: "100%",
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
    minWidth: 0,
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
  screenCard: {
    margin: 16,
    marginBottom: 8
  },
  screenCardTablet: {
    alignSelf: "center",
    maxWidth: 860,
    width: "100%"
  },
  syncMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12
  },
  syncMetaCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  syncMetaLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  syncMetaValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4
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
  pillMuted: {
    backgroundColor: "#E2E8F0",
    color: "#475569"
  },
  stepGrid: {
    gap: 10
  },
  stepGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4
  },
  sectionBadge: {
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 18,
    minWidth: 84,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  sectionBadgeValue: {
    color: "#1D4ED8",
    fontSize: 20,
    fontWeight: "900"
  },
  sectionBadgeLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800"
  },
  progressBar: {
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#10B981",
    borderRadius: 999,
    height: "100%"
  },
  supplierGrid: {
    gap: 10
  },
  supplierCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  supplierCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  supplierCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  supplierTextBlock: {
    flex: 1,
    gap: 3
  },
  supplierName: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900"
  },
  supplierMeta: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700"
  },
  supplierChecklist: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  miniPill: {
    alignSelf: "flex-start",
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  miniPillDone: {
    backgroundColor: "#D1FAE5",
    color: "#047857"
  },
  questionGrid: {
    gap: 10
  },
  questionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  questionCardDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    opacity: 0.78
  },
  questionLabel: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800"
  },
  questionActions: {
    flexDirection: "row",
    gap: 10
  },
  answerButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  answerButtonYes: {
    backgroundColor: "#D1FAE5",
    borderColor: "#10B981"
  },
  answerButtonNo: {
    backgroundColor: "#FDECEC",
    borderColor: "#F87171"
  },
  answerButtonDisabled: {
    backgroundColor: "#E2E8F0",
    borderColor: "#CBD5E1"
  },
  answerButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900"
  },
  answerButtonTextActive: {
    color: "#0F172A"
  },
  actionStack: {
    gap: 10
  },
  photoButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderWidth: 1,
    borderRadius: 22,
    flexGrow: 1,
    minWidth: 170,
    padding: 18
  },
  photoDone: {
    borderColor: "#10B981",
    backgroundColor: "#D1FAE5"
  },
  photoDisabled: {
    backgroundColor: "#E2E8F0",
    borderColor: "#CBD5E1",
    opacity: 0.7
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
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
    margin: 16,
    marginBottom: 10,
    padding: 18
  },
  homeHeroCompact: {
    borderRadius: 24,
    margin: 12,
    padding: 14
  },
  homeHeroTablet: {
    alignSelf: "center",
    maxWidth: 860,
    width: "100%"
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
    marginTop: 6,
    maxWidth: 560
  },
  heroSubtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 420
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  heroMetaPill: {
    alignSelf: "flex-start",
    backgroundColor: "#1E3A8A",
    borderColor: "#3B82F6",
    borderRadius: 999,
    borderWidth: 1,
    color: "#DBEAFE",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 7
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
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16
  },
  statsGridCompact: {
    paddingHorizontal: 12
  },
  statsGridTablet: {
    alignSelf: "center",
    maxWidth: 860,
    width: "100%"
  },
  statTile: {
    borderRadius: 22,
    flex: 1,
    minWidth: 105,
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
