import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://promotores-2026-api.vercel.app',
);

const appVersionLabel = 'APK Flutter v1.1.10 (build 13)';
const brandBlue = Color(0xFF2563EB);
const brandNavy = Color(0xFF0F172A);
const brandGreen = Color(0xFF10B981);
const surface = Color(0xFFF8FAFC);
const line = Color(0xFFE2E8F0);
const _keepValue = Object();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final repository = AppRepository();
  await repository.init();
  runApp(PromotorProApp(repository: repository));
}

class PromotorProApp extends StatefulWidget {
  const PromotorProApp({super.key, required this.repository});

  final AppRepository repository;

  @override
  State<PromotorProApp> createState() => _PromotorProAppState();
}

class _PromotorProAppState extends State<PromotorProApp> {
  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
  Session? session;
  List<RouteItemView> routeItems = [];
  QueueSummary queueSummary = const QueueSummary(pending: 0, failed: 0);
  String message = 'Inicializando aplicativo...';
  bool busy = false;
  Timer? heartbeatTimer;

  @override
  void initState() {
    super.initState();
    _loadInitialState();
  }

  @override
  void dispose() {
    heartbeatTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadInitialState() async {
    final storedSession = await widget.repository.getSession();
    final items = await widget.repository.listRouteItems();
    final summary = await widget.repository.getQueueSummary();
    if (!mounted) return;
    setState(() {
      session = storedSession;
      routeItems = items;
      queueSummary = summary;
      message = storedSession == null
          ? 'Faca o primeiro login com internet para baixar seu roteiro.'
          : 'Sessao local carregada. O app pode trabalhar offline.';
    });
    _restartHeartbeat();
  }

  Future<void> _reload({String? nextMessage}) async {
    final items = await widget.repository.listRouteItems();
    final summary = await widget.repository.getQueueSummary();
    if (!mounted) return;
    setState(() {
      routeItems = items;
      queueSummary = summary;
      if (nextMessage != null) message = nextMessage;
    });
    _restartHeartbeat();
  }

  void _restartHeartbeat() {
    heartbeatTimer?.cancel();
    final currentSession = session;
    if (currentSession == null || !routeItems.any((item) => !item.isDone)) {
      return;
    }

    Future<void> send() async {
      try {
        await widget.repository.sendHeartbeat(currentSession.accessToken);
      } catch (_) {
        // Heartbeat must never block the field workflow.
      }
    }

    unawaited(send());
    heartbeatTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => unawaited(send()),
    );
  }

  Future<void> _handleLogin(String email, String password) async {
    setState(() {
      busy = true;
      message = 'Validando usuario e baixando roteiro...';
    });

    try {
      final result = await widget.repository.login(email, password);
      if (result.user.role != 'PROMOTOR') {
        throw Exception('Este aplicativo e exclusivo para usuario PROMOTOR.');
      }

      final snapshot = await widget.repository.downloadSnapshot(
        result.accessToken,
      );
      await widget.repository.saveSession(result);
      await widget.repository.saveSnapshot(snapshot);
      if (!mounted) return;
      setState(() {
        session = result;
        message =
            'Roteiro salvo no aparelho: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s).';
      });
      await _reload();
    } catch (error) {
      if (!mounted) return;
      setState(() => message = normalizedError(error));
      _showError('Nao foi possivel entrar', normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _refreshRoute() async {
    final currentSession = session;
    if (currentSession == null) return;

    setState(() {
      busy = true;
      message = 'Atualizando roteiro...';
    });

    try {
      final snapshot = await widget.repository.downloadSnapshot(
        currentSession.accessToken,
      );
      await widget.repository.saveSnapshot(snapshot);
      await _reload(
        nextMessage:
            'Roteiro atualizado: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s).',
      );
    } catch (error) {
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _syncNow() async {
    final currentSession = session;
    if (currentSession == null) return;
    setState(() {
      busy = true;
      message = 'Sincronizando fila local...';
    });

    try {
      final result = await widget.repository.syncPending(
        currentSession.accessToken,
      );
      await _refreshRoute();
      await _reload(
        nextMessage:
            'Sync concluida. Enviados: ${result.synced}. Falhas: ${result.failed}.',
      );
    } catch (error) {
      await _reload(nextMessage: normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<T?> _pushPage<T>(Widget page) async {
    final navigator = navigatorKey.currentState;
    if (navigator == null) {
      throw Exception(
        'A navegacao do aplicativo ainda nao esta pronta. Feche e abra o app novamente.',
      );
    }
    return navigator.push<T>(MaterialPageRoute(builder: (_) => page));
  }

  void _showError(String title, String text) {
    final dialogContext = navigatorKey.currentContext;
    if (dialogContext == null) {
      debugPrint('Falha ao abrir dialogo: $title - $text');
      return;
    }
    showDialog<void>(
      context: dialogContext,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(text),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      title: 'PromotorPro',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: surface,
        colorScheme: ColorScheme.fromSeed(
          seedColor: brandBlue,
          primary: brandBlue,
        ),
        fontFamily: 'Roboto',
      ),
      home: session == null
          ? LoginPage(busy: busy, message: message, onLogin: _handleLogin)
          : HomePage(
              session: session!,
              routeItems: routeItems,
              queueSummary: queueSummary,
              message: message,
              busy: busy,
              onRefresh: _refreshRoute,
              onSync: _syncNow,
              onOpenSync: () => unawaited(
                _pushPage(
                  SyncPage(
                    repository: widget.repository,
                    promoterName: session!.user.name,
                    onSync: _syncNow,
                    onChanged: _reload,
                  ),
                ),
              ),
              onOpenVisit: (item) async {
                if (busy) return;
                setState(() {
                  busy = true;
                  message = 'Abrindo atendimento de ${item.navigationName}...';
                });
                try {
                  final resultMessage = await _pushPage<String>(
                    VisitPage(
                      repository: widget.repository,
                      item: item,
                      promoterName: session!.user.name,
                    ),
                  );
                  await _reload(nextMessage: resultMessage);
                } catch (error, stackTrace) {
                  debugPrint(
                    'Falha ao abrir atendimento ${item.id}: $error\n$stackTrace',
                  );
                  if (!mounted) return;
                  setState(
                    () => message =
                        'Nao foi possivel abrir o cliente ${item.navigationName}. ${normalizedError(error)}',
                  );
                  _showError('Falha ao abrir cliente', normalizedError(error));
                } finally {
                  if (mounted) {
                    setState(() => busy = false);
                  }
                }
              },
              onLogout: () async {
                heartbeatTimer?.cancel();
                await widget.repository.clearSessionOnly();
                if (!mounted) return;
                setState(() {
                  session = null;
                  message = 'Sessao encerrada neste aparelho.';
                });
              },
            ),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.busy,
    required this.message,
    required this.onLogin,
  });

  final bool busy;
  final String message;
  final Future<void> Function(String email, String password) onLogin;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 40),
          const BrandHeader(
            title: 'Operacao de campo',
            subtitle: 'PromotorPro Flutter',
          ),
          const SizedBox(height: 28),
          InfoCard(
            title: 'Primeiro acesso',
            body:
                'Entre com internet para baixar roteiro e clientes. Depois o atendimento funciona offline.',
          ),
          const SizedBox(height: 18),
          TextField(
            controller: emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'E-mail do promotor',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: passwordController,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Senha',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: widget.busy ? 'Entrando...' : 'Entrar e baixar roteiro',
            onPressed: widget.busy
                ? null
                : () => widget.onLogin(
                    emailController.text,
                    passwordController.text,
                  ),
          ),
          const SizedBox(height: 14),
          MessageBox(message: widget.message),
          const SizedBox(height: 12),
          const Text(
            appVersionLabel,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
    required this.session,
    required this.routeItems,
    required this.queueSummary,
    required this.message,
    required this.busy,
    required this.onRefresh,
    required this.onSync,
    required this.onOpenSync,
    required this.onOpenVisit,
    required this.onLogout,
  });

  final Session session;
  final List<RouteItemView> routeItems;
  final QueueSummary queueSummary;
  final String message;
  final bool busy;
  final VoidCallback onRefresh;
  final VoidCallback onSync;
  final VoidCallback onOpenSync;
  final Future<void> Function(RouteItemView item) onOpenVisit;
  final VoidCallback onLogout;

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await confirmAction(
      context,
      title: 'Sair do aplicativo',
      body:
          'Deseja encerrar a sessao neste aparelho agora? O roteiro offline fica salvo, mas sera necessario entrar novamente para sincronizar.',
      confirmLabel: 'Sair agora',
    );
    if (confirmed == true) {
      onLogout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final pendingItems = routeItems.where((item) => !item.isDone).toList();
    final completedItems = routeItems.where((item) => item.isDone).length;
    return DefaultTabController(
      length: 2,
      child: AppShell(
        child: Column(
          children: [
            AppTopBar(
              title: 'Roteiro do promotor',
              subtitle: 'Promotor: ${session.user.name}',
              onLogout: () => unawaited(_confirmLogout(context)),
            ),
            Container(
              color: brandNavy,
              child: const TabBar(
                indicatorColor: brandGreen,
                indicatorWeight: 4,
                labelColor: Colors.white,
                unselectedLabelColor: Color(0xFFCBD5E1),
                labelStyle: TextStyle(fontWeight: FontWeight.w900),
                tabs: [
                  Tab(icon: Icon(Icons.list_alt), text: 'Roteiro'),
                  Tab(icon: Icon(Icons.map), text: 'Mapa'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  RefreshIndicator(
                    onRefresh: () async => onRefresh(),
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        DashboardGrid(
                          cards: [
                            MetricData(
                              'Clientes liberados',
                              routeItems.length.toString(),
                              Icons.storefront,
                            ),
                            MetricData(
                              'Pendentes',
                              pendingItems.length.toString(),
                              Icons.route,
                            ),
                            MetricData(
                              'Atendidos',
                              completedItems.toString(),
                              Icons.verified,
                            ),
                            MetricData(
                              'Fila sync',
                              '${queueSummary.pending}',
                              Icons.sync,
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        OperatorIdentityCard(
                          promoterName: session.user.name,
                          promoterEmail: session.user.email,
                          versionLabel: appVersionLabel,
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: SecondaryButton(
                                label: 'Atualizar roteiro',
                                onPressed: busy ? null : onRefresh,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: PrimaryButton(
                                label: busy ? 'Aguarde...' : 'Sync',
                                onPressed: busy ? null : onSync,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        SecondaryButton(
                          label: 'Ver fila de sincronizacao',
                          onPressed: onOpenSync,
                        ),
                        const SizedBox(height: 10),
                        DangerButton(
                          label: 'Sair do app',
                          onPressed: busy
                              ? null
                              : () => unawaited(_confirmLogout(context)),
                        ),
                        const SizedBox(height: 14),
                        MessageBox(message: message),
                        const SizedBox(height: 16),
                        Text(
                          'Clientes para atendimento',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 10),
                        if (pendingItems.isEmpty)
                          const EmptyState(
                            title: 'Nenhum cliente pendente',
                            body:
                                'Quando uma rota for publicada para este promotor, os clientes aparecem aqui.',
                          )
                        else
                          ...pendingItems.map(
                            (item) => RouteItemCard(
                              item: item,
                              onTap: () => onOpenVisit(item),
                            ),
                          ),
                      ],
                    ),
                  ),
                  RouteMapTab(items: pendingItems),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class VisitPage extends StatefulWidget {
  const VisitPage({
    super.key,
    required this.repository,
    required this.item,
    required this.promoterName,
  });

  final AppRepository repository;
  final RouteItemView item;
  final String promoterName;

  @override
  State<VisitPage> createState() => _VisitPageState();
}

class _VisitPageState extends State<VisitPage> {
  ClientSnapshot? client;
  LocalVisit? visit;
  List<LocalSupplierExecution> supplierExecutions = [];
  List<LocalPhoto> photos = [];
  final notesController = TextEditingController();
  final supplierNotesController = TextEditingController();
  String? activeSupplierId;
  bool? deliveryReceived;
  bool? productsReplenished;
  bool? stockoutFound;
  bool busy = false;
  String message = 'Pronto para iniciar atendimento.';

  List<SupplierSnapshot> get clientSuppliers =>
      suppliersFromPayload(client?.payload);
  List<LocalPhoto> get visitLevelPhotos =>
      photos.where((photo) => photo.supplierExecutionLocalId == null).toList();
  Set<String> get visitPhotoTypes =>
      visitLevelPhotos.map((photo) => photo.type).toSet();
  bool get legacyFlowEnabled => clientSuppliers.isEmpty;
  bool get hasCheckin => visitPhotoTypes.contains('checkin');
  bool get hasBefore => visitPhotoTypes.contains('before');
  bool get hasAfter => visitPhotoTypes.contains('after');
  bool get hasCheckout => visitPhotoTypes.contains('checkout');
  bool get requiredReady => legacyFlowEnabled
      ? hasCheckin && hasBefore && hasAfter && hasCheckout
      : hasCheckin && hasCheckout;
  LocalSupplierExecution? get activeSupplierExecution =>
      findSupplierExecution(supplierExecutions, activeSupplierId);
  SupplierSnapshot? get activeSupplier =>
      supplierById(clientSuppliers, activeSupplierId);
  List<SupplierSnapshot> get incompleteSuppliers => clientSuppliers.where((
    supplier,
  ) {
    final execution = findSupplierExecution(supplierExecutions, supplier.id);
    return execution == null || execution.status != 'completed';
  }).toList();
  bool get allSuppliersCompleted =>
      legacyFlowEnabled || incompleteSuppliers.isEmpty;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    notesController.dispose();
    supplierNotesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final currentVisit = await widget.repository.getVisitByRouteItem(
        widget.item.id,
      );
      final currentClient = await widget.repository.getClientSnapshot(
        widget.item.clientId,
      );
      if (currentClient == null) {
        throw Exception(
          'Cliente nao encontrado no aparelho. Atualize o roteiro e tente novamente.',
        );
      }
      final currentPhotos = currentVisit == null
          ? <LocalPhoto>[]
          : await widget.repository.listPhotos(currentVisit.localId);
      final currentSupplierExecutions = currentVisit == null
          ? <LocalSupplierExecution>[]
          : await widget.repository.listSupplierExecutions(
              currentVisit.localId,
            );
      if (!mounted) return;

      final selectedExecution = findSupplierExecution(
        currentSupplierExecutions,
        activeSupplierId,
      );

      setState(() {
        client = currentClient;
        visit = currentVisit;
        photos = currentPhotos;
        supplierExecutions = currentSupplierExecutions;
        notesController.text = currentVisit?.notes ?? '';
        if (selectedExecution != null) {
          supplierNotesController.text = selectedExecution.notes ?? '';
          deliveryReceived = selectedExecution.deliveryReceived;
          productsReplenished = selectedExecution.productsReplenished;
          stockoutFound = selectedExecution.stockoutFound;
        } else {
          activeSupplierId = null;
          supplierNotesController.clear();
          deliveryReceived = null;
          productsReplenished = null;
          stockoutFound = null;
        }
        message = currentVisit == null
            ? 'Inicie o atendimento para liberar as evidencias.'
            : currentVisit.status == 'completed'
            ? 'Atendimento concluido localmente. Sincronize quando houver internet.'
            : 'Atendimento salvo localmente.';
      });
    } catch (error, stackTrace) {
      debugPrint(
        'Falha ao carregar atendimento ${widget.item.id}: $error\n$stackTrace',
      );
      if (!mounted) return;
      setState(() {
        client = null;
        visit = null;
        photos = const <LocalPhoto>[];
        supplierExecutions = const <LocalSupplierExecution>[];
        activeSupplierId = null;
        supplierNotesController.clear();
        deliveryReceived = null;
        productsReplenished = null;
        stockoutFound = null;
        message =
            'Nao foi possivel abrir este cliente agora. ${normalizedError(error)}';
      });
    }
  }

  Future<void> _startVisit() async {
    setState(() => busy = true);
    try {
      final created = await widget.repository.startVisit(widget.item);
      await _load();
      setState(
        () => message = legacyFlowEnabled
            ? 'Atendimento iniciado offline. Primeiro capture o check-in para liberar as demais evidencias.'
            : 'Atendimento iniciado offline. Primeiro capture o check-in para liberar os fornecedores.',
      );
      unawaited(widget.repository.sendHeartbeatFromVisit(created));
    } catch (error) {
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _openSupplierExecution(SupplierSnapshot supplier) async {
    final currentVisit = visit;
    if (currentVisit == null) {
      setState(() {
        message = 'Inicie o atendimento antes de registrar o fornecedor.';
      });
      return;
    }

    if (!hasCheckin) {
      setState(() {
        message =
            'Check-in obrigatorio: registre a chegada no cliente antes de executar o fornecedor.';
      });
      return;
    }

    setState(() => busy = true);
    try {
      final execution = await widget.repository.ensureSupplierExecution(
        currentVisit,
        supplier.id,
      );
      if (!mounted) return;
      setState(() {
        activeSupplierId = supplier.id;
        supplierNotesController.text = execution.notes ?? '';
        deliveryReceived = execution.deliveryReceived;
        productsReplenished = execution.productsReplenished;
        stockoutFound = execution.stockoutFound;
        message =
            'Fornecedor ${supplierLabel(supplier)} aberto. Informe entrega e registre as fotos obrigatorias.';
      });
      await _load();
    } catch (error) {
      if (!mounted) return;
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _saveSupplierDraft({
    bool? nextDeliveryReceived,
    bool? nextProductsReplenished,
    bool? nextStockoutFound,
    String? nextNotes,
  }) async {
    final currentVisit = visit;
    final supplier = activeSupplier;
    if (currentVisit == null || supplier == null) {
      return;
    }

    if (!hasCheckin) {
      setState(
        () => message =
            'Check-in obrigatorio: registre a chegada no cliente antes de responder o fornecedor.',
      );
      return;
    }

    final execution =
        activeSupplierExecution ??
        await widget.repository.ensureSupplierExecution(
          currentVisit,
          supplier.id,
        );

    final effectiveDelivery = nextDeliveryReceived ?? deliveryReceived;
    final normalizedProducts = effectiveDelivery == false
        ? false
        : nextProductsReplenished ?? productsReplenished;
    final normalizedStockout = effectiveDelivery == false
        ? false
        : nextStockoutFound ?? stockoutFound;

    final nextExecution = execution.copyWith(
      status: execution.status == 'pending' ? 'in_progress' : execution.status,
      deliveryReceived: effectiveDelivery,
      productsReplenished: normalizedProducts,
      stockoutFound: normalizedStockout,
      notes: nextNotes ?? supplierNotesController.text,
      syncStatus: 'pending',
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );

    await widget.repository.saveSupplierExecution(nextExecution);
    await _load();
  }

  Future<void> _completeSupplierExecution() async {
    final supplier = activeSupplier;
    final execution = activeSupplierExecution;
    if (supplier == null || execution == null) {
      setState(() => message = 'Selecione um fornecedor para concluir.');
      return;
    }

    if (!hasCheckin) {
      setState(
        () => message =
            'Check-in obrigatorio: registre a chegada no cliente antes de concluir fornecedor.',
      );
      return;
    }

    if (deliveryReceived == null) {
      setState(
        () => message =
            'Informe primeiro se o fornecedor ${supplierLabel(supplier)} recebeu mercadoria.',
      );
      return;
    }

    final executionPhotos = photos
        .where((photo) => photo.supplierExecutionLocalId == execution.localId)
        .toList();
    final executionTypes = executionPhotos.map((photo) => photo.type).toSet();
    final requiresDeliveryFlow = supplierRequiresDeliveryFlow(deliveryReceived);
    final notes = supplierNotesController.text.trim();

    if (supplierExecutionRequiresJustification(
          deliveryReceived: deliveryReceived,
          stockoutFound: stockoutFound,
        ) &&
        notes.length < 5) {
      setState(
        () => message =
            'Explique na observacao o motivo da falta de entrega ou ruptura do fornecedor ${supplierLabel(supplier)}.',
      );
      return;
    }

    if (requiresDeliveryFlow &&
        (!executionTypes.contains('supplier_before') ||
            !executionTypes.contains('supplier_after'))) {
      setState(
        () => message =
            'Conclua o fornecedor ${supplierLabel(supplier)} com foto antes e foto depois.',
      );
      return;
    }

    if (requiresDeliveryFlow) {
      CategorySnapshot? missingCategory;
      for (final category in supplier.categories) {
        final hasEvidence = executionPhotos.any(
          (photo) =>
              photo.categoryId == category.id ||
              photo.categoryName == category.displayName,
        );
        if (!hasEvidence) {
          missingCategory = category;
          break;
        }
      }

      if (missingCategory != null) {
        final categoryName = missingCategory.displayName;
        setState(
          () => message =
              'Categoria $categoryName precisa de foto de evidencia antes de concluir o fornecedor.',
        );
        return;
      }

      ActivitySnapshot? missingActivity;
      for (final activity in activitiesForSupplier(supplier, client)) {
        final hasEvidence = executionPhotos.any(
          (photo) =>
              photo.activityId == activity.id ||
              photo.activityName == activity.displayName,
        );
        if (!hasEvidence) {
          missingActivity = activity;
          break;
        }
      }

      if (missingActivity != null) {
        final activityName = missingActivity.displayName;
        setState(
          () => message =
              'Atividade $activityName precisa de foto de evidencia antes de concluir o fornecedor.',
        );
        return;
      }
    }

    if (requiresDeliveryFlow &&
        (productsReplenished == null || stockoutFound == null)) {
      setState(
        () => message =
            'Responda abastecimento e ruptura do fornecedor ${supplierLabel(supplier)} antes de concluir.',
      );
      return;
    }

    setState(() => busy = true);
    try {
      await widget.repository.saveSupplierExecution(
        execution.copyWith(
          status: 'completed',
          deliveryReceived: deliveryReceived,
          productsReplenished: requiresDeliveryFlow
              ? productsReplenished
              : false,
          stockoutFound: requiresDeliveryFlow ? stockoutFound : false,
          notes: notes,
          finishedAtDevice: DateTime.now().toUtc().toIso8601String(),
          syncStatus: 'pending',
          updatedAt: DateTime.now().toUtc().toIso8601String(),
        ),
      );
      await widget.repository.addSyncLog(
        'pending',
        'Fornecedor ${supplierLabel(supplier)} concluido offline para ${widget.item.navigationName}.',
      );
      await _load();
      if (!mounted) return;
      setState(() {
        message =
            'Fornecedor ${supplierLabel(supplier)} concluido. Agora siga para o proximo fornecedor ou finalize com check-out.';
        activeSupplierId = null;
        supplierNotesController.clear();
        deliveryReceived = null;
        productsReplenished = null;
        stockoutFound = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _capture(
    String type, {
    SupplierSnapshot? supplier,
    CategorySnapshot? category,
    ActivitySnapshot? activity,
  }) async {
    final currentVisit = visit;
    if (currentVisit == null) {
      setState(() => message = 'Inicie o atendimento antes de capturar fotos.');
      return;
    }

    if (currentVisit.status == 'completed') {
      setState(
        () => message =
            'Esta visita ja foi concluida localmente. Volte ao menu principal para sincronizar.',
      );
      return;
    }

    if (type != 'checkin' && !hasCheckin) {
      setState(
        () => message =
            'Check-in obrigatorio: tire a foto de chegada no cliente antes de iniciar o atendimento.',
      );
      return;
    }

    LocalSupplierExecution? execution;
    if (supplier != null) {
      execution = await widget.repository.ensureSupplierExecution(
        currentVisit,
        supplier.id,
      );
    }

    final scopedPhotos = photos
        .where(
          (photo) => execution == null
              ? photo.supplierExecutionLocalId == null
              : photo.supplierExecutionLocalId == execution.localId,
        )
        .toList();
    final scopedTypes = scopedPhotos.map((photo) => photo.type).toSet();

    if (execution == null &&
        type != 'occurrence_extra' &&
        scopedTypes.contains(type)) {
      setState(
        () => message =
            'A evidencia ${photoLabel(type).toLowerCase()} ja foi capturada nesta visita.',
      );
      return;
    }

    if (execution != null &&
        (type == 'supplier_before' || type == 'supplier_after') &&
        scopedTypes.contains(type)) {
      setState(
        () => message =
            'A ${photoLabel(type).toLowerCase()} do fornecedor ${supplierLabel(supplier!)} ja foi capturada.',
      );
      return;
    }

    if (execution == null && (category != null || activity != null)) {
      setState(
        () => message =
            'Selecione um fornecedor antes de registrar evidencia por categoria ou atividade.',
      );
      return;
    }

    if (execution == null && type == 'checkout' && !allSuppliersCompleted) {
      setState(
        () => message =
            'Conclua primeiro os ${incompleteSuppliers.length} fornecedor(es) pendentes antes do check-out.',
      );
      return;
    }

    setState(() => busy = true);
    try {
      await widget.repository.capturePhoto(
        currentVisit,
        type,
        supplierExecutionLocalId: execution?.localId,
        supplierId: supplier?.id,
        categoryId: category?.id,
        categoryName: category?.displayName,
        activityId: activity?.id,
        activityName: activity?.displayName,
      );
      await _load();
      setState(
        () => message = category != null
            ? 'Foto da categoria ${category.displayName} salva localmente.'
            : activity != null
            ? 'Foto da atividade ${activity.displayName} salva localmente.'
            : execution == null
            ? '${photoLabel(type)} salva localmente com data, hora e GPS quando disponivel.'
            : '${photoLabel(type)} do fornecedor ${supplierLabel(supplier!)} salva localmente.',
      );
    } catch (error) {
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _finish() async {
    final currentVisit = visit;
    if (currentVisit == null) return;
    if (!requiredReady) {
      setState(
        () => message = legacyFlowEnabled
            ? 'Obrigatorio capturar check-in, foto antes, foto depois e check-out antes de encerrar.'
            : 'Obrigatorio capturar check-in, concluir todos os fornecedores e registrar o check-out antes de encerrar.',
      );
      return;
    }

    if (!legacyFlowEnabled && !allSuppliersCompleted) {
      setState(
        () => message =
            'Ainda existem ${incompleteSuppliers.length} fornecedor(es) sem conclusao. Passe por todos antes de encerrar a visita.',
      );
      return;
    }

    setState(() => busy = true);
    try {
      await widget.repository.finishVisit(currentVisit, notesController.text);
      var resultMessage =
          'Atendimento encerrado e salvo no aparelho. Sincronize quando tiver internet.';

      final session = await widget.repository.getSession();
      if (session != null) {
        try {
          final result = await widget.repository.syncPending(
            session.accessToken,
          );
          resultMessage = result.failed == 0
              ? 'Atendimento encerrado e sincronizado com a retaguarda. Enviados: ${result.synced}.'
              : 'Atendimento encerrado, mas ${result.failed} item(ns) ficaram pendentes. Abra a fila de sincronizacao para ver o erro.';
        } catch (syncError) {
          resultMessage =
              'Atendimento encerrado e salvo localmente. Sync nao concluiu: ${normalizedError(syncError)}';
        }
      }

      if (!mounted) return;
      Navigator.pop(context, resultMessage);
    } catch (error) {
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      child: Column(
        children: [
          AppTopBar(
            title: 'Atendimento',
            subtitle: 'Promotor: ${widget.promoterName}',
            showBack: true,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ClientHero(
                  item: widget.item,
                  status: visit?.status ?? 'pendente',
                ),
                const SizedBox(height: 14),
                if (visit == null)
                  PrimaryButton(
                    label: busy ? 'Iniciando...' : 'Iniciar atendimento',
                    onPressed: busy ? null : _startVisit,
                  )
                else ...[
                  EvidenceButton(
                    label: 'Check-in com foto',
                    ok: hasCheckin,
                    onPressed: busy ? null : () => _capture('checkin'),
                  ),
                  if (!hasCheckin)
                    const InfoCard(
                      title: 'Check-in obrigatorio',
                      body:
                          'O atendimento so e liberado depois da foto de check-in, que comprova a chegada do promotor no cliente.',
                    )
                  else ...[
                    EvidenceButton(
                      label: 'Check-out com foto',
                      ok: hasCheckout,
                      onPressed: busy
                          ? null
                          : allSuppliersCompleted
                          ? () => _capture('checkout')
                          : null,
                    ),
                    if (legacyFlowEnabled) ...[
                      EvidenceButton(
                        label: 'Foto antes',
                        ok: hasBefore,
                        onPressed: busy ? null : () => _capture('before'),
                      ),
                      EvidenceButton(
                        label: 'Foto depois',
                        ok: hasAfter,
                        onPressed: busy ? null : () => _capture('after'),
                      ),
                    ],
                    if (!legacyFlowEnabled) ...[
                      const SizedBox(height: 8),
                      InfoCard(
                        title: 'Execucao por fornecedor',
                        body:
                            'Conclua ${clientSuppliers.length} fornecedor(es) deste cliente. Se nao houve entrega, marque "Nao" em recebeu mercadoria para liberar a conclusao sem fotos do fornecedor.',
                      ),
                      const SizedBox(height: 12),
                      ...clientSuppliers.map((supplier) {
                        final supplierActivities = activitiesForSupplier(
                          supplier,
                          client,
                        );
                        final execution = findSupplierExecution(
                          supplierExecutions,
                          supplier.id,
                        );
                        final executionPhotos = execution == null
                            ? <LocalPhoto>[]
                            : photos
                                  .where(
                                    (photo) =>
                                        photo.supplierExecutionLocalId ==
                                        execution.localId,
                                  )
                                  .toList();
                        final executionTypes = executionPhotos
                            .map((photo) => photo.type)
                            .toSet();
                        final categoryEvidenceCount = executionPhotos
                            .where((photo) => photo.categoryId != null)
                            .length;
                        return SupplierExecutionTile(
                          supplier: supplier,
                          activityCount: supplierActivities.length,
                          categoryCount: supplier.categories.length,
                          categoryEvidenceCount: categoryEvidenceCount,
                          status: execution?.status ?? 'pending',
                          hasBefore: executionTypes.contains('supplier_before'),
                          hasAfter: executionTypes.contains('supplier_after'),
                          deliveryReceivedAnswered:
                              execution?.deliveryReceived != null,
                          productsReplenishedAnswered:
                              execution?.productsReplenished != null,
                          stockoutFoundAnswered:
                              execution?.stockoutFound != null,
                          active: activeSupplierId == supplier.id,
                          onTap: busy
                              ? null
                              : () => _openSupplierExecution(supplier),
                        );
                      }),
                      const SizedBox(height: 12),
                      if (activeSupplier != null &&
                          activeSupplierExecution != null)
                        SupplierExecutionEditor(
                          supplier: activeSupplier!,
                          activities: activitiesForSupplier(
                            activeSupplier!,
                            client,
                          ),
                          categories: activeSupplier!.categories,
                          categoryEvidenceCounts: {
                            for (final category in activeSupplier!.categories)
                              category.id: photos
                                  .where(
                                    (photo) =>
                                        photo.supplierExecutionLocalId ==
                                            activeSupplierExecution!.localId &&
                                        photo.categoryId == category.id,
                                  )
                                  .length,
                          },
                          activityEvidenceCounts: {
                            for (final activity in activitiesForSupplier(
                              activeSupplier!,
                              client,
                            ))
                              activity.id: photos
                                  .where(
                                    (photo) =>
                                        photo.supplierExecutionLocalId ==
                                            activeSupplierExecution!.localId &&
                                        photo.activityId == activity.id,
                                  )
                                  .length,
                          },
                          hasBefore: photos.any(
                            (photo) =>
                                photo.supplierExecutionLocalId ==
                                    activeSupplierExecution!.localId &&
                                photo.type == 'supplier_before',
                          ),
                          hasAfter: photos.any(
                            (photo) =>
                                photo.supplierExecutionLocalId ==
                                    activeSupplierExecution!.localId &&
                                photo.type == 'supplier_after',
                          ),
                          deliveryReceived: deliveryReceived,
                          productsReplenished: productsReplenished,
                          stockoutFound: stockoutFound,
                          notesController: supplierNotesController,
                          busy: busy,
                          onCaptureBefore: () => _capture(
                            'supplier_before',
                            supplier: activeSupplier!,
                          ),
                          onCaptureAfter: () => _capture(
                            'supplier_after',
                            supplier: activeSupplier!,
                          ),
                          onCaptureCategory: (category) => _capture(
                            'store_extra',
                            supplier: activeSupplier!,
                            category: category,
                          ),
                          onCaptureActivity: (activity) => _capture(
                            'store_extra',
                            supplier: activeSupplier!,
                            activity: activity,
                          ),
                          onDeliveryChanged: (value) async {
                            setState(() {
                              deliveryReceived = value;
                              if (value == false) {
                                productsReplenished = false;
                                stockoutFound = false;
                              }
                            });
                            await _saveSupplierDraft(
                              nextDeliveryReceived: value,
                              nextProductsReplenished: value == false
                                  ? false
                                  : productsReplenished,
                              nextStockoutFound: value == false
                                  ? false
                                  : stockoutFound,
                            );
                          },
                          onProductsChanged: (value) async {
                            setState(() => productsReplenished = value);
                            await _saveSupplierDraft(
                              nextProductsReplenished: value,
                            );
                          },
                          onStockoutChanged: (value) async {
                            setState(() => stockoutFound = value);
                            await _saveSupplierDraft(nextStockoutFound: value);
                          },
                          onNotesChanged: (value) async {
                            await _saveSupplierDraft(nextNotes: value);
                          },
                          onComplete: _completeSupplierExecution,
                          onClose: () {
                            setState(() {
                              activeSupplierId = null;
                              supplierNotesController.clear();
                              deliveryReceived = null;
                              productsReplenished = null;
                              stockoutFound = null;
                            });
                          },
                        )
                      else
                        const InfoCard(
                          title: 'Selecione um fornecedor',
                          body:
                              'Toque em um fornecedor para responder entrega, registrar foto antes e foto depois quando houver mercadoria, e concluir esse atendimento.',
                        ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: notesController,
                      minLines: 3,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Observacoes da execucao',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    PrimaryButton(
                      label: 'Encerrar visita',
                      onPressed: busy ? null : _finish,
                    ),
                  ],
                ],
                const SizedBox(height: 14),
                MessageBox(message: message),
                const SizedBox(height: 14),
                Text(
                  'Evidencias locais',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                if (photos.isEmpty) const Text('Nenhuma foto capturada ainda.'),
                ...photos.map(
                  (photo) =>
                      PhotoTile(photo: photo, suppliers: clientSuppliers),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SyncPage extends StatefulWidget {
  const SyncPage({
    super.key,
    required this.repository,
    required this.promoterName,
    required this.onSync,
    required this.onChanged,
  });

  final AppRepository repository;
  final String promoterName;
  final Future<void> Function() onSync;
  final Future<void> Function({String? nextMessage}) onChanged;

  @override
  State<SyncPage> createState() => _SyncPageState();
}

class _SyncPageState extends State<SyncPage> {
  List<QueueDiagnostic> diagnostics = [];
  List<SyncLog> logs = [];
  QueueSummary summary = const QueueSummary(pending: 0, failed: 0);
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final nextDiagnostics = await widget.repository.listQueueDiagnostics();
    final nextLogs = await widget.repository.listSyncLogs();
    final nextSummary = await widget.repository.getQueueSummary();
    if (!mounted) return;
    setState(() {
      diagnostics = nextDiagnostics;
      logs = nextLogs;
      summary = nextSummary;
    });
  }

  Future<void> _sync() async {
    setState(() => busy = true);
    await widget.onSync();
    await _load();
    if (mounted) setState(() => busy = false);
  }

  Future<void> _clearLocalData() async {
    final confirmed = await confirmAction(
      context,
      title: 'Limpar dados locais',
      body:
          'Deseja realmente apagar roteiro, fila de sincronizacao, visitas e fotos salvas neste aparelho? Esta acao nao pode ser desfeita.',
      confirmLabel: 'Limpar agora',
    );
    if (confirmed != true) {
      return;
    }
    await widget.repository.clearLocalOperationalData();
    await widget.onChanged(
      nextMessage: 'Dados locais operacionais limpos neste aparelho.',
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      child: Column(
        children: [
          AppTopBar(
            title: 'Sincronizacao',
            subtitle: 'Promotor: ${widget.promoterName}',
            showBack: true,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                InfoCard(
                  title: 'Fila local persistente',
                  body:
                      '${summary.pending} pendente(s)\n${summary.failed} falha(s)',
                ),
                const SizedBox(height: 12),
                PrimaryButton(
                  label: busy ? 'Sincronizando...' : 'Sincronizar agora',
                  onPressed: busy ? null : _sync,
                ),
                const SizedBox(height: 10),
                SecondaryButton(
                  label: 'Limpar dados locais deste aparelho',
                  onPressed: _clearLocalData,
                ),
                const SizedBox(height: 14),
                Text(
                  'Critica do sincronismo',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                if (diagnostics.isEmpty)
                  const InfoCard(
                    title: 'Sem criticas',
                    body: 'Nao ha itens presos na fila local neste momento.',
                  )
                else
                  ...diagnostics.map((item) => DiagnosticCard(item: item)),
                const SizedBox(height: 14),
                Text(
                  'Logs locais',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                ...logs.map(
                  (log) => ListTile(
                    dense: true,
                    title: Text(
                      syncLabel(log.status),
                      style: TextStyle(
                        color: log.status == 'failed' ? Colors.red : brandGreen,
                      ),
                    ),
                    subtitle: Text(log.message),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AppRepository {
  final api = ApiClient(apiBaseUrl);
  final db = LocalDatabase();
  SharedPreferences? prefs;

  Future<void> init() async {
    prefs = await SharedPreferences.getInstance();
    await db.open();
  }

  Future<Session?> getSession() async {
    final raw = prefs?.getString('session');
    return raw == null
        ? null
        : Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> saveSession(Session session) async {
    await prefs?.setString('session', jsonEncode(session.toJson()));
  }

  Future<void> clearSessionOnly() async {
    await prefs?.remove('session');
  }

  Future<Session> login(String email, String password) =>
      api.login(email, password);
  Future<MobileSnapshot> downloadSnapshot(String accessToken) =>
      api.downloadSnapshot(accessToken);
  Future<void> saveSnapshot(MobileSnapshot snapshot) =>
      db.saveSnapshot(snapshot);
  Future<ClientSnapshot?> getClientSnapshot(String clientId) =>
      db.getClientSnapshot(clientId);
  Future<List<RouteItemView>> listRouteItems() => db.listRouteItems();
  Future<LocalVisit?> getVisitByRouteItem(String routeItemId) =>
      db.getVisitByRouteItem(routeItemId);
  Future<List<LocalSupplierExecution>> listSupplierExecutions(
    String visitLocalId,
  ) => db.listSupplierExecutions(visitLocalId);
  Future<List<LocalPhoto>> listPhotos(String visitLocalId) =>
      db.listPhotos(visitLocalId);
  Future<QueueSummary> getQueueSummary() => db.getQueueSummary();
  Future<List<QueueDiagnostic>> listQueueDiagnostics() =>
      db.listQueueDiagnostics();
  Future<List<SyncLog>> listSyncLogs() => db.listSyncLogs();
  Future<void> addSyncLog(String status, String message) =>
      db.addSyncLog(status, message);
  Future<void> clearLocalOperationalData() => db.clearLocalOperationalData();

  Future<LocalVisit> startVisit(RouteItemView item) async {
    final gps = await getGpsOrNull();
    final visit = LocalVisit(
      localId: const Uuid().v4(),
      clientId: item.clientId,
      routeId: item.routeId,
      routeItemId: item.id,
      status: 'in_progress',
      startedAt: DateTime.now().toUtc().toIso8601String(),
      finishedAt: null,
      gpsLatitude: gps?.latitude,
      gpsLongitude: gps?.longitude,
      notes: null,
      syncStatus: 'pending',
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );
    await db.upsertVisit(visit);
    await db.enqueue('visit', visit.localId);
    await db.addSyncLog(
      'pending',
      'Atendimento iniciado offline para ${item.navigationName}.',
    );
    return visit;
  }

  Future<LocalSupplierExecution> ensureSupplierExecution(
    LocalVisit visit,
    String supplierId,
  ) async {
    final existing = await db.getSupplierExecutionBySupplier(
      visit.localId,
      supplierId,
    );

    if (existing != null) {
      if (existing.status == 'pending' || existing.status == 'skipped') {
        final reopened = existing.copyWith(
          status: 'in_progress',
          syncStatus: 'pending',
          updatedAt: DateTime.now().toUtc().toIso8601String(),
        );
        await db.upsertSupplierExecution(reopened);
        await db.enqueue('supplierExecution', reopened.localId);
        return reopened;
      }
      return existing;
    }

    final execution = LocalSupplierExecution(
      localId: const Uuid().v4(),
      visitLocalId: visit.localId,
      clientId: visit.clientId,
      supplierId: supplierId,
      status: 'in_progress',
      startedAtDevice: DateTime.now().toUtc().toIso8601String(),
      syncStatus: 'pending',
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );
    await db.upsertSupplierExecution(execution);
    await db.enqueue('supplierExecution', execution.localId);
    return execution;
  }

  Future<void> saveSupplierExecution(LocalSupplierExecution execution) async {
    final nextExecution = execution.copyWith(
      syncStatus: 'pending',
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );
    await db.upsertSupplierExecution(nextExecution);
    await db.enqueue('supplierExecution', nextExecution.localId);
  }

  Future<void> capturePhoto(
    LocalVisit visit,
    String type, {
    String? supplierExecutionLocalId,
    String? supplierId,
    String? categoryId,
    String? categoryName,
    String? activityId,
    String? activityName,
  }) async {
    final picker = ImagePicker();
    final result = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 72,
      maxWidth: 1600,
    );
    if (result == null) {
      throw Exception('Captura cancelada.');
    }

    final gps = await getGpsOrNull();
    final directory = await getApplicationDocumentsDirectory();
    final photosDir = Directory(p.join(directory.path, 'promotorpro_photos'));
    if (!await photosDir.exists()) {
      await photosDir.create(recursive: true);
    }

    final localId = const Uuid().v4();
    final targetPath = p.join(photosDir.path, '$localId.jpg');
    await File(result.path).copy(targetPath);
    final photo = LocalPhoto(
      localId: localId,
      visitLocalId: visit.localId,
      type: type,
      uri: targetPath,
      capturedAt: DateTime.now().toUtc().toIso8601String(),
      supplierExecutionLocalId: supplierExecutionLocalId,
      supplierId: supplierId,
      categoryId: categoryId,
      categoryName: categoryName,
      activityId: activityId,
      activityName: activityName,
      gpsLatitude: gps?.latitude,
      gpsLongitude: gps?.longitude,
      syncStatus: 'pending',
    );
    await db.addPhoto(photo);
    await db.enqueue('photo', photo.localId);
    await db.addSyncLog(
      gps == null ? 'failed' : 'pending',
      gps == null
          ? 'Foto salva sem GPS disponivel.'
          : '${photoLabel(type)} salva com GPS.',
    );
  }

  Future<void> finishVisit(LocalVisit visit, String notes) async {
    await _assertVisitReadyForCompletion(visit);

    await db.upsertVisit(
      visit.copyWith(
        status: 'completed',
        finishedAt: DateTime.now().toUtc().toIso8601String(),
        notes: notes.trim(),
        syncStatus: 'pending',
        updatedAt: DateTime.now().toUtc().toIso8601String(),
      ),
    );
    await db.enqueue('visit', visit.localId);
    await db.markRouteItemCompleted(visit.routeItemId);
    await db.addSyncLog(
      'pending',
      'Visita encerrada offline. Sincronize quando tiver internet.',
    );
  }

  Future<SyncResult> syncPending(String accessToken) async {
    final queue = await db.getPendingQueue();
    var synced = 0;
    var failed = 0;

    for (final item in queue) {
      try {
        await db.setQueueStatus(item.id, 'syncing');
        if (item.kind == 'visit') {
          await _syncVisit(accessToken, item.entityLocalId);
        } else if (item.kind == 'supplierExecution') {
          await _syncSupplierExecution(accessToken, item.entityLocalId);
        } else {
          await _syncPhoto(accessToken, item.entityLocalId);
        }
        await db.removeQueueItem(item.id);
        synced += 1;
      } catch (error) {
        failed += 1;
        await db.setQueueStatus(item.id, 'failed', normalizedError(error));
        await db.addSyncLog('failed', normalizedError(error));
      }
    }

    await db.addSyncLog(
      failed > 0 ? 'failed' : 'synced',
      'Sincronizacao finalizada. Enviados: $synced. Falhas: $failed.',
    );
    return SyncResult(synced: synced, failed: failed);
  }

  Future<void> _assertVisitReadyForCompletion(LocalVisit visit) async {
    final photos = await db.listPhotos(visit.localId);
    final visitLevelTypes = photos
        .where((photo) => photo.supplierExecutionLocalId == null)
        .map((photo) => photo.type)
        .toSet();
    final client = await db.getClientSnapshot(visit.clientId);
    final suppliers = suppliersFromPayload(client?.payload);

    final hasCheckin = visitLevelTypes.contains('checkin');
    final hasCheckout = visitLevelTypes.contains('checkout');
    if (!hasCheckin || !hasCheckout) {
      throw Exception(
        'Nao e permitido encerrar sem check-in e check-out da visita.',
      );
    }

    if (suppliers.isEmpty) {
      if (!visitLevelTypes.contains('before') ||
          !visitLevelTypes.contains('after')) {
        throw Exception(
          'Nao e permitido encerrar sem check-in, foto antes, foto depois e check-out.',
        );
      }
      return;
    }

    final executions = await db.listSupplierExecutions(visit.localId);
    for (final supplier in suppliers) {
      final execution = findSupplierExecution(executions, supplier.id);
      if (execution == null || execution.status != 'completed') {
        throw Exception(
          'Fornecedor pendente: ${supplierLabel(supplier)}. Conclua todos os fornecedores antes de encerrar a visita.',
        );
      }

      final executionPhotos = photos
          .where((photo) => photo.supplierExecutionLocalId == execution.localId)
          .toList();
      _assertSupplierExecutionReady(
        execution,
        executionPhotos,
        supplier,
        activitiesForSupplier(supplier, client),
      );
    }
  }

  void _assertSupplierExecutionReady(
    LocalSupplierExecution execution,
    List<LocalPhoto> executionPhotos,
    SupplierSnapshot supplier,
    List<ActivitySnapshot> activities,
  ) {
    if (execution.deliveryReceived == null) {
      throw Exception(
        'Informe se houve entrega para o fornecedor ${supplierLabel(supplier)}.',
      );
    }

    if (!supplierRequiresDeliveryFlow(execution.deliveryReceived)) {
      if ((execution.notes ?? '').trim().length < 5) {
        throw Exception(
          'Fornecedor ${supplierLabel(supplier)} sem entrega precisa de observacao explicando o motivo.',
        );
      }
      return;
    }

    final photoTypes = executionPhotos.map((photo) => photo.type).toSet();
    if (!photoTypes.contains('supplier_before') ||
        !photoTypes.contains('supplier_after')) {
      throw Exception(
        'Fornecedor ${supplierLabel(supplier)} precisa de foto antes e foto depois.',
      );
    }

    CategorySnapshot? missingCategory;
    for (final category in supplier.categories) {
      final hasCategoryEvidence = executionPhotos.any(
        (photo) =>
            photo.categoryId == category.id ||
            photo.categoryName == category.displayName,
      );
      if (!hasCategoryEvidence) {
        missingCategory = category;
        break;
      }
    }
    if (missingCategory != null) {
      throw Exception(
        'Categoria ${missingCategory.displayName} precisa de pelo menos uma foto de evidencia.',
      );
    }

    ActivitySnapshot? missingActivity;
    for (final activity in activities) {
      final hasActivityEvidence = executionPhotos.any(
        (photo) =>
            photo.activityId == activity.id ||
            photo.activityName == activity.displayName,
      );
      if (!hasActivityEvidence) {
        missingActivity = activity;
        break;
      }
    }
    if (missingActivity != null) {
      throw Exception(
        'Atividade ${missingActivity.displayName} precisa de pelo menos uma foto de evidencia.',
      );
    }

    if (execution.productsReplenished == null ||
        execution.stockoutFound == null) {
      throw Exception(
        'Responda abastecimento e ruptura do fornecedor ${supplierLabel(supplier)}.',
      );
    }

    if (execution.stockoutFound == true &&
        (execution.notes ?? '').trim().length < 5) {
      throw Exception(
        'Fornecedor ${supplierLabel(supplier)} com ruptura precisa de observacao explicando o motivo.',
      );
    }
  }

  Future<void> _syncVisit(String accessToken, String localId) async {
    final visit = await db.getVisit(localId);
    if (visit == null) return;
    await db.updateVisitSyncStatus(localId, 'syncing');

    if (visit.status != 'completed') {
      final serverId = await api.sendVisit(accessToken, visit);
      await db.updateVisitServerId(localId, serverId, 'synced');
      return;
    }

    await _assertVisitReadyForCompletion(visit);

    final serverVisitId =
        visit.serverId ??
        await api.sendVisit(
          accessToken,
          visit.copyWith(status: 'in_progress', finishedAt: null),
        );
    await db.updateVisitServerId(localId, serverVisitId, 'pending');

    final client = await db.getClientSnapshot(visit.clientId);
    final suppliers = suppliersFromPayload(client?.payload);
    if (suppliers.isNotEmpty) {
      final executions = await db.listSupplierExecutions(visit.localId);
      for (final supplier in suppliers) {
        final execution = findSupplierExecution(executions, supplier.id);
        if (execution == null) {
          throw Exception(
            'Fornecedor ${supplierLabel(supplier)} ainda nao tem execucao salva localmente.',
          );
        }
        await _syncSupplierExecutionRecord(
          accessToken,
          serverVisitId,
          execution,
        );
      }
    }

    final photos = await db.listPhotos(visit.localId);
    for (final photo in photos) {
      await _uploadPhoto(accessToken, serverVisitId, photo);
    }

    final refreshed = await db.getVisit(localId) ?? visit;
    final finalServerId = await api.sendVisit(
      accessToken,
      refreshed.copyWith(serverId: serverVisitId, status: 'completed'),
    );
    await db.updateVisitServerId(localId, finalServerId, 'synced');
  }

  Future<void> _syncSupplierExecution(
    String accessToken,
    String localId,
  ) async {
    final execution = await db.getSupplierExecution(localId);
    if (execution == null) return;
    if (execution.serverId != null && execution.syncStatus == 'synced') {
      return;
    }

    final visit = await db.getVisit(execution.visitLocalId);
    if (visit == null) {
      throw Exception('Visita do fornecedor nao encontrada localmente.');
    }

    final serverVisitId =
        visit.serverId ??
        await api.sendVisit(
          accessToken,
          visit.copyWith(status: 'in_progress', finishedAt: null),
        );
    await db.updateVisitServerId(visit.localId, serverVisitId, 'pending');
    await _syncSupplierExecutionRecord(accessToken, serverVisitId, execution);
  }

  Future<String> _syncSupplierExecutionRecord(
    String accessToken,
    String serverVisitId,
    LocalSupplierExecution execution,
  ) async {
    if (execution.serverId != null && execution.syncStatus == 'synced') {
      return execution.serverId!;
    }

    final client = await db.getClientSnapshot(execution.clientId);
    final supplier = supplierById(
      suppliersFromPayload(client?.payload),
      execution.supplierId,
    );
    if (execution.status == 'completed' && supplier != null) {
      final executionPhotos = (await db.listPhotos(execution.visitLocalId))
          .where((photo) => photo.supplierExecutionLocalId == execution.localId)
          .toList();
      _assertSupplierExecutionReady(
        execution,
        executionPhotos,
        supplier,
        activitiesForSupplier(supplier, client),
      );
    }

    await db.updateSupplierExecutionSyncStatus(execution.localId, 'syncing');
    final serverId = await api.sendSupplierExecution(
      accessToken,
      serverVisitId,
      execution,
    );
    await db.updateSupplierExecutionServerId(
      execution.localId,
      serverId,
      'synced',
    );
    return serverId;
  }

  Future<void> _syncPhoto(String accessToken, String localId) async {
    final photo = await db.getPhoto(localId);
    if (photo == null ||
        photo.serverId != null ||
        photo.syncStatus == 'synced') {
      return;
    }
    final visit = await db.getVisit(photo.visitLocalId);
    if (visit == null) throw Exception('Visita da foto nao encontrada.');
    final serverVisitId =
        visit.serverId ??
        await api.sendVisit(
          accessToken,
          visit.copyWith(status: 'in_progress', finishedAt: null),
        );
    await db.updateVisitServerId(visit.localId, serverVisitId, 'pending');
    await _uploadPhoto(accessToken, serverVisitId, photo);
  }

  Future<void> _uploadPhoto(
    String accessToken,
    String visitId,
    LocalPhoto photo,
  ) async {
    if (photo.serverId != null || photo.syncStatus == 'synced') return;
    await db.updatePhotoSyncStatus(photo.localId, 'syncing');
    String? supplierExecutionServerId;
    String? supplierId = photo.supplierId;

    if (photo.supplierExecutionLocalId != null) {
      final execution = await db.getSupplierExecution(
        photo.supplierExecutionLocalId!,
      );
      if (execution == null) {
        throw Exception('Execucao do fornecedor da foto nao foi encontrada.');
      }
      supplierExecutionServerId = await _syncSupplierExecutionRecord(
        accessToken,
        visitId,
        execution,
      );
      supplierId ??= execution.supplierId;
    }

    final serverPhotoId = await api.uploadPhoto(
      accessToken,
      visitId,
      photo,
      supplierExecutionId: supplierExecutionServerId,
      supplierId: supplierId,
    );
    await db.updatePhotoServerId(photo.localId, serverPhotoId, 'synced');
  }

  Future<void> sendHeartbeat(String accessToken) async {
    final gps = await getGpsOrNull();
    if (gps == null) return;
    await api.sendHeartbeat(accessToken, gps);
  }

  Future<void> sendHeartbeatFromVisit(LocalVisit visit) async {
    final session = await getSession();
    final gps = await getGpsOrNull();
    if (session == null || gps == null) return;
    await api.sendHeartbeat(session.accessToken, gps, visitId: visit.serverId);
  }
}

class ApiClient {
  ApiClient(this.baseUrl);

  final String baseUrl;
  final http.Client _client = http.Client();

  Future<http.Response> _request(
    String path, {
    String method = 'GET',
    String? accessToken,
    Map<String, dynamic>? body,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'content-type': 'application/json',
      if (accessToken != null) 'authorization': 'Bearer $accessToken',
    };

    try {
      final request = switch (method) {
        'POST' => _client.post(
          uri,
          headers: headers,
          body: jsonEncode(body ?? {}),
        ),
        'PUT' => _client.put(
          uri,
          headers: headers,
          body: jsonEncode(body ?? {}),
        ),
        _ => _client.get(uri, headers: headers),
      };
      final response = await request.timeout(timeout);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(parseApiError(response));
      }
      return response;
    } on TimeoutException {
      throw Exception('Tempo esgotado ao conectar na API.');
    } on SocketException {
      throw Exception(
        'Nao foi possivel conectar na API. Verifique internet ou dados moveis.',
      );
    }
  }

  Future<Session> login(String email, String password) async {
    final response = await _request(
      '/auth/login',
      method: 'POST',
      body: {'email': email.trim().toLowerCase(), 'password': password},
    );
    return Session.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<MobileSnapshot> downloadSnapshot(String accessToken) async {
    final response = await _request(
      '/mobile/snapshot',
      accessToken: accessToken,
      timeout: const Duration(seconds: 60),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return MobileSnapshot.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<String> sendVisit(String accessToken, LocalVisit visit) async {
    final payload = {
      'clientGeneratedId': visit.localId,
      'routeId': visit.routeId,
      'routeItemId': visit.routeItemId,
      'clientId': visit.clientId,
      'status': visit.status,
      'startedAt': visit.startedAt,
      'finishedAt': visit.finishedAt,
      'gpsLatitude': visit.gpsLatitude,
      'gpsLongitude': visit.gpsLongitude,
      'notes': visit.notes ?? '',
    };
    final response = await _request(
      visit.serverId == null ? '/visits' : '/visits/${visit.serverId}',
      method: visit.serverId == null ? 'POST' : 'PUT',
      accessToken: accessToken,
      body: payload,
      timeout: const Duration(seconds: 90),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['id'] as String;
  }

  Future<String> sendSupplierExecution(
    String accessToken,
    String visitId,
    LocalSupplierExecution execution,
  ) async {
    final payload = {
      'clientGeneratedId': execution.localId,
      'supplierId': execution.supplierId,
      'clientId': execution.clientId,
      'status': execution.status,
      'deliveryReceived': execution.deliveryReceived,
      'productsReplenished': execution.productsReplenished,
      'stockoutFound': execution.stockoutFound,
      'notes': execution.notes ?? '',
      'startedAtDevice': execution.startedAtDevice,
      'finishedAtDevice': execution.finishedAtDevice,
    };
    final response = await _request(
      execution.serverId == null
          ? '/visits/$visitId/supplier-executions'
          : '/visits/$visitId/supplier-executions/${execution.serverId}',
      method: execution.serverId == null ? 'POST' : 'PUT',
      accessToken: accessToken,
      body: payload,
      timeout: const Duration(seconds: 90),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['id'] as String;
  }

  Future<String> uploadPhoto(
    String accessToken,
    String visitId,
    LocalPhoto photo, {
    String? supplierExecutionId,
    String? supplierId,
  }) async {
    final bytes = await File(photo.uri).readAsBytes();
    final response = await _request(
      '/visits/$visitId/photos/base64',
      method: 'POST',
      accessToken: accessToken,
      body: {
        'type': photo.type,
        'clientGeneratedId': photo.localId,
        'capturedAt': photo.capturedAt,
        'gpsLatitude': photo.gpsLatitude,
        'gpsLongitude': photo.gpsLongitude,
        ...?supplierExecutionId == null
            ? null
            : {'supplierExecutionId': supplierExecutionId},
        ...?supplierId == null ? null : {'supplierId': supplierId},
        ...?photo.categoryId == null ? null : {'categoryId': photo.categoryId},
        ...?photo.categoryName == null
            ? null
            : {'categoryName': photo.categoryName},
        ...?photo.activityId == null ? null : {'activityId': photo.activityId},
        ...?photo.activityName == null
            ? null
            : {'activityName': photo.activityName},
        'contentType': 'image/jpeg',
        'base64Image': base64Encode(bytes),
      },
      timeout: const Duration(seconds: 120),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['id'] as String;
  }

  Future<void> sendHeartbeat(
    String accessToken,
    GpsPoint gps, {
    String? visitId,
  }) async {
    final body = <String, dynamic>{
      'latitude': gps.latitude,
      'longitude': gps.longitude,
      'accuracyMeters': gps.accuracyMeters,
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
    };
    if (visitId != null) {
      body['visitId'] = visitId;
    }

    await _request(
      '/locations/heartbeat',
      method: 'POST',
      accessToken: accessToken,
      body: body,
    );
  }
}

class LocalDatabase {
  Database? _db;

  Future<Database> get database async {
    final instance = _db;
    if (instance != null) return instance;
    return open();
  }

  Future<Database> open() async {
    final directory = await getApplicationDocumentsDirectory();
    final path = p.join(directory.path, 'promotorpro_flutter.db');
    _db = await openDatabase(
      path,
      version: 5,
      onCreate: (db, version) async {
        await db.execute(
          'CREATE TABLE clients (id TEXT PRIMARY KEY, code TEXT, name TEXT NOT NULL, address TEXT, city TEXT, state TEXT, latitude REAL, longitude REAL, payload_json TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE routes (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, scheduled_date TEXT, payload_json TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE route_items (id TEXT PRIMARY KEY, route_id TEXT NOT NULL, client_id TEXT NOT NULL, sequence INTEGER NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE visits (local_id TEXT PRIMARY KEY, server_id TEXT, route_id TEXT, route_item_id TEXT, client_id TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT, finished_at TEXT, gps_latitude REAL, gps_longitude REAL, notes TEXT, sync_status TEXT NOT NULL, updated_at TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE supplier_executions (local_id TEXT PRIMARY KEY, server_id TEXT, visit_local_id TEXT NOT NULL, client_id TEXT NOT NULL, supplier_id TEXT NOT NULL, status TEXT NOT NULL, delivery_received INTEGER, products_replenished INTEGER, stockout_found INTEGER, notes TEXT, started_at_device TEXT, finished_at_device TEXT, sync_status TEXT NOT NULL, updated_at TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE photos (local_id TEXT PRIMARY KEY, visit_local_id TEXT NOT NULL, server_id TEXT, type TEXT NOT NULL, uri TEXT NOT NULL, captured_at TEXT NOT NULL, supplier_execution_local_id TEXT, supplier_id TEXT, category_id TEXT, category_name TEXT, activity_id TEXT, activity_name TEXT, gps_latitude REAL, gps_longitude REAL, sync_status TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE sync_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, entity_local_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE sync_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)',
        );
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          try {
            await db.execute('ALTER TABLE clients ADD COLUMN latitude REAL');
          } catch (_) {}
          try {
            await db.execute('ALTER TABLE clients ADD COLUMN longitude REAL');
          } catch (_) {}
        }
        if (oldVersion < 3) {
          await db.execute(
            'CREATE TABLE IF NOT EXISTS supplier_executions (local_id TEXT PRIMARY KEY, server_id TEXT, visit_local_id TEXT NOT NULL, client_id TEXT NOT NULL, supplier_id TEXT NOT NULL, status TEXT NOT NULL, delivery_received INTEGER, products_replenished INTEGER, stockout_found INTEGER, notes TEXT, started_at_device TEXT, finished_at_device TEXT, sync_status TEXT NOT NULL, updated_at TEXT NOT NULL)',
          );
          try {
            await db.execute(
              'ALTER TABLE photos ADD COLUMN supplier_execution_local_id TEXT',
            );
          } catch (_) {}
          try {
            await db.execute('ALTER TABLE photos ADD COLUMN supplier_id TEXT');
          } catch (_) {}
        }
        if (oldVersion < 4) {
          try {
            await db.execute('ALTER TABLE photos ADD COLUMN category_id TEXT');
          } catch (_) {}
          try {
            await db.execute(
              'ALTER TABLE photos ADD COLUMN category_name TEXT',
            );
          } catch (_) {}
        }
        if (oldVersion < 5) {
          try {
            await db.execute('ALTER TABLE photos ADD COLUMN activity_id TEXT');
          } catch (_) {}
          try {
            await db.execute(
              'ALTER TABLE photos ADD COLUMN activity_name TEXT',
            );
          } catch (_) {}
        }
      },
    );
    return _db!;
  }

  String nowIso() => DateTime.now().toUtc().toIso8601String();

  Future<void> saveSnapshot(MobileSnapshot snapshot) async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.delete('route_items');
      await txn.delete('routes');
      for (final client in snapshot.clients) {
        await txn.insert(
          'clients',
          client.toDb(),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
      for (final route in snapshot.routes) {
        await txn.insert(
          'routes',
          route.toDb(),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
        for (final item in route.items) {
          await txn.insert(
            'route_items',
            item.toDb(),
            conflictAlgorithm: ConflictAlgorithm.replace,
          );
        }
      }
      await txn.insert('sync_logs', {
        'status': snapshot.routes.isEmpty ? 'failed' : 'synced',
        'message': snapshot.routes.isEmpty
            ? 'Nenhum roteiro publicado para este promotor.'
            : 'Roteiro atualizado: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s).',
        'created_at': nowIso(),
      });
    });
  }

  Future<ClientSnapshot?> getClientSnapshot(String clientId) async {
    final db = await database;
    final rows = await db.query(
      'clients',
      where: 'id = ?',
      whereArgs: [clientId],
      limit: 1,
    );
    return rows.isEmpty ? null : ClientSnapshot.fromDb(rows.first);
  }

  Future<List<RouteItemView>> listRouteItems() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT
        route_items.id,
        route_items.route_id AS routeId,
        route_items.client_id AS clientId,
        route_items.sequence,
        route_items.status,
        clients.name AS clientName,
        clients.payload_json AS clientPayloadJson,
        clients.address AS clientAddress,
        clients.latitude AS clientLatitude,
        clients.longitude AS clientLongitude,
        routes.name AS routeName,
        visits.status AS visitStatus
      FROM route_items
      INNER JOIN routes ON routes.id = route_items.route_id
      INNER JOIN clients ON clients.id = route_items.client_id
      LEFT JOIN visits ON visits.route_item_id = route_items.id
      WHERE route_items.id = (
        SELECT candidate.id
        FROM route_items candidate
        INNER JOIN routes candidate_route ON candidate_route.id = candidate.route_id
        WHERE candidate.client_id = route_items.client_id
        ORDER BY candidate.sequence ASC, candidate_route.scheduled_date DESC, candidate.id ASC
        LIMIT 1
      )
      ORDER BY route_items.sequence ASC
    ''');
    return rows.map(RouteItemView.fromDb).toList();
  }

  Future<LocalVisit?> getVisitByRouteItem(String routeItemId) async {
    final db = await database;
    final rows = await db.query(
      'visits',
      where: 'route_item_id = ?',
      whereArgs: [routeItemId],
      orderBy: 'updated_at DESC',
      limit: 1,
    );
    return rows.isEmpty ? null : LocalVisit.fromDb(rows.first);
  }

  Future<LocalVisit?> getVisit(String localId) async {
    final db = await database;
    final rows = await db.query(
      'visits',
      where: 'local_id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    return rows.isEmpty ? null : LocalVisit.fromDb(rows.first);
  }

  Future<void> upsertVisit(LocalVisit visit) async {
    final db = await database;
    await db.insert(
      'visits',
      visit.toDb(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> upsertSupplierExecution(LocalSupplierExecution execution) async {
    final db = await database;
    await db.insert(
      'supplier_executions',
      execution.toDb(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<LocalSupplierExecution?> getSupplierExecution(String localId) async {
    final db = await database;
    final rows = await db.query(
      'supplier_executions',
      where: 'local_id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    return rows.isEmpty ? null : LocalSupplierExecution.fromDb(rows.first);
  }

  Future<LocalSupplierExecution?> getSupplierExecutionBySupplier(
    String visitLocalId,
    String supplierId,
  ) async {
    final db = await database;
    final rows = await db.query(
      'supplier_executions',
      where: 'visit_local_id = ? AND supplier_id = ?',
      whereArgs: [visitLocalId, supplierId],
      orderBy: 'updated_at DESC',
      limit: 1,
    );
    return rows.isEmpty ? null : LocalSupplierExecution.fromDb(rows.first);
  }

  Future<List<LocalSupplierExecution>> listSupplierExecutions(
    String visitLocalId,
  ) async {
    final db = await database;
    final rows = await db.query(
      'supplier_executions',
      where: 'visit_local_id = ?',
      whereArgs: [visitLocalId],
      orderBy: 'updated_at ASC',
    );
    return rows.map(LocalSupplierExecution.fromDb).toList();
  }

  Future<void> addPhoto(LocalPhoto photo) async {
    final db = await database;
    await db.insert(
      'photos',
      photo.toDb(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<LocalPhoto>> listPhotos(String visitLocalId) async {
    final db = await database;
    final rows = await db.query(
      'photos',
      where: 'visit_local_id = ?',
      whereArgs: [visitLocalId],
      orderBy: 'captured_at ASC',
    );
    return rows.map(LocalPhoto.fromDb).toList();
  }

  Future<LocalPhoto?> getPhoto(String localId) async {
    final db = await database;
    final rows = await db.query(
      'photos',
      where: 'local_id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    return rows.isEmpty ? null : LocalPhoto.fromDb(rows.first);
  }

  Future<void> markRouteItemCompleted(String? routeItemId) async {
    if (routeItemId == null) return;
    final db = await database;
    await db.update(
      'route_items',
      {'status': 'COMPLETED'},
      where: 'id = ?',
      whereArgs: [routeItemId],
    );
  }

  Future<void> enqueue(String kind, String entityLocalId) async {
    final db = await database;
    final existing = await db.query(
      'sync_queue',
      columns: ['id'],
      where: 'kind = ? AND entity_local_id = ? AND status IN (?, ?, ?)',
      whereArgs: [kind, entityLocalId, 'pending', 'syncing', 'failed'],
      limit: 1,
    );
    if (existing.isNotEmpty) {
      await db.update(
        'sync_queue',
        {'status': 'pending', 'updated_at': nowIso()},
        where: 'id = ?',
        whereArgs: [existing.first['id']],
      );
      return;
    }
    await db.insert('sync_queue', {
      'kind': kind,
      'entity_local_id': entityLocalId,
      'status': 'pending',
      'attempts': 0,
      'created_at': nowIso(),
      'updated_at': nowIso(),
    });
  }

  Future<List<QueueItem>> getPendingQueue() async {
    final db = await database;
    final rows = await db.query(
      'sync_queue',
      where: 'status IN (?, ?, ?)',
      whereArgs: ['pending', 'syncing', 'failed'],
      orderBy: 'id ASC',
    );
    return rows.map(QueueItem.fromDb).toList();
  }

  Future<void> setQueueStatus(int id, String status, [String? error]) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE sync_queue SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?',
      [status, error, nowIso(), id],
    );
  }

  Future<void> removeQueueItem(int id) async {
    final db = await database;
    await db.delete('sync_queue', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> updateVisitServerId(
    String localId,
    String serverId,
    String status,
  ) async {
    final db = await database;
    await db.update(
      'visits',
      {'server_id': serverId, 'sync_status': status, 'updated_at': nowIso()},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> updateVisitSyncStatus(String localId, String status) async {
    final db = await database;
    await db.update(
      'visits',
      {'sync_status': status, 'updated_at': nowIso()},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> updateSupplierExecutionServerId(
    String localId,
    String serverId,
    String status,
  ) async {
    final db = await database;
    await db.update(
      'supplier_executions',
      {'server_id': serverId, 'sync_status': status, 'updated_at': nowIso()},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> updateSupplierExecutionSyncStatus(
    String localId,
    String status,
  ) async {
    final db = await database;
    await db.update(
      'supplier_executions',
      {'sync_status': status, 'updated_at': nowIso()},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> updatePhotoServerId(
    String localId,
    String serverId,
    String status,
  ) async {
    final db = await database;
    await db.update(
      'photos',
      {'server_id': serverId, 'sync_status': status},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> updatePhotoSyncStatus(String localId, String status) async {
    final db = await database;
    await db.update(
      'photos',
      {'sync_status': status},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<QueueSummary> getQueueSummary() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT
        SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM sync_queue
    ''');
    final row = rows.first;
    return QueueSummary(
      pending: asInt(row['pending']),
      failed: asInt(row['failed']),
    );
  }

  Future<List<QueueDiagnostic>> listQueueDiagnostics() async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT
        sync_queue.id,
        sync_queue.kind,
        sync_queue.entity_local_id AS entityLocalId,
        sync_queue.status,
        sync_queue.attempts,
        sync_queue.last_error AS lastError,
        sync_queue.updated_at AS updatedAt,
        clients.payload_json AS clientPayloadJson,
        clients.name AS clientName,
        photos.type AS photoType,
        photos.category_name AS categoryName,
        photos.activity_name AS activityName,
        COALESCE(
          supplier_executions.supplier_id,
          photo_execution.supplier_id,
          photos.supplier_id
        ) AS supplierId
      FROM sync_queue
      LEFT JOIN photos
        ON sync_queue.kind = 'photo'
        AND photos.local_id = sync_queue.entity_local_id
      LEFT JOIN supplier_executions
        ON sync_queue.kind = 'supplierExecution'
        AND supplier_executions.local_id = sync_queue.entity_local_id
      LEFT JOIN supplier_executions photo_execution
        ON sync_queue.kind = 'photo'
        AND photo_execution.local_id = photos.supplier_execution_local_id
      LEFT JOIN visits
        ON (sync_queue.kind = 'visit' AND visits.local_id = sync_queue.entity_local_id)
        OR (sync_queue.kind = 'photo' AND visits.local_id = photos.visit_local_id)
        OR (sync_queue.kind = 'supplierExecution' AND visits.local_id = supplier_executions.visit_local_id)
      LEFT JOIN clients
        ON clients.id = COALESCE(visits.client_id, supplier_executions.client_id, photo_execution.client_id)
      WHERE sync_queue.status IN ('pending', 'syncing', 'failed')
      ORDER BY CASE sync_queue.status WHEN 'failed' THEN 0 WHEN 'syncing' THEN 1 ELSE 2 END, sync_queue.updated_at DESC
    ''');
    return rows.map(QueueDiagnostic.fromDb).toList();
  }

  Future<void> addSyncLog(String status, String message) async {
    final db = await database;
    await db.insert('sync_logs', {
      'status': status,
      'message': message,
      'created_at': nowIso(),
    });
  }

  Future<List<SyncLog>> listSyncLogs() async {
    final db = await database;
    final rows = await db.query('sync_logs', orderBy: 'id DESC', limit: 30);
    return rows.map(SyncLog.fromDb).toList();
  }

  Future<void> clearLocalOperationalData() async {
    final db = await database;
    await db.transaction((txn) async {
      for (final table in [
        'photos',
        'supplier_executions',
        'visits',
        'sync_queue',
        'sync_logs',
        'route_items',
        'routes',
        'clients',
      ]) {
        await txn.delete(table);
      }
    });
  }
}

class Session {
  Session({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final SessionUser user;

  factory Session.fromJson(Map<String, dynamic> json) => Session(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
    user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
  );

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'user': user.toJson(),
  };
}

class SessionUser {
  SessionUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.status,
  });

  final String id;
  final String email;
  final String name;
  final String role;
  final String status;

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
    id: json['id'] as String,
    email: json['email'] as String,
    name: json['name'] as String,
    role: json['role'] as String,
    status: json['status'] as String,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'name': name,
    'role': role,
    'status': status,
  };
}

class MobileSnapshot {
  MobileSnapshot({required this.routes, required this.clients});

  final List<RouteSnapshot> routes;
  final List<ClientSnapshot> clients;

  factory MobileSnapshot.fromJson(Map<String, dynamic> json) => MobileSnapshot(
    routes: ((json['routes'] as List?) ?? [])
        .map((item) => RouteSnapshot.fromJson(item as Map<String, dynamic>))
        .toList(),
    clients: ((json['clients'] as List?) ?? [])
        .map((item) => ClientSnapshot.fromJson(item as Map<String, dynamic>))
        .toList(),
  );
}

class ClientSnapshot {
  ClientSnapshot({
    required this.id,
    this.code,
    required this.name,
    this.tradeName,
    this.address,
    this.city,
    this.state,
    this.latitude,
    this.longitude,
    required this.payload,
  });

  final String id;
  final String? code;
  final String name;
  final String? tradeName;
  final String? address;
  final String? city;
  final String? state;
  final double? latitude;
  final double? longitude;
  final Map<String, dynamic> payload;

  String get displayName {
    final legalName = name.trim();
    final fantasyName = tradeName?.trim();
    if (fantasyName != null &&
        fantasyName.isNotEmpty &&
        fantasyName != legalName) {
      return '$legalName | Fantasia: $fantasyName';
    }
    return legalName.isEmpty ? 'Cliente' : legalName;
  }

  factory ClientSnapshot.fromJson(Map<String, dynamic> json) => ClientSnapshot(
    id: json['id'] as String,
    code: json['code']?.toString(),
    name: json['name'] as String,
    tradeName: json['tradeName'] as String?,
    address: json['address'] as String?,
    city: json['city'] as String?,
    state: json['state'] as String?,
    latitude: asDouble(json['latitude']),
    longitude: asDouble(json['longitude']),
    payload: json,
  );

  factory ClientSnapshot.fromDb(Map<String, Object?> row) {
    final payloadJson = row['payload_json'] as String? ?? '{}';
    final payload = jsonDecode(payloadJson) as Map<String, dynamic>;
    return ClientSnapshot(
      id: row['id'] as String,
      code: row['code']?.toString(),
      name: row['name'] as String,
      tradeName: payload['tradeName'] as String?,
      address: row['address'] as String?,
      city: row['city'] as String?,
      state: row['state'] as String?,
      latitude: asDouble(row['latitude']),
      longitude: asDouble(row['longitude']),
      payload: payload,
    );
  }

  Map<String, Object?> toDb() => {
    'id': id,
    'code': code,
    'name': displayName,
    'address': address,
    'city': city,
    'state': state,
    'latitude': latitude,
    'longitude': longitude,
    'payload_json': jsonEncode(payload),
  };
}

class ActivitySnapshot {
  ActivitySnapshot({
    required this.id,
    this.code,
    required this.name,
    this.description,
    this.status,
    required this.payload,
  });

  final String id;
  final String? code;
  final String name;
  final String? description;
  final String? status;
  final Map<String, dynamic> payload;

  String get displayName {
    final normalizedName = name.trim().isEmpty ? 'Atividade' : name.trim();
    if ((code?.trim().isNotEmpty ?? false)) {
      return '${code!.trim()} - $normalizedName';
    }
    return normalizedName;
  }

  factory ActivitySnapshot.fromJson(Map<String, dynamic> json) =>
      ActivitySnapshot(
        id: json['id'] as String,
        code: json['code']?.toString(),
        name: (json['name'] as String?)?.trim().isNotEmpty == true
            ? (json['name'] as String).trim()
            : 'Atividade',
        description: json['description'] as String?,
        status: json['status']?.toString(),
        payload: json,
      );
}

class CategorySnapshot {
  CategorySnapshot({
    required this.id,
    this.code,
    required this.name,
    this.description,
    this.status,
    required this.payload,
  });

  final String id;
  final String? code;
  final String name;
  final String? description;
  final String? status;
  final Map<String, dynamic> payload;

  String get displayName {
    final normalizedName = name.trim().isEmpty ? 'Categoria' : name.trim();
    if ((code?.trim().isNotEmpty ?? false)) {
      return '${code!.trim()} - $normalizedName';
    }
    return normalizedName;
  }

  factory CategorySnapshot.fromJson(Map<String, dynamic> json) =>
      CategorySnapshot(
        id: json['id'] as String,
        code: json['code']?.toString(),
        name: (json['name'] as String?)?.trim().isNotEmpty == true
            ? (json['name'] as String).trim()
            : 'Categoria',
        description: json['description'] as String?,
        status: json['status']?.toString(),
        payload: json,
      );
}

class SupplierSnapshot {
  SupplierSnapshot({
    required this.id,
    this.code,
    required this.name,
    this.tradeName,
    this.document,
    required this.payload,
  });

  final String id;
  final String? code;
  final String name;
  final String? tradeName;
  final String? document;
  final Map<String, dynamic> payload;
  List<ActivitySnapshot> get activities =>
      activitiesFromRaw(payload['activities']);
  List<CategorySnapshot> get categories =>
      categoriesFromRaw(payload['categories']);

  String get displayName {
    final preferred = (tradeName?.trim().isNotEmpty ?? false)
        ? tradeName!.trim()
        : name.trim();
    if ((code?.trim().isNotEmpty ?? false)) {
      return '${code!.trim()} - $preferred';
    }
    return preferred;
  }

  factory SupplierSnapshot.fromJson(Map<String, dynamic> json) =>
      SupplierSnapshot(
        id: json['id'] as String,
        code: json['code']?.toString(),
        name: (json['name'] as String?)?.trim().isNotEmpty == true
            ? (json['name'] as String).trim()
            : ((json['tradeName'] as String?) ?? 'Fornecedor').trim(),
        tradeName: json['tradeName'] as String?,
        document: json['document']?.toString(),
        payload: json,
      );
}

class RouteSnapshot {
  RouteSnapshot({
    required this.id,
    required this.name,
    required this.status,
    this.scheduledDate,
    required this.items,
    required this.payload,
  });

  final String id;
  final String name;
  final String status;
  final String? scheduledDate;
  final List<RouteItemSnapshot> items;
  final Map<String, dynamic> payload;

  factory RouteSnapshot.fromJson(Map<String, dynamic> json) => RouteSnapshot(
    id: json['id'] as String,
    name: json['name'] as String,
    status: json['status'] as String,
    scheduledDate: json['scheduledDate'] as String?,
    items: ((json['items'] as List?) ?? [])
        .map((item) => RouteItemSnapshot.fromJson(item as Map<String, dynamic>))
        .toList(),
    payload: json,
  );

  Map<String, Object?> toDb() => {
    'id': id,
    'name': name,
    'status': status,
    'scheduled_date': scheduledDate,
    'payload_json': jsonEncode(payload),
  };
}

class RouteItemSnapshot {
  RouteItemSnapshot({
    required this.id,
    required this.routeId,
    required this.clientId,
    required this.sequence,
    required this.status,
    required this.payload,
  });

  final String id;
  final String routeId;
  final String clientId;
  final int sequence;
  final String status;
  final Map<String, dynamic> payload;

  factory RouteItemSnapshot.fromJson(Map<String, dynamic> json) =>
      RouteItemSnapshot(
        id: json['id'] as String,
        routeId: json['routeId'] as String,
        clientId: json['clientId'] as String,
        sequence: asInt(json['sequence']),
        status: json['status'] as String,
        payload: json,
      );

  Map<String, Object?> toDb() => {
    'id': id,
    'route_id': routeId,
    'client_id': clientId,
    'sequence': sequence,
    'status': status,
    'payload_json': jsonEncode(payload),
  };
}

class RouteItemView {
  RouteItemView({
    required this.id,
    required this.routeId,
    required this.clientId,
    required this.sequence,
    required this.status,
    required this.clientName,
    this.clientTradeName,
    this.clientAddress,
    this.clientLatitude,
    this.clientLongitude,
    required this.routeName,
    this.visitStatus,
  });

  final String id;
  final String routeId;
  final String clientId;
  final int sequence;
  final String status;
  final String clientName;
  final String? clientTradeName;
  final String? clientAddress;
  final double? clientLatitude;
  final double? clientLongitude;
  final String routeName;
  final String? visitStatus;

  bool get isDone =>
      status.toUpperCase() == 'COMPLETED' || visitStatus == 'completed';
  bool get hasCoordinates => clientLatitude != null && clientLongitude != null;
  String get navigationName {
    final fantasyName = clientTradeName?.trim();
    return fantasyName != null && fantasyName.isNotEmpty
        ? fantasyName
        : clientName;
  }

  factory RouteItemView.fromDb(Map<String, Object?> row) {
    String? tradeName;
    final payloadJson = row['clientPayloadJson'] as String?;
    if (payloadJson != null && payloadJson.isNotEmpty) {
      try {
        final payload = jsonDecode(payloadJson) as Map<String, dynamic>;
        tradeName = payload['tradeName'] as String?;
      } catch (_) {}
    }
    return RouteItemView(
      id: row['id'] as String,
      routeId: row['routeId'] as String,
      clientId: row['clientId'] as String,
      sequence: asInt(row['sequence']),
      status: row['status'] as String,
      clientName: row['clientName'] as String,
      clientTradeName: tradeName,
      clientAddress: row['clientAddress'] as String?,
      clientLatitude: asDouble(row['clientLatitude']),
      clientLongitude: asDouble(row['clientLongitude']),
      routeName: row['routeName'] as String,
      visitStatus: row['visitStatus'] as String?,
    );
  }
}

class LocalVisit {
  LocalVisit({
    required this.localId,
    this.serverId,
    this.routeId,
    this.routeItemId,
    required this.clientId,
    required this.status,
    this.startedAt,
    this.finishedAt,
    this.gpsLatitude,
    this.gpsLongitude,
    this.notes,
    required this.syncStatus,
    required this.updatedAt,
  });

  final String localId;
  final String? serverId;
  final String? routeId;
  final String? routeItemId;
  final String clientId;
  final String status;
  final String? startedAt;
  final String? finishedAt;
  final double? gpsLatitude;
  final double? gpsLongitude;
  final String? notes;
  final String syncStatus;
  final String updatedAt;

  LocalVisit copyWith({
    String? serverId,
    String? status,
    String? startedAt,
    Object? finishedAt = _keepValue,
    String? notes,
    String? syncStatus,
    String? updatedAt,
  }) {
    final nextFinishedAt = identical(finishedAt, _keepValue)
        ? this.finishedAt
        : finishedAt as String?;

    return LocalVisit(
      localId: localId,
      serverId: serverId ?? this.serverId,
      routeId: routeId,
      routeItemId: routeItemId,
      clientId: clientId,
      status: status ?? this.status,
      startedAt: startedAt ?? this.startedAt,
      finishedAt: nextFinishedAt,
      gpsLatitude: gpsLatitude,
      gpsLongitude: gpsLongitude,
      notes: notes ?? this.notes,
      syncStatus: syncStatus ?? this.syncStatus,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  factory LocalVisit.fromDb(Map<String, Object?> row) => LocalVisit(
    localId: row['local_id'] as String,
    serverId: row['server_id'] as String?,
    routeId: row['route_id'] as String?,
    routeItemId: row['route_item_id'] as String?,
    clientId: row['client_id'] as String,
    status: row['status'] as String,
    startedAt: row['started_at'] as String?,
    finishedAt: row['finished_at'] as String?,
    gpsLatitude: asDouble(row['gps_latitude']),
    gpsLongitude: asDouble(row['gps_longitude']),
    notes: row['notes'] as String?,
    syncStatus: row['sync_status'] as String,
    updatedAt: row['updated_at'] as String,
  );

  Map<String, Object?> toDb() => {
    'local_id': localId,
    'server_id': serverId,
    'route_id': routeId,
    'route_item_id': routeItemId,
    'client_id': clientId,
    'status': status,
    'started_at': startedAt,
    'finished_at': finishedAt,
    'gps_latitude': gpsLatitude,
    'gps_longitude': gpsLongitude,
    'notes': notes,
    'sync_status': syncStatus,
    'updated_at': updatedAt,
  };
}

class LocalSupplierExecution {
  LocalSupplierExecution({
    required this.localId,
    this.serverId,
    required this.visitLocalId,
    required this.clientId,
    required this.supplierId,
    required this.status,
    this.deliveryReceived,
    this.productsReplenished,
    this.stockoutFound,
    this.notes,
    this.startedAtDevice,
    this.finishedAtDevice,
    required this.syncStatus,
    required this.updatedAt,
  });

  final String localId;
  final String? serverId;
  final String visitLocalId;
  final String clientId;
  final String supplierId;
  final String status;
  final bool? deliveryReceived;
  final bool? productsReplenished;
  final bool? stockoutFound;
  final String? notes;
  final String? startedAtDevice;
  final String? finishedAtDevice;
  final String syncStatus;
  final String updatedAt;

  LocalSupplierExecution copyWith({
    String? serverId,
    String? status,
    Object? deliveryReceived = _keepValue,
    Object? productsReplenished = _keepValue,
    Object? stockoutFound = _keepValue,
    Object? notes = _keepValue,
    Object? startedAtDevice = _keepValue,
    Object? finishedAtDevice = _keepValue,
    String? syncStatus,
    String? updatedAt,
  }) {
    return LocalSupplierExecution(
      localId: localId,
      serverId: serverId ?? this.serverId,
      visitLocalId: visitLocalId,
      clientId: clientId,
      supplierId: supplierId,
      status: status ?? this.status,
      deliveryReceived: identical(deliveryReceived, _keepValue)
          ? this.deliveryReceived
          : deliveryReceived as bool?,
      productsReplenished: identical(productsReplenished, _keepValue)
          ? this.productsReplenished
          : productsReplenished as bool?,
      stockoutFound: identical(stockoutFound, _keepValue)
          ? this.stockoutFound
          : stockoutFound as bool?,
      notes: identical(notes, _keepValue) ? this.notes : notes as String?,
      startedAtDevice: identical(startedAtDevice, _keepValue)
          ? this.startedAtDevice
          : startedAtDevice as String?,
      finishedAtDevice: identical(finishedAtDevice, _keepValue)
          ? this.finishedAtDevice
          : finishedAtDevice as String?,
      syncStatus: syncStatus ?? this.syncStatus,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  factory LocalSupplierExecution.fromDb(Map<String, Object?> row) =>
      LocalSupplierExecution(
        localId: row['local_id'] as String,
        serverId: row['server_id'] as String?,
        visitLocalId: row['visit_local_id'] as String,
        clientId: row['client_id'] as String,
        supplierId: row['supplier_id'] as String,
        status: row['status'] as String,
        deliveryReceived: asBool(row['delivery_received']),
        productsReplenished: asBool(row['products_replenished']),
        stockoutFound: asBool(row['stockout_found']),
        notes: row['notes'] as String?,
        startedAtDevice: row['started_at_device'] as String?,
        finishedAtDevice: row['finished_at_device'] as String?,
        syncStatus: row['sync_status'] as String,
        updatedAt: row['updated_at'] as String,
      );

  Map<String, Object?> toDb() => {
    'local_id': localId,
    'server_id': serverId,
    'visit_local_id': visitLocalId,
    'client_id': clientId,
    'supplier_id': supplierId,
    'status': status,
    'delivery_received': boolToDb(deliveryReceived),
    'products_replenished': boolToDb(productsReplenished),
    'stockout_found': boolToDb(stockoutFound),
    'notes': notes,
    'started_at_device': startedAtDevice,
    'finished_at_device': finishedAtDevice,
    'sync_status': syncStatus,
    'updated_at': updatedAt,
  };
}

class LocalPhoto {
  LocalPhoto({
    required this.localId,
    required this.visitLocalId,
    this.serverId,
    required this.type,
    required this.uri,
    required this.capturedAt,
    this.supplierExecutionLocalId,
    this.supplierId,
    this.categoryId,
    this.categoryName,
    this.activityId,
    this.activityName,
    this.gpsLatitude,
    this.gpsLongitude,
    required this.syncStatus,
  });

  final String localId;
  final String visitLocalId;
  final String? serverId;
  final String type;
  final String uri;
  final String capturedAt;
  final String? supplierExecutionLocalId;
  final String? supplierId;
  final String? categoryId;
  final String? categoryName;
  final String? activityId;
  final String? activityName;
  final double? gpsLatitude;
  final double? gpsLongitude;
  final String syncStatus;

  factory LocalPhoto.fromDb(Map<String, Object?> row) => LocalPhoto(
    localId: row['local_id'] as String,
    visitLocalId: row['visit_local_id'] as String,
    serverId: row['server_id'] as String?,
    type: row['type'] as String,
    uri: row['uri'] as String,
    capturedAt: row['captured_at'] as String,
    supplierExecutionLocalId: row['supplier_execution_local_id'] as String?,
    supplierId: row['supplier_id'] as String?,
    categoryId: row['category_id'] as String?,
    categoryName: row['category_name'] as String?,
    activityId: row['activity_id'] as String?,
    activityName: row['activity_name'] as String?,
    gpsLatitude: asDouble(row['gps_latitude']),
    gpsLongitude: asDouble(row['gps_longitude']),
    syncStatus: row['sync_status'] as String,
  );

  Map<String, Object?> toDb() => {
    'local_id': localId,
    'visit_local_id': visitLocalId,
    'server_id': serverId,
    'type': type,
    'uri': uri,
    'captured_at': capturedAt,
    'supplier_execution_local_id': supplierExecutionLocalId,
    'supplier_id': supplierId,
    'category_id': categoryId,
    'category_name': categoryName,
    'activity_id': activityId,
    'activity_name': activityName,
    'gps_latitude': gpsLatitude,
    'gps_longitude': gpsLongitude,
    'sync_status': syncStatus,
  };
}

class QueueItem {
  QueueItem({
    required this.id,
    required this.kind,
    required this.entityLocalId,
    required this.attempts,
  });

  final int id;
  final String kind;
  final String entityLocalId;
  final int attempts;

  factory QueueItem.fromDb(Map<String, Object?> row) => QueueItem(
    id: asInt(row['id']),
    kind: row['kind'] as String,
    entityLocalId: row['entity_local_id'] as String,
    attempts: asInt(row['attempts']),
  );
}

class QueueDiagnostic {
  QueueDiagnostic({
    required this.kind,
    required this.status,
    required this.attempts,
    this.lastError,
    this.clientName,
    this.photoType,
    this.categoryName,
    this.activityName,
    this.supplierName,
  });

  final String kind;
  final String status;
  final int attempts;
  final String? lastError;
  final String? clientName;
  final String? photoType;
  final String? categoryName;
  final String? activityName;
  final String? supplierName;

  factory QueueDiagnostic.fromDb(Map<String, Object?> row) {
    final supplierId = row['supplierId'] as String?;
    String? supplierName;
    final payloadJson = row['clientPayloadJson'] as String?;
    if (supplierId != null && payloadJson != null && payloadJson.isNotEmpty) {
      try {
        final payload = jsonDecode(payloadJson) as Map<String, dynamic>;
        supplierName = supplierById(
          suppliersFromPayload(payload),
          supplierId,
        )?.displayName;
      } catch (_) {}
    }
    return QueueDiagnostic(
      kind: row['kind'] as String,
      status: row['status'] as String,
      attempts: asInt(row['attempts']),
      lastError: row['lastError'] as String?,
      clientName: row['clientName'] as String?,
      photoType: row['photoType'] as String?,
      categoryName: row['categoryName'] as String?,
      activityName: row['activityName'] as String?,
      supplierName: supplierName,
    );
  }
}

class SyncLog {
  SyncLog({required this.status, required this.message});

  final String status;
  final String message;

  factory SyncLog.fromDb(Map<String, Object?> row) => SyncLog(
    status: row['status'] as String,
    message: row['message'] as String,
  );
}

class QueueSummary {
  const QueueSummary({required this.pending, required this.failed});

  final int pending;
  final int failed;
}

class SyncResult {
  SyncResult({required this.synced, required this.failed});

  final int synced;
  final int failed;
}

class GpsPoint {
  GpsPoint({
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
  });

  final double latitude;
  final double longitude;
  final double? accuracyMeters;
}

Future<GpsPoint?> getGpsOrNull() async {
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    return null;
  }

  try {
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 8),
      ),
    );
    return GpsPoint(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracy,
    );
  } catch (_) {
    final last = await Geolocator.getLastKnownPosition();
    if (last == null) return null;
    return GpsPoint(
      latitude: last.latitude,
      longitude: last.longitude,
      accuracyMeters: last.accuracy,
    );
  }
}

String parseApiError(http.Response response) {
  try {
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return ((body['error'] as Map<String, dynamic>?)?['message'] as String?) ??
        'Erro HTTP ${response.statusCode}';
  } catch (_) {
    return 'Erro HTTP ${response.statusCode}';
  }
}

String normalizedError(Object error) {
  final text = error.toString().replaceFirst('Exception: ', '');
  return text.isEmpty ? 'Erro desconhecido.' : text;
}

Future<bool?> confirmAction(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
}) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          style: FilledButton.styleFrom(backgroundColor: brandBlue),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
}

int asInt(Object? value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString()) ?? 0;
}

bool? asBool(Object? value) {
  if (value == null) return null;
  if (value is bool) return value;
  if (value is num) return value != 0;
  final normalized = value.toString().trim().toLowerCase();
  if (normalized == 'true' || normalized == '1' || normalized == 'sim') {
    return true;
  }
  if (normalized == 'false' || normalized == '0' || normalized == 'nao') {
    return false;
  }
  return null;
}

int? boolToDb(bool? value) {
  if (value == null) return null;
  return value ? 1 : 0;
}

double? asDouble(Object? value) {
  if (value == null) return null;
  if (value is double) return value;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

List<ActivitySnapshot> activitiesFromRaw(Object? raw) {
  if (raw is! List) {
    return const <ActivitySnapshot>[];
  }

  return raw
      .whereType<Map>()
      .map(
        (item) => ActivitySnapshot.fromJson(
          item.map((key, value) => MapEntry(key.toString(), value)),
        ),
      )
      .toList();
}

List<ActivitySnapshot> clientActivitiesFromPayload(
  Map<String, dynamic>? payload,
) => activitiesFromRaw(payload?['activities']);

List<CategorySnapshot> categoriesFromRaw(Object? raw) {
  if (raw is! List) {
    return const <CategorySnapshot>[];
  }

  return raw
      .whereType<Map>()
      .map(
        (item) => CategorySnapshot.fromJson(
          item.map((key, value) => MapEntry(key.toString(), value)),
        ),
      )
      .toList();
}

List<SupplierSnapshot> suppliersFromPayload(Map<String, dynamic>? payload) {
  final raw = payload?['suppliers'];
  if (raw is! List) {
    return const <SupplierSnapshot>[];
  }
  return raw
      .whereType<Map>()
      .map(
        (item) => SupplierSnapshot.fromJson(
          item.map((key, value) => MapEntry(key.toString(), value)),
        ),
      )
      .toList();
}

SupplierSnapshot? supplierById(
  List<SupplierSnapshot> suppliers,
  String? supplierId,
) {
  if (supplierId == null) return null;
  for (final supplier in suppliers) {
    if (supplier.id == supplierId) {
      return supplier;
    }
  }
  return null;
}

LocalSupplierExecution? findSupplierExecution(
  List<LocalSupplierExecution> executions,
  String? supplierId,
) {
  if (supplierId == null) return null;
  for (final execution in executions) {
    if (execution.supplierId == supplierId) {
      return execution;
    }
  }
  return null;
}

String supplierLabel(SupplierSnapshot supplier) => supplier.displayName;

List<ActivitySnapshot> activitiesForSupplier(
  SupplierSnapshot supplier,
  ClientSnapshot? client,
) {
  if (supplier.activities.isNotEmpty) {
    return supplier.activities;
  }

  return clientActivitiesFromPayload(client?.payload);
}

bool supplierRequiresDeliveryFlow(bool? deliveryReceived) =>
    deliveryReceived != false;

bool supplierExecutionRequiresJustification({
  required bool? deliveryReceived,
  required bool? stockoutFound,
}) => deliveryReceived == false || stockoutFound == true;

String answerLabel(bool? value) {
  if (value == null) return 'Nao informado';
  return value ? 'Sim' : 'Nao';
}

String photoLabel(String type) {
  return switch (type) {
    'checkin' => 'Check-in',
    'before' => 'Foto antes',
    'after' => 'Foto depois',
    'checkout' => 'Check-out',
    'supplier_before' => 'Foto antes',
    'supplier_after' => 'Foto depois',
    'store_extra' => 'Foto de categoria',
    'occurrence_extra' => 'Foto complementar',
    _ => 'Ocorrencia',
  };
}

String syncLabel(String status) {
  return switch (status) {
    'pending' => 'Pendente',
    'syncing' => 'Sincronizando',
    'synced' => 'Sincronizado',
    'failed' => 'Falha',
    _ => status,
  };
}

String formatDate(String? value) {
  if (value == null) return '-';
  final date = DateTime.tryParse(value);
  if (date == null) return '-';
  return DateFormat('dd/MM/yyyy HH:mm').format(date.toLocal());
}

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final clampedTextScale = mediaQuery.textScaler.clamp(
      minScaleFactor: 0.92,
      maxScaleFactor: 1.18,
    );

    return Scaffold(
      body: SafeArea(
        child: MediaQuery(
          data: mediaQuery.copyWith(textScaler: clampedTextScale),
          child: child,
        ),
      ),
    );
  }
}

class AppTopBar extends StatelessWidget {
  const AppTopBar({
    super.key,
    required this.title,
    this.subtitle,
    this.showBack = false,
    this.onLogout,
  });

  final String title;
  final String? subtitle;
  final bool showBack;
  final VoidCallback? onLogout;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 390;

        return Container(
          padding: EdgeInsets.fromLTRB(
            compact ? 12 : 16,
            12,
            compact ? 12 : 16,
            16,
          ),
          decoration: const BoxDecoration(color: brandNavy),
          child: Row(
            children: [
              if (showBack)
                OutlinedButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back),
                  label: const Text('Voltar'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: brandNavy,
                    backgroundColor: const Color(0xFFEFF6FF),
                    minimumSize: Size(compact ? 92 : 118, 46),
                    padding: EdgeInsets.symmetric(
                      horizontal: compact ? 10 : 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                )
              else
                Image.asset(
                  'assets/promotorpro-icon.png',
                  width: compact ? 36 : 42,
                  height: compact ? 36 : 42,
                ),
              SizedBox(width: compact ? 10 : 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: compact ? 20 : 24,
                        height: 1.08,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle!,
                        maxLines: compact ? 2 : 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: const Color(0xFFD6E2FF),
                          fontSize: compact ? 12 : 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (onLogout != null)
                IconButton(
                  tooltip: 'Sair',
                  onPressed: onLogout,
                  icon: const Icon(Icons.logout, color: Colors.white),
                ),
            ],
          ),
        );
      },
    );
  }
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key, required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.of(context).size.width < 390;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Image.asset(
          'assets/promotorpro-icon.png',
          width: compact ? 62 : 78,
          height: compact ? 62 : 78,
        ),
        SizedBox(height: compact ? 12 : 16),
        Text(
          'PROMOTORPRO',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            letterSpacing: 2,
            color: brandBlue,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          title,
          style:
              (compact
                      ? Theme.of(context).textTheme.headlineMedium
                      : Theme.of(context).textTheme.displaySmall)
                  ?.copyWith(fontWeight: FontWeight.w900, color: brandNavy),
        ),
        Text(
          subtitle,
          style: const TextStyle(
            color: Color(0xFF64748B),
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: brandBlue,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class DangerButton extends StatelessWidget {
  const DangerButton({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: Color(0xFFEF4444)),
          foregroundColor: const Color(0xFFB91C1C),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class OperatorIdentityCard extends StatelessWidget {
  const OperatorIdentityCard({
    super.key,
    required this.promoterName,
    required this.promoterEmail,
    required this.versionLabel,
  });

  final String promoterName;
  final String promoterEmail;
  final String versionLabel;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 360;

        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: line),
          ),
          child: compact
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: identityChildren(compact: true),
                )
              : Row(children: identityChildren(compact: false)),
        );
      },
    );
  }

  List<Widget> identityChildren({required bool compact}) {
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          promoterName,
          maxLines: compact ? 3 : 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: brandNavy,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          promoterEmail,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Color(0xFF64748B),
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          versionLabel,
          style: const TextStyle(
            color: brandBlue,
            fontSize: 12,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );

    return [
      const CircleAvatar(
        radius: 24,
        backgroundColor: brandNavy,
        child: Icon(Icons.person, color: Colors.white),
      ),
      SizedBox(width: compact ? 0 : 14, height: compact ? 12 : 0),
      compact ? details : Expanded(child: details),
    ];
  }
}

class MessageBox extends StatelessWidget {
  const MessageBox({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: Text(
        message,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          color: Color(0xFF475569),
        ),
      ),
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: brandNavy,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            body,
            style: const TextStyle(
              height: 1.45,
              color: Color(0xFF475569),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class DashboardGrid extends StatelessWidget {
  const DashboardGrid({super.key, required this.cards});

  final List<MetricData> cards;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final count = width >= 760
            ? 4
            : width >= 430
            ? 2
            : 1;
        final ratio = count == 1
            ? 3.2
            : width < 520
            ? 1.65
            : 1.45;

        return GridView.count(
          crossAxisCount: count,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: ratio,
          children: cards.map((card) => MetricCard(data: card)).toList(),
        );
      },
    );
  }
}

class MetricData {
  MetricData(this.label, this.value, this.icon);
  final String label;
  final String value;
  final IconData icon;
}

class MetricCard extends StatelessWidget {
  const MetricCard({super.key, required this.data});

  final MetricData data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(data.icon, color: brandBlue),
          const Spacer(),
          Text(
            data.value,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: brandNavy,
            ),
          ),
          Text(
            data.label,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              color: Color(0xFF64748B),
            ),
          ),
        ],
      ),
    );
  }
}

class ClientNameBlock extends StatelessWidget {
  const ClientNameBlock({
    super.key,
    required this.item,
    this.inverse = false,
    this.fontSize = 16,
    this.maxLines = 2,
  });

  final RouteItemView item;
  final bool inverse;
  final double fontSize;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final legalName = item.clientName.trim();
    final fantasyName = item.clientTradeName?.trim();
    final hasFantasy =
        fantasyName != null &&
        fantasyName.isNotEmpty &&
        fantasyName.toLowerCase() != legalName.toLowerCase();
    final primaryColor = inverse ? Colors.white : brandNavy;
    final secondaryColor = inverse
        ? const Color(0xFFE2E8F0)
        : const Color(0xFF64748B);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          hasFantasy
              ? fantasyName
              : (legalName.isEmpty ? 'Cliente' : legalName),
          maxLines: maxLines,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: primaryColor,
            fontSize: fontSize,
            fontWeight: FontWeight.w900,
          ),
        ),
        if (hasFantasy) ...[
          const SizedBox(height: 3),
          Text(
            'Razao social: $legalName',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: secondaryColor,
              fontSize: fontSize * 0.72,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ],
    );
  }
}

class RouteItemCard extends StatelessWidget {
  const RouteItemCard({super.key, required this.item, required this.onTap});

  final RouteItemView item;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    void handleTap() {
      unawaited(onTap());
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: line),
      ),
      child: InkWell(
        onTap: handleTap,
        borderRadius: BorderRadius.circular(22),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    backgroundColor: brandNavy,
                    child: Text(
                      '${item.sequence}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClientNameBlock(item: item, fontSize: 16, maxLines: 3),
                        const SizedBox(height: 6),
                        Text(
                          item.clientAddress ?? 'Endereco nao informado',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.routeName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        if (item.hasCoordinates) ...[
                          const SizedBox(height: 4),
                          const Text(
                            'GPS do cliente disponivel',
                            style: TextStyle(
                              color: brandGreen,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.chevron_right),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: handleTap,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text(
                    'Abrir atendimento',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RouteMapTab extends StatefulWidget {
  const RouteMapTab({super.key, required this.items});

  final List<RouteItemView> items;

  @override
  State<RouteMapTab> createState() => _RouteMapTabState();
}

class _RouteMapTabState extends State<RouteMapTab> {
  RouteItemView? selectedItem;
  GpsPoint? currentLocation;
  bool locating = true;

  List<RouteItemView> get mappedItems =>
      widget.items.where((item) => item.hasCoordinates).toList();

  @override
  void initState() {
    super.initState();
    selectedItem = mappedItems.isEmpty ? null : mappedItems.first;
    unawaited(_loadCurrentLocation());
  }

  @override
  void didUpdateWidget(covariant RouteMapTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (mappedItems.isEmpty) {
      selectedItem = null;
      return;
    }

    final selectedStillExists = mappedItems.any(
      (item) => item.id == selectedItem?.id,
    );
    if (!selectedStillExists) {
      selectedItem = mappedItems.first;
    }
  }

  Future<void> _loadCurrentLocation() async {
    final gps = await getGpsOrNull();
    if (!mounted) return;
    setState(() {
      currentLocation = gps;
      locating = false;
    });
  }

  LatLng _initialCenter() {
    final points = <LatLng>[
      for (final item in mappedItems)
        LatLng(item.clientLatitude!, item.clientLongitude!),
      if (currentLocation != null)
        LatLng(currentLocation!.latitude, currentLocation!.longitude),
    ];

    if (points.isEmpty) {
      return const LatLng(-15.6014, -56.0979);
    }

    final latitude =
        points.map((point) => point.latitude).reduce((a, b) => a + b) /
        points.length;
    final longitude =
        points.map((point) => point.longitude).reduce((a, b) => a + b) /
        points.length;
    return LatLng(latitude, longitude);
  }

  Future<void> _openNavigation(RouteItemView item) async {
    final latitude = item.clientLatitude;
    final longitude = item.clientLongitude;
    if (latitude == null || longitude == null) return;

    final googleMapsUri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude&travelmode=driving',
    );
    final geoUri = Uri.parse(
      'geo:$latitude,$longitude?q=$latitude,$longitude(${Uri.encodeComponent(item.navigationName)})',
    );

    final opened = await launchUrl(
      googleMapsUri,
      mode: LaunchMode.externalApplication,
    );
    if (opened) {
      return;
    }

    final openedGeo = await launchUrl(
      geoUri,
      mode: LaunchMode.externalApplication,
    );

    if (!openedGeo && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Nao foi possivel abrir o mapa deste aparelho.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (mappedItems.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          EmptyState(
            title: 'Nenhum cliente com GPS',
            body:
                'Os clientes desta rota ainda nao possuem latitude e longitude cadastradas. Cadastre as coordenadas na retaguarda para aparecerem no mapa.',
          ),
        ],
      );
    }

    final selected = selectedItem ?? mappedItems.first;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: InfoCard(
            title: 'Mapa do roteiro',
            body:
                '${mappedItems.length} cliente(s) com GPS. Toque em um ponto para selecionar e abrir a rota.',
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Stack(
                children: [
                  FlutterMap(
                    options: MapOptions(
                      initialCenter: _initialCenter(),
                      initialZoom: mappedItems.length == 1 ? 15 : 12,
                      minZoom: 4,
                      maxZoom: 19,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'br.com.promotorpro.mobile',
                      ),
                      MarkerLayer(
                        markers: [
                          for (final item in mappedItems)
                            Marker(
                              point: LatLng(
                                item.clientLatitude!,
                                item.clientLongitude!,
                              ),
                              width: 58,
                              height: 58,
                              child: GestureDetector(
                                onTap: () =>
                                    setState(() => selectedItem = item),
                                child: _ClientMapMarker(
                                  sequence: item.sequence,
                                  selected: selected.id == item.id,
                                ),
                              ),
                            ),
                          if (currentLocation != null)
                            Marker(
                              point: LatLng(
                                currentLocation!.latitude,
                                currentLocation!.longitude,
                              ),
                              width: 44,
                              height: 44,
                              child: const _CurrentLocationMarker(),
                            ),
                        ],
                      ),
                    ],
                  ),
                  Positioned(
                    top: 12,
                    left: 12,
                    right: 12,
                    child: _MapOverlayCard(
                      icon: locating ? Icons.gps_not_fixed : Icons.gps_fixed,
                      title: locating
                          ? 'Buscando sua posicao'
                          : currentLocation == null
                          ? 'Posicao do aparelho indisponivel'
                          : 'Sua posicao foi carregada',
                      body:
                          'Clientes com marcador azul estao prontos para navegacao.',
                    ),
                  ),
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
                    child: _SelectedClientPanel(
                      item: selected,
                      onNavigate: () => unawaited(_openNavigation(selected)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ClientMapMarker extends StatelessWidget {
  const _ClientMapMarker({required this.sequence, required this.selected});

  final int sequence;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: selected ? 1.15 : 1,
      duration: const Duration(milliseconds: 180),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: selected ? brandGreen : brandBlue,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 4),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.22),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Center(
          child: Text(
            '$sequence',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
  }
}

class _CurrentLocationMarker extends StatelessWidget {
  const _CurrentLocationMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: brandGreen.withValues(alpha: 0.2),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(
            color: brandGreen,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
          ),
        ),
      ),
    );
  }
}

class _MapOverlayCard extends StatelessWidget {
  const _MapOverlayCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: brandBlue),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: brandNavy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  body,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectedClientPanel extends StatelessWidget {
  const _SelectedClientPanel({required this.item, required this.onNavigate});

  final RouteItemView item;
  final VoidCallback onNavigate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ClientNameBlock(item: item, fontSize: 16),
          const SizedBox(height: 4),
          Text(
            item.clientAddress ?? 'Endereco nao informado',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${item.clientLatitude!.toStringAsFixed(6)}, ${item.clientLongitude!.toStringAsFixed(6)}',
                  style: const TextStyle(
                    color: Color(0xFF475569),
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              FilledButton.icon(
                onPressed: onNavigate,
                icon: const Icon(Icons.navigation),
                label: const Text('Tracar rota'),
                style: FilledButton.styleFrom(
                  backgroundColor: brandBlue,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ClientHero extends StatelessWidget {
  const ClientHero({super.key, required this.item, required this.status});

  final RouteItemView item;
  final String status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: brandNavy,
        borderRadius: BorderRadius.circular(26),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Cliente #${item.sequence}',
            style: const TextStyle(
              color: Color(0xFF94A3B8),
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          ClientNameBlock(item: item, inverse: true, fontSize: 24, maxLines: 4),
          const SizedBox(height: 6),
          Text(
            item.clientAddress ?? 'Endereco nao informado',
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFFE2E8F0),
              fontWeight: FontWeight.w600,
            ),
          ),
          if (item.hasCoordinates) ...[
            const SizedBox(height: 6),
            Text(
              'GPS do cliente: ${item.clientLatitude!.toStringAsFixed(6)}, ${item.clientLongitude!.toStringAsFixed(6)}',
              style: const TextStyle(
                color: Color(0xFF93C5FD),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Chip(
            label: Text(
              status,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            backgroundColor: Colors.white,
          ),
        ],
      ),
    );
  }
}

class EvidenceButton extends StatelessWidget {
  const EvidenceButton({
    super.key,
    required this.label,
    required this.ok,
    required this.onPressed,
  });

  final String label;
  final bool ok;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(
          ok ? Icons.check_circle : Icons.camera_alt,
          color: ok ? brandGreen : brandBlue,
        ),
        label: Align(
          alignment: Alignment.centerLeft,
          child: Text(
            ok ? '$label capturada' : label,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(64),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
    );
  }
}

class SupplierExecutionTile extends StatelessWidget {
  const SupplierExecutionTile({
    super.key,
    required this.supplier,
    required this.activityCount,
    required this.categoryCount,
    required this.categoryEvidenceCount,
    required this.status,
    required this.hasBefore,
    required this.hasAfter,
    required this.deliveryReceivedAnswered,
    required this.productsReplenishedAnswered,
    required this.stockoutFoundAnswered,
    required this.active,
    required this.onTap,
  });

  final SupplierSnapshot supplier;
  final int activityCount;
  final int categoryCount;
  final int categoryEvidenceCount;
  final String status;
  final bool hasBefore;
  final bool hasAfter;
  final bool deliveryReceivedAnswered;
  final bool productsReplenishedAnswered;
  final bool stockoutFoundAnswered;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final statusLabel = switch (status) {
      'completed' => 'Concluido',
      'in_progress' => 'Em andamento',
      _ => 'Pendente',
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: active ? brandBlue : line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      supplierLabel(supplier),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        color: brandNavy,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text(
                      statusLabel,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    backgroundColor: status == 'completed'
                        ? const Color(0xFFD1FAE5)
                        : status == 'in_progress'
                        ? const Color(0xFFDBEAFE)
                        : const Color(0xFFF8FAFC),
                  ),
                ],
              ),
              if ((supplier.document?.trim().isNotEmpty ?? false))
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Documento: ${supplier.document}',
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              if (activityCount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '$activityCount atividade(s) previstas neste fornecedor',
                    style: const TextStyle(
                      color: Color(0xFF2563EB),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              if (categoryCount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '$categoryEvidenceCount de $categoryCount categoria(s) com foto',
                    style: const TextStyle(
                      color: Color(0xFF0F766E),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _MiniStatusChip(
                    label: 'Entrega',
                    done: deliveryReceivedAnswered,
                  ),
                  _MiniStatusChip(label: 'Antes', done: hasBefore),
                  _MiniStatusChip(label: 'Depois', done: hasAfter),
                  _MiniStatusChip(
                    label: 'Abastecido',
                    done: productsReplenishedAnswered,
                  ),
                  _MiniStatusChip(
                    label: 'Ruptura',
                    done: stockoutFoundAnswered,
                  ),
                  if (categoryCount > 0)
                    _MiniStatusChip(
                      label: 'Categorias',
                      done: categoryEvidenceCount >= categoryCount,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SupplierExecutionEditor extends StatelessWidget {
  const SupplierExecutionEditor({
    super.key,
    required this.supplier,
    required this.activities,
    required this.categories,
    required this.categoryEvidenceCounts,
    required this.activityEvidenceCounts,
    required this.hasBefore,
    required this.hasAfter,
    required this.deliveryReceived,
    required this.productsReplenished,
    required this.stockoutFound,
    required this.notesController,
    required this.busy,
    required this.onCaptureBefore,
    required this.onCaptureAfter,
    required this.onCaptureCategory,
    required this.onCaptureActivity,
    required this.onDeliveryChanged,
    required this.onProductsChanged,
    required this.onStockoutChanged,
    required this.onNotesChanged,
    required this.onComplete,
    required this.onClose,
  });

  final SupplierSnapshot supplier;
  final List<ActivitySnapshot> activities;
  final List<CategorySnapshot> categories;
  final Map<String, int> categoryEvidenceCounts;
  final Map<String, int> activityEvidenceCounts;
  final bool hasBefore;
  final bool hasAfter;
  final bool? deliveryReceived;
  final bool? productsReplenished;
  final bool? stockoutFound;
  final TextEditingController notesController;
  final bool busy;
  final VoidCallback onCaptureBefore;
  final VoidCallback onCaptureAfter;
  final FutureOr<void> Function(CategorySnapshot category) onCaptureCategory;
  final FutureOr<void> Function(ActivitySnapshot activity) onCaptureActivity;
  final FutureOr<void> Function(bool? value) onDeliveryChanged;
  final FutureOr<void> Function(bool? value) onProductsChanged;
  final FutureOr<void> Function(bool? value) onStockoutChanged;
  final FutureOr<void> Function(String value) onNotesChanged;
  final FutureOr<void> Function() onComplete;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final requiresDeliveryFlow = supplierRequiresDeliveryFlow(deliveryReceived);
    final requiresJustification = supplierExecutionRequiresJustification(
      deliveryReceived: deliveryReceived,
      stockoutFound: stockoutFound,
    );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Fornecedor em execucao',
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      supplierLabel(supplier),
                      style: const TextStyle(
                        color: brandNavy,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: busy ? null : onClose,
                icon: const Icon(Icons.close, color: brandNavy),
              ),
            ],
          ),
          if (activities.isNotEmpty || categories.isNotEmpty) ...[
            const SizedBox(height: 14),
            SupplierActivitiesPanel(
              activities: activities,
              categories: categories,
              categoryEvidenceCounts: categoryEvidenceCounts,
              activityEvidenceCounts: activityEvidenceCounts,
              busy: busy,
              requireEvidencePhotos: requiresDeliveryFlow,
              onCaptureCategory: onCaptureCategory,
              onCaptureActivity: onCaptureActivity,
            ),
          ],
          const SizedBox(height: 14),
          BooleanAnswerField(
            label: 'Recebeu mercadoria hoje?',
            value: deliveryReceived,
            enabled: !busy,
            onChanged: onDeliveryChanged,
          ),
          if (requiresDeliveryFlow) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: EvidenceButton(
                    label: 'Foto antes do fornecedor',
                    ok: hasBefore,
                    onPressed: busy ? null : onCaptureBefore,
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: EvidenceButton(
                    label: 'Foto depois do fornecedor',
                    ok: hasAfter,
                    onPressed: busy ? null : onCaptureAfter,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            BooleanAnswerField(
              label: 'Produtos foram abastecidos?',
              value: productsReplenished,
              enabled: !busy,
              onChanged: onProductsChanged,
            ),
            const SizedBox(height: 10),
            BooleanAnswerField(
              label: 'Encontrou ruptura?',
              value: stockoutFound,
              enabled: !busy,
              onChanged: onStockoutChanged,
            ),
          ] else ...[
            const SizedBox(height: 10),
            const InfoCard(
              title: 'Sem entrega no fornecedor',
              body:
                  'Quando nao houve mercadoria, nao exigimos foto antes/depois. Informe o motivo na observacao para auditoria da retaguarda.',
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: notesController,
            minLines: 2,
            maxLines: 4,
            onChanged: (value) {
              final result = onNotesChanged(value);
              if (result is Future<void>) {
                unawaited(result);
              }
            },
            decoration:
                const InputDecoration(
                  labelText: 'Observacoes do fornecedor',
                  border: OutlineInputBorder(),
                ).copyWith(
                  labelText: requiresJustification
                      ? 'Observacoes do fornecedor (obrigatorio)'
                      : 'Observacoes do fornecedor',
                  hintText: requiresJustification
                      ? 'Explique por que nao teve entrega ou qual foi a ruptura encontrada.'
                      : 'Informe algo relevante sobre este fornecedor, se necessario.',
                  helperText: requiresJustification
                      ? 'Obrigatorio para sem entrega ou ruptura.'
                      : null,
                ),
          ),
          const SizedBox(height: 14),
          PrimaryButton(
            label: busy ? 'Salvando...' : 'Concluir fornecedor',
            onPressed: busy
                ? null
                : () {
                    final result = onComplete();
                    if (result is Future<void>) {
                      unawaited(result);
                    }
                  },
          ),
        ],
      ),
    );
  }
}

class SupplierActivitiesPanel extends StatelessWidget {
  const SupplierActivitiesPanel({
    super.key,
    required this.activities,
    required this.categories,
    required this.categoryEvidenceCounts,
    required this.activityEvidenceCounts,
    required this.busy,
    required this.requireEvidencePhotos,
    required this.onCaptureCategory,
    required this.onCaptureActivity,
  });

  final List<ActivitySnapshot> activities;
  final List<CategorySnapshot> categories;
  final Map<String, int> categoryEvidenceCounts;
  final Map<String, int> activityEvidenceCounts;
  final bool busy;
  final bool requireEvidencePhotos;
  final FutureOr<void> Function(CategorySnapshot category) onCaptureCategory;
  final FutureOr<void> Function(ActivitySnapshot activity) onCaptureActivity;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Categorias e atividades do fornecedor',
            style: TextStyle(
              color: brandNavy,
              fontWeight: FontWeight.w900,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Registre evidencias nas categorias e atividades antes da conclusao do fornecedor quando houver entrega.',
            style: TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          if (categories.isNotEmpty) ...[
            const _ExecutionSectionTitle(label: 'Categorias vinculadas'),
            ...categories.map(
              (category) => CategoryEvidenceItem(
                category: category,
                count: categoryEvidenceCounts[category.id] ?? 0,
                required: requireEvidencePhotos,
                busy: busy,
                onCapture: () {
                  final result = onCaptureCategory(category);
                  if (result is Future<void>) {
                    unawaited(result);
                  }
                },
              ),
            ),
            if (activities.isNotEmpty) const SizedBox(height: 6),
          ],
          if (activities.isNotEmpty)
            const _ExecutionSectionTitle(label: 'Atividades para executar'),
          ...activities.map(
            (activity) => ActivityEvidenceItem(
              activity: activity,
              count: activityEvidenceCounts[activity.id] ?? 0,
              required: requireEvidencePhotos,
              busy: busy,
              onCapture: () {
                final result = onCaptureActivity(activity);
                if (result is Future<void>) {
                  unawaited(result);
                }
              },
            ),
          ),
        ],
      ),
    );
  }
}

class CategoryEvidenceItem extends StatelessWidget {
  const CategoryEvidenceItem({
    super.key,
    required this.category,
    required this.count,
    required this.required,
    required this.busy,
    required this.onCapture,
  });

  final CategorySnapshot category;
  final int count;
  final bool required;
  final bool busy;
  final VoidCallback onCapture;

  @override
  Widget build(BuildContext context) {
    final done = count > 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: done ? const Color(0xFFECFDF5) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: done ? const Color(0xFFA7F3D0) : line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 2),
                height: 24,
                width: 24,
                decoration: BoxDecoration(
                  color: done ? brandGreen : const Color(0xFFDBEAFE),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  done ? Icons.check : Icons.photo_camera_outlined,
                  color: done ? Colors.white : brandBlue,
                  size: 15,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      category.displayName,
                      style: const TextStyle(
                        color: brandNavy,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if ((category.description?.trim().isNotEmpty ?? false))
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          category.description!.trim(),
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  done
                      ? '$count foto(s) registrada(s)'
                      : required
                      ? 'Foto obrigatoria para concluir'
                      : 'Foto opcional enquanto nao houver entrega',
                  style: TextStyle(
                    color: done
                        ? const Color(0xFF047857)
                        : const Color(0xFF64748B),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: busy ? null : onCapture,
                icon: const Icon(Icons.camera_alt_outlined, size: 18),
                label: const Text('Foto da categoria'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ActivityEvidenceItem extends StatelessWidget {
  const ActivityEvidenceItem({
    super.key,
    required this.activity,
    required this.count,
    required this.required,
    required this.busy,
    required this.onCapture,
  });

  final ActivitySnapshot activity;
  final int count;
  final bool required;
  final bool busy;
  final VoidCallback onCapture;

  @override
  Widget build(BuildContext context) {
    final done = count > 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: done ? const Color(0xFFECFDF5) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: done ? const Color(0xFFA7F3D0) : line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 2),
                height: 24,
                width: 24,
                decoration: BoxDecoration(
                  color: done ? brandGreen : const Color(0xFFDBEAFE),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  done ? Icons.check : Icons.task_alt_outlined,
                  color: done ? Colors.white : brandBlue,
                  size: 15,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      activity.displayName,
                      style: const TextStyle(
                        color: brandNavy,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if ((activity.description?.trim().isNotEmpty ?? false))
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          activity.description!.trim(),
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  done
                      ? '$count foto(s) registrada(s)'
                      : required
                      ? 'Foto obrigatoria para concluir'
                      : 'Foto opcional enquanto nao houver entrega',
                  style: TextStyle(
                    color: done
                        ? const Color(0xFF047857)
                        : const Color(0xFF64748B),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: busy ? null : onCapture,
                icon: const Icon(Icons.camera_alt_outlined, size: 18),
                label: const Text('Foto da atividade'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ExecutionSectionTitle extends StatelessWidget {
  const _ExecutionSectionTitle({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      label,
      style: const TextStyle(
        color: Color(0xFF64748B),
        fontSize: 12,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class BooleanAnswerField extends StatelessWidget {
  const BooleanAnswerField({
    super.key,
    required this.label,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final String label;
  final bool? value;
  final bool enabled;
  final FutureOr<void> Function(bool? value) onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: brandNavy, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _BooleanChoiceButton(
                label: 'Sim',
                selected: value == true,
                enabled: enabled,
                onTap: () {
                  final result = onChanged(true);
                  if (result is Future<void>) {
                    unawaited(result);
                  }
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _BooleanChoiceButton(
                label: 'Nao',
                selected: value == false,
                enabled: enabled,
                onTap: () {
                  final result = onChanged(false);
                  if (result is Future<void>) {
                    unawaited(result);
                  }
                },
              ),
            ),
          ],
        ),
        if (value != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'Resposta atual: ${answerLabel(value)}',
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }
}

class _BooleanChoiceButton extends StatelessWidget {
  const _BooleanChoiceButton({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: enabled ? onTap : null,
        style: OutlinedButton.styleFrom(
          backgroundColor: selected ? const Color(0xFFDBEAFE) : Colors.white,
          side: BorderSide(color: selected ? brandBlue : line),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? brandBlue : brandNavy,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class _MiniStatusChip extends StatelessWidget {
  const _MiniStatusChip({required this.label, required this.done});

  final String label;
  final bool done;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: done ? const Color(0xFFD1FAE5) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: done ? const Color(0xFF6EE7B7) : const Color(0xFFE2E8F0),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            done ? Icons.check_circle : Icons.radio_button_unchecked,
            size: 14,
            color: done ? brandGreen : const Color(0xFF94A3B8),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: done ? const Color(0xFF047857) : const Color(0xFF64748B),
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class PhotoTile extends StatelessWidget {
  const PhotoTile({super.key, required this.photo, required this.suppliers});

  final LocalPhoto photo;
  final List<SupplierSnapshot> suppliers;

  @override
  Widget build(BuildContext context) {
    final supplier = supplierById(suppliers, photo.supplierId);
    final supplierText = supplier == null
        ? null
        : 'Fornecedor: ${supplierLabel(supplier)}';
    final categoryText = (photo.categoryName?.trim().isNotEmpty ?? false)
        ? 'Categoria: ${photo.categoryName!.trim()}'
        : null;
    final activityText = (photo.activityName?.trim().isNotEmpty ?? false)
        ? 'Atividade: ${photo.activityName!.trim()}'
        : null;
    final title = [
      if (photo.categoryName?.trim().isNotEmpty ?? false)
        'Foto da categoria ${photo.categoryName!.trim()}'
      else if (photo.activityName?.trim().isNotEmpty ?? false)
        'Foto da atividade ${photo.activityName!.trim()}'
      else
        photoLabel(photo.type),
      if (supplier != null) supplierLabel(supplier),
    ].join(' - ');
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: line),
      ),
      child: ListTile(
        leading: const Icon(Icons.photo_camera, color: brandBlue),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(
          '${supplierText == null ? '' : '$supplierText\n'}${categoryText == null ? '' : '$categoryText\n'}${activityText == null ? '' : '$activityText\n'}Capturada: ${formatDate(photo.capturedAt)}\nGPS: ${photo.gpsLatitude?.toStringAsFixed(6) ?? 'sem gps'}, ${photo.gpsLongitude?.toStringAsFixed(6) ?? 'sem gps'}',
        ),
      ),
    );
  }
}

class DiagnosticCard extends StatelessWidget {
  const DiagnosticCard({super.key, required this.item});

  final QueueDiagnostic item;

  @override
  Widget build(BuildContext context) {
    final entityLabel = switch (item.kind) {
      'visit' => 'Visita',
      'supplierExecution' =>
        item.supplierName == null
            ? 'Fornecedor'
            : 'Fornecedor ${item.supplierName}',
      'photo' =>
        item.categoryName?.trim().isNotEmpty ?? false
            ? 'Foto da categoria ${item.categoryName}'
            : item.activityName?.trim().isNotEmpty ?? false
            ? 'Foto da atividade ${item.activityName}'
            : item.supplierName == null
            ? item.photoType == null
                  ? 'Foto'
                  : 'Foto ${photoLabel(item.photoType!).toLowerCase()}'
            : 'Foto ${photoLabel(item.photoType ?? 'occurrence_extra').toLowerCase()} de ${item.supplierName}',
      _ => item.kind,
    };
    return Card(
      elevation: 0,
      color: const Color(0xFFFFFBEB),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Color(0xFFF59E0B)),
      ),
      child: ListTile(
        title: Text(
          '$entityLabel - ${item.clientName ?? 'cliente'}',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(
          'Situacao: ${syncLabel(item.status)} | Tentativas: ${item.attempts}\n${item.lastError ?? 'Sem mensagem tecnica registrada.'}',
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Column(
        children: [
          const Icon(Icons.task_alt, color: brandGreen, size: 44),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              color: brandNavy,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
