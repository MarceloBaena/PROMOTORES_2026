import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_map/flutter_map.dart';
import 'package:flutter/material.dart';
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

const maxEvidencePhotosPerCategoryOrActivity = 5;
const appVersionLabel = 'APK Flutter v1.1.14 (build 17)';
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

  void _showError(String title, String text) {
    showDialog<void>(
      context: context,
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
              repository: widget.repository,
              session: session!,
              routeItems: routeItems,
              queueSummary: queueSummary,
              message: message,
              busy: busy,
              onRefresh: _refreshRoute,
              onSync: _syncNow,
              onChanged: _reload,
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
            title: 'Controle de equipe de campo',
            subtitle: 'Aplicativo operacional PromotorPro',
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

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.repository,
    required this.session,
    required this.routeItems,
    required this.queueSummary,
    required this.message,
    required this.busy,
    required this.onRefresh,
    required this.onSync,
    required this.onChanged,
    required this.onLogout,
  });

  final AppRepository repository;
  final Session session;
  final List<RouteItemView> routeItems;
  final QueueSummary queueSummary;
  final String message;
  final bool busy;
  final VoidCallback onRefresh;
  final Future<void> Function() onSync;
  final Future<void> Function({String? nextMessage}) onChanged;
  final VoidCallback onLogout;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool showMapTab = false;

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await confirmAction(
      context,
      title: 'Sair do aplicativo',
      body:
          'Deseja encerrar a sessao neste aparelho agora? O roteiro offline fica salvo, mas sera necessario entrar novamente para sincronizar.',
      confirmLabel: 'Sair agora',
    );
    if (confirmed == true) {
      widget.onLogout();
    }
  }

  Future<void> _openSync(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SyncPage(
          repository: widget.repository,
          promoterName: widget.session.user.name,
          onSync: widget.onSync,
          onChanged: widget.onChanged,
        ),
      ),
    );
  }

  Future<void> _openMapFullScreen(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RouteMapPage(
          repository: widget.repository,
          promoterName: widget.session.user.name,
          routeItems: widget.routeItems,
          onVisitChanged: widget.onChanged,
        ),
      ),
    );
  }

  Future<void> _openClientMap(BuildContext context, RouteItemView item) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RouteMapPage(
          repository: widget.repository,
          promoterName: widget.session.user.name,
          routeItems: widget.routeItems,
          onVisitChanged: widget.onChanged,
          initialItemId: item.id,
        ),
      ),
    );
  }

  Future<void> _openVisit(BuildContext context, RouteItemView item) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VisitPage(
          repository: widget.repository,
          item: item,
          promoterName: widget.session.user.name,
        ),
      ),
    );
    await widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final pendingItems = widget.routeItems
        .where((item) => !item.isDone)
        .toList();
    final completedItems = widget.routeItems
        .where((item) => item.isDone)
        .length;
    return AppShell(
      child: Column(
        children: [
          AppTopBar(
            title: 'Roteiro do promotor',
            subtitle: 'Promotor: ${widget.session.user.name}',
            onLogout: () => unawaited(_confirmLogout(context)),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => widget.onRefresh(),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                  OperatorIdentityCard(
                    promoterName: widget.session.user.name,
                    promoterEmail: widget.session.user.email,
                    versionLabel: appVersionLabel,
                  ),
                  const SizedBox(height: 14),
                  CompactHomeStatusCard(
                    totalClients: widget.routeItems.length,
                    pendingClients: pendingItems.length,
                    completedClients: completedItems,
                    pendingSync: widget.queueSummary.pending,
                    failedSync: widget.queueSummary.failed,
                  ),
                  const SizedBox(height: 14),
                  _HomeSectionSwitch(
                    showMap: showMapTab,
                    onChange: (value) => setState(() => showMapTab = value),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: SecondaryButton(
                          label: 'Atualizar roteiro',
                          onPressed: widget.busy ? null : widget.onRefresh,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: PrimaryButton(
                          label: widget.busy ? 'Aguarde...' : 'Sync',
                          onPressed: widget.busy ? null : widget.onSync,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SecondaryButton(
                    label: 'Ver fila de sincronizacao',
                    onPressed: () => unawaited(_openSync(context)),
                  ),
                  const SizedBox(height: 10),
                  DangerButton(
                    label: 'Sair do app',
                    onPressed: widget.busy
                        ? null
                        : () => unawaited(_confirmLogout(context)),
                  ),
                  const SizedBox(height: 14),
                  MessageBox(message: widget.message),
                  const SizedBox(height: 16),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    child: showMapTab
                        ? RouteMapContent(
                            key: const ValueKey('route-map-tab'),
                            repository: widget.repository,
                            promoterName: widget.session.user.name,
                            routeItems: widget.routeItems,
                            onVisitChanged: widget.onChanged,
                            embedded: true,
                            onOpenFullScreen: () => _openMapFullScreen(context),
                          )
                        : _HomeRouteListSection(
                            key: const ValueKey('route-list-tab'),
                            pendingItems: pendingItems,
                            onOpenVisit: (item) => _openVisit(context, item),
                            onOpenMap: (item) => _openClientMap(context, item),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeSectionSwitch extends StatelessWidget {
  const _HomeSectionSwitch({required this.showMap, required this.onChange});

  final bool showMap;
  final ValueChanged<bool> onChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Row(
        children: [
          Expanded(
            child: _HomeSectionButton(
              label: 'Atendimento',
              icon: Icons.list_alt,
              selected: !showMap,
              onPressed: () => onChange(false),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _HomeSectionButton(
              label: 'Mapa',
              icon: Icons.map_outlined,
              selected: showMap,
              onPressed: () => onChange(true),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeSectionButton extends StatelessWidget {
  const _HomeSectionButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? brandBlue : Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: selected ? Colors.white : brandNavy),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : brandNavy,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeRouteListSection extends StatelessWidget {
  const _HomeRouteListSection({
    super.key,
    required this.pendingItems,
    required this.onOpenVisit,
    required this.onOpenMap,
  });

  final List<RouteItemView> pendingItems;
  final Future<void> Function(RouteItemView item) onOpenVisit;
  final Future<void> Function(RouteItemView item) onOpenMap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Clientes de hoje',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
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
              onTap: () => unawaited(onOpenVisit(item)),
              onOpenVisit: () => unawaited(onOpenVisit(item)),
              onOpenMap: item.hasCoordinates
                  ? () => unawaited(onOpenMap(item))
                  : null,
            ),
          ),
      ],
    );
  }
}

class RouteMapPage extends StatelessWidget {
  const RouteMapPage({
    super.key,
    required this.repository,
    required this.promoterName,
    required this.routeItems,
    required this.onVisitChanged,
    this.initialItemId,
  });

  final AppRepository repository;
  final String promoterName;
  final List<RouteItemView> routeItems;
  final Future<void> Function({String? nextMessage}) onVisitChanged;
  final String? initialItemId;

  @override
  Widget build(BuildContext context) {
    return AppShell(
      child: Column(
        children: [
          AppTopBar(
            title: 'Mapa do roteiro',
            subtitle: 'Promotor: $promoterName',
            showBack: true,
          ),
          Expanded(
            child: RouteMapContent(
              repository: repository,
              promoterName: promoterName,
              routeItems: routeItems,
              onVisitChanged: onVisitChanged,
              initialItemId: initialItemId,
            ),
          ),
        ],
      ),
    );
  }
}

class RouteMapContent extends StatefulWidget {
  const RouteMapContent({
    super.key,
    required this.repository,
    required this.promoterName,
    required this.routeItems,
    required this.onVisitChanged,
    this.initialItemId,
    this.embedded = false,
    this.onOpenFullScreen,
  });

  final AppRepository repository;
  final String promoterName;
  final List<RouteItemView> routeItems;
  final Future<void> Function({String? nextMessage}) onVisitChanged;
  final String? initialItemId;
  final bool embedded;
  final VoidCallback? onOpenFullScreen;

  @override
  State<RouteMapContent> createState() => _RouteMapContentState();
}

class _RouteMapContentState extends State<RouteMapContent> {
  final MapController mapController = MapController();
  RouteItemView? selectedItem;
  bool showOnlyPending = false;
  final Distance _distance = const Distance();

  List<RouteItemView> get orderedRouteItems =>
      [...widget.routeItems]
        ..sort((first, second) => first.sequence.compareTo(second.sequence));

  List<RouteItemView> get itemsWithCoordinates =>
      orderedRouteItems.where((item) => item.hasCoordinates).toList();

  List<RouteItemView> get visibleRouteItems => showOnlyPending
      ? orderedRouteItems.where((item) => !item.isDone).toList()
      : orderedRouteItems;

  List<RouteItemView> get visibleItemsWithCoordinates =>
      visibleRouteItems.where((item) => item.hasCoordinates).toList();

  List<RouteItemView> get itemsWithoutCoordinates =>
      orderedRouteItems.where((item) => !item.hasCoordinates).toList();

  RouteItemView? get currentRouteItem {
    for (final item in orderedRouteItems) {
      if (!item.isDone) {
        return item;
      }
    }
    return orderedRouteItems.isNotEmpty ? orderedRouteItems.first : null;
  }

  RouteItemView? get nextPendingRouteItem {
    if (selectedItem == null) {
      return currentRouteItem;
    }

    var afterSelected = false;
    for (final item in orderedRouteItems) {
      if (afterSelected && !item.isDone) {
        return item;
      }
      if (item.id == selectedItem!.id) {
        afterSelected = true;
      }
    }
    return currentRouteItem;
  }

  RouteItemView? get nextRouteItemAfterCurrent {
    final current = currentRouteItem;
    if (current == null) {
      return null;
    }

    var afterCurrent = false;
    for (final item in orderedRouteItems) {
      if (afterCurrent) {
        return item;
      }
      if (item.id == current.id) {
        afterCurrent = true;
      }
    }
    return null;
  }

  double get routeProgress {
    if (orderedRouteItems.isEmpty) {
      return 0;
    }

    final doneCount = orderedRouteItems.where((item) => item.isDone).length;
    return doneCount / orderedRouteItems.length;
  }

  LatLng get initialCenter {
    if (itemsWithCoordinates.isEmpty) {
      return const LatLng(-15.6014, -56.0979);
    }

    final latitudes = itemsWithCoordinates
        .map((item) => item.clientLatitude!)
        .toList();
    final longitudes = itemsWithCoordinates
        .map((item) => item.clientLongitude!)
        .toList();

    final averageLat =
        latitudes.reduce((first, second) => first + second) / latitudes.length;
    final averageLng =
        longitudes.reduce((first, second) => first + second) /
        longitudes.length;
    return LatLng(averageLat, averageLng);
  }

  Future<void> _openExternalNavigation(RouteItemView item) async {
    if (!item.hasCoordinates) {
      return;
    }

    final latitude = item.clientLatitude!;
    final longitude = item.clientLongitude!;
    final encodedLabel = Uri.encodeComponent(item.clientName);
    final googleUri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$latitude,$longitude',
    );
    final geoUri = Uri.parse(
      'geo:$latitude,$longitude?q=$latitude,$longitude($encodedLabel)',
    );

    if (await canLaunchUrl(googleUri)) {
      await launchUrl(googleUri, mode: LaunchMode.externalApplication);
      return;
    }

    if (await canLaunchUrl(geoUri)) {
      await launchUrl(geoUri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _openVisit(RouteItemView item) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VisitPage(
          repository: widget.repository,
          item: item,
          promoterName: widget.promoterName,
        ),
      ),
    );
    await widget.onVisitChanged();
  }

  void _focusOnItem(RouteItemView item, {double zoom = 15}) {
    if (!item.hasCoordinates) {
      return;
    }

    setState(() => selectedItem = item);
    mapController.move(
      LatLng(item.clientLatitude!, item.clientLongitude!),
      zoom,
    );
  }

  void _focusOnCurrentOrNext() {
    final target = nextPendingRouteItem ?? currentRouteItem;
    if (target != null && target.hasCoordinates) {
      _focusOnItem(target, zoom: 16);
    }
  }

  String _distanceLabel(RouteItemView? from, RouteItemView? to) {
    if (from == null ||
        to == null ||
        !from.hasCoordinates ||
        !to.hasCoordinates) {
      return 'Sem distancia estimada';
    }

    final meters = _distance.as(
      LengthUnit.Meter,
      LatLng(from.clientLatitude!, from.clientLongitude!),
      LatLng(to.clientLatitude!, to.clientLongitude!),
    );

    if (meters < 1000) {
      return '${meters.round()} m';
    }

    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  @override
  void initState() {
    super.initState();
    _syncSelectedItem();
  }

  @override
  void didUpdateWidget(covariant RouteMapContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.routeItems != widget.routeItems) {
      _syncSelectedItem();
    }
  }

  void _syncSelectedItem() {
    if (widget.routeItems.isEmpty) {
      selectedItem = null;
      return;
    }

    if (widget.initialItemId != null) {
      for (final item in widget.routeItems) {
        if (item.id == widget.initialItemId) {
          selectedItem = item;
          return;
        }
      }
    }

    final pendingWithCoordinates = widget.routeItems.where(
      (item) => !item.isDone && item.hasCoordinates,
    );
    final allWithCoordinates = widget.routeItems.where(
      (item) => item.hasCoordinates,
    );

    final initial = pendingWithCoordinates.isNotEmpty
        ? pendingWithCoordinates.first
        : allWithCoordinates.isNotEmpty
        ? allWithCoordinates.first
        : widget.routeItems.first;

    if (initial.hasCoordinates) {
      selectedItem = initial;
    }
  }

  @override
  Widget build(BuildContext context) {
    final highlightedItem =
        selectedItem ??
        currentRouteItem ??
        (itemsWithCoordinates.isNotEmpty ? itemsWithCoordinates.first : null);
    final doneCount = orderedRouteItems.where((item) => item.isDone).length;
    final pendingCount = orderedRouteItems.where((item) => !item.isDone).length;
    final currentToNextLabel = _distanceLabel(
      currentRouteItem,
      nextRouteItemAfterCurrent,
    );

    return ListView(
      padding: EdgeInsets.fromLTRB(16, widget.embedded ? 0 : 16, 16, 16),
      children: [
        if (!widget.embedded) ...[
          const InfoCard(
            title: 'Mapa de apoio',
            body:
                'Veja os clientes com coordenadas salvas e use a navegacao externa para chegar ao ponto de venda.',
          ),
          const SizedBox(height: 12),
        ],
        DashboardGrid(
          cards: [
            MetricData(
              'Rota total',
              orderedRouteItems.length.toString(),
              Icons.route,
            ),
            MetricData(
              'Cliente atual',
              currentRouteItem?.sequence.toString() ?? '-',
              Icons.navigation,
            ),
            MetricData(
              'Pendentes',
              pendingCount.toString(),
              Icons.pending_actions,
            ),
            MetricData('Concluidos', doneCount.toString(), Icons.verified),
            MetricData('Proximo salto', currentToNextLabel, Icons.near_me),
          ],
        ),
        const SizedBox(height: 12),
        if (widget.embedded && widget.onOpenFullScreen != null) ...[
          SecondaryButton(
            label: 'Abrir mapa em tela cheia',
            onPressed: widget.onOpenFullScreen,
          ),
          const SizedBox(height: 12),
        ],
        _MapNextStopCard(
          currentItem: currentRouteItem,
          nextItem: nextRouteItemAfterCurrent,
          pendingCount: pendingCount,
          doneCount: doneCount,
          progress: routeProgress,
          nextJumpLabel: currentToNextLabel,
          onFocusCurrent: _focusOnCurrentOrNext,
          onOpenCurrentVisit: currentRouteItem == null
              ? null
              : () => unawaited(_openVisit(currentRouteItem!)),
          onOpenCurrentNavigation:
              currentRouteItem != null && currentRouteItem!.hasCoordinates
              ? () => _openExternalNavigation(currentRouteItem!)
              : null,
        ),
        const SizedBox(height: 12),
        const _MapLegendCard(),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: SecondaryButton(
                label: showOnlyPending
                    ? 'Mostrar todos'
                    : 'Mostrar so pendentes',
                onPressed: () {
                  setState(() {
                    showOnlyPending = !showOnlyPending;
                    if (showOnlyPending &&
                        selectedItem != null &&
                        selectedItem!.isDone) {
                      selectedItem = nextPendingRouteItem;
                    }
                  });
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: PrimaryButton(
                label: 'Ir para proximo',
                onPressed:
                    nextPendingRouteItem != null &&
                        nextPendingRouteItem!.hasCoordinates
                    ? () => _focusOnItem(nextPendingRouteItem!)
                    : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        PrimaryButton(
          label: currentRouteItem == null
              ? 'Rota concluida'
              : 'Iniciar cliente atual',
          onPressed: currentRouteItem == null
              ? null
              : () => unawaited(_openVisit(currentRouteItem!)),
        ),
        const SizedBox(height: 12),
        if (visibleItemsWithCoordinates.isEmpty)
          const EmptyState(
            title: 'Nenhum cliente com coordenadas',
            body:
                'Quando o cadastro do cliente tiver latitude e longitude, o ponto aparecera aqui no mapa.',
          )
        else ...[
          Container(
            height: 320,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: line),
            ),
            clipBehavior: Clip.antiAlias,
            child: FlutterMap(
              mapController: mapController,
              options: MapOptions(
                initialCenter: highlightedItem?.hasCoordinates == true
                    ? LatLng(
                        highlightedItem!.clientLatitude!,
                        highlightedItem.clientLongitude!,
                      )
                    : initialCenter,
                initialZoom: 12,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'promotorpro_mobile',
                ),
                if (visibleItemsWithCoordinates.length > 1)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: visibleItemsWithCoordinates
                            .map(
                              (item) => LatLng(
                                item.clientLatitude!,
                                item.clientLongitude!,
                              ),
                            )
                            .toList(),
                        strokeWidth: 4,
                        color: brandBlue.withValues(alpha: 0.7),
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: visibleItemsWithCoordinates.map((item) {
                    final isSelected = selectedItem?.id == item.id;
                    final isCurrent = currentRouteItem?.id == item.id;
                    final isDone = item.isDone;
                    return Marker(
                      point: LatLng(
                        item.clientLatitude!,
                        item.clientLongitude!,
                      ),
                      width: 52,
                      height: 52,
                      child: GestureDetector(
                        onTap: () => _focusOnItem(item, zoom: 16),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          decoration: BoxDecoration(
                            color: isCurrent
                                ? const Color(0xFFF59E0B)
                                : isDone
                                ? brandGreen
                                : isSelected
                                ? brandBlue
                                : const Color(0xFF334155),
                            shape: BoxShape.circle,
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x33172233),
                                blurRadius: 12,
                                offset: Offset(0, 6),
                              ),
                            ],
                            border: Border.all(color: Colors.white, width: 3),
                          ),
                          child: Center(
                            child: Text(
                              '${item.sequence}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 15,
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (highlightedItem != null)
            _MapRouteItemCard(
              item: highlightedItem,
              isCurrent: currentRouteItem?.id == highlightedItem.id,
              distanceFromCurrent: highlightedItem.id == currentRouteItem?.id
                  ? null
                  : _distanceLabel(currentRouteItem, highlightedItem),
              onOpenVisit: () => unawaited(_openVisit(highlightedItem)),
              onOpenNavigation: highlightedItem.hasCoordinates
                  ? () => _openExternalNavigation(highlightedItem)
                  : null,
            ),
        ],
        const SizedBox(height: 16),
        Text(
          'Clientes do roteiro',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 10),
        ...visibleRouteItems.map(
          (item) => _RouteMapListTile(
            item: item,
            isCurrent: currentRouteItem?.id == item.id,
            selected: selectedItem?.id == item.id,
            onTap: item.hasCoordinates ? () => _focusOnItem(item) : null,
            onOpenVisit: () => unawaited(_openVisit(item)),
            onOpenNavigation: item.hasCoordinates
                ? () => _openExternalNavigation(item)
                : null,
          ),
        ),
        if (itemsWithoutCoordinates.isNotEmpty) ...[
          const SizedBox(height: 12),
          InfoCard(
            title: 'Clientes sem coordenadas',
            body:
                '${itemsWithoutCoordinates.length} cliente(s) ainda nao possuem latitude e longitude cadastradas na retaguarda.',
          ),
        ],
      ],
    );
  }
}

class _MapRouteItemCard extends StatelessWidget {
  const _MapRouteItemCard({
    required this.item,
    required this.isCurrent,
    required this.distanceFromCurrent,
    required this.onOpenVisit,
    required this.onOpenNavigation,
  });

  final RouteItemView item;
  final bool isCurrent;
  final String? distanceFromCurrent;
  final VoidCallback onOpenVisit;
  final VoidCallback? onOpenNavigation;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFFFFF), Color(0xFFF8FBFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14172233),
            blurRadius: 18,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MapStatusChip(
                label: isCurrent
                    ? 'Cliente atual'
                    : (item.isDone ? 'Concluido' : 'Pendente'),
                color: isCurrent
                    ? const Color(0xFFF59E0B)
                    : item.isDone
                    ? brandGreen
                    : brandBlue,
              ),
              _MapStatusChip(label: 'Ordem ${item.sequence}', color: brandNavy),
              if (distanceFromCurrent != null)
                _MapStatusChip(label: distanceFromCurrent!, color: brandBlue),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: (isCurrent ? const Color(0xFFF59E0B) : brandBlue)
                      .withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  isCurrent ? Icons.near_me : Icons.location_on_outlined,
                  color: isCurrent ? const Color(0xFFF59E0B) : brandBlue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.clientName,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            item.clientAddress?.trim().isNotEmpty == true
                ? item.clientAddress!
                : 'Endereco nao informado',
            style: const TextStyle(
              color: Color(0xFF475569),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Rota: ${item.routeName}',
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w700,
            ),
          ),
          if (item.hasCoordinates) ...[
            const SizedBox(height: 8),
            Text(
              'GPS: ${item.clientLatitude!.toStringAsFixed(6)}, ${item.clientLongitude!.toStringAsFixed(6)}',
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  label: 'Abrir atendimento',
                  onPressed: onOpenVisit,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: PrimaryButton(
                  label: 'Navegar',
                  onPressed: onOpenNavigation,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RouteMapListTile extends StatelessWidget {
  const _RouteMapListTile({
    required this.item,
    required this.isCurrent,
    required this.selected,
    required this.onTap,
    required this.onOpenVisit,
    required this.onOpenNavigation,
  });

  final RouteItemView item;
  final bool isCurrent;
  final bool selected;
  final VoidCallback? onTap;
  final VoidCallback onOpenVisit;
  final VoidCallback? onOpenNavigation;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFEFF6FF) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: selected ? brandBlue : line),
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: isCurrent
              ? const Color(0xFFF59E0B)
              : item.isDone
              ? brandGreen
              : item.hasCoordinates
              ? brandBlue
              : const Color(0xFF94A3B8),
          child: Text(
            '${item.sequence}',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        title: Text(
          item.clientName,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.clientAddress?.trim().isNotEmpty == true
                    ? item.clientAddress!
                    : 'Endereco nao informado',
              ),
              const SizedBox(height: 2),
              Text(
                isCurrent
                    ? 'Cliente atual da rota'
                    : item.isDone
                    ? 'Atendimento concluido'
                    : item.hasCoordinates
                    ? 'GPS disponivel'
                    : 'Cliente sem coordenadas cadastradas',
                style: TextStyle(
                  color: isCurrent
                      ? const Color(0xFFF59E0B)
                      : item.isDone
                      ? brandGreen
                      : item.hasCoordinates
                      ? brandBlue
                      : const Color(0xFFB45309),
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Rota ${item.routeName}',
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _MiniActionChip(
                    icon: Icons.assignment_turned_in_outlined,
                    label: 'Atendimento',
                    onTap: onOpenVisit,
                  ),
                  if (onOpenNavigation != null)
                    _MiniActionChip(
                      icon: Icons.navigation_outlined,
                      label: 'Navegar',
                      onTap: onOpenNavigation!,
                    ),
                ],
              ),
            ],
          ),
        ),
        trailing: Icon(
          selected ? Icons.radio_button_checked : Icons.chevron_right,
          color: selected ? brandBlue : const Color(0xFF94A3B8),
        ),
      ),
    );
  }
}

class _MapNextStopCard extends StatelessWidget {
  const _MapNextStopCard({
    required this.currentItem,
    required this.nextItem,
    required this.pendingCount,
    required this.doneCount,
    required this.progress,
    required this.nextJumpLabel,
    required this.onFocusCurrent,
    required this.onOpenCurrentVisit,
    required this.onOpenCurrentNavigation,
  });

  final RouteItemView? currentItem;
  final RouteItemView? nextItem;
  final int pendingCount;
  final int doneCount;
  final double progress;
  final String nextJumpLabel;
  final VoidCallback onFocusCurrent;
  final VoidCallback? onOpenCurrentVisit;
  final VoidCallback? onOpenCurrentNavigation;

  @override
  Widget build(BuildContext context) {
    final activeItem = currentItem ?? nextItem;
    final percentLabel = '${(progress * 100).round()}%';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [brandNavy, Color(0xFF172554)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22172233),
            blurRadius: 22,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white24),
                ),
                child: const Text(
                  'Navegacao do dia',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                percentLabel,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 22,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            activeItem?.clientName ?? 'Nenhum cliente pendente',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            activeItem == null
                ? 'A rota atual ja foi concluida.'
                : currentItem != null
                ? 'Cliente em destaque para atendimento agora.'
                : 'Proxima parada sugerida para continuar a rota.',
            style: const TextStyle(
              color: Color(0xFFCBD5E1),
              height: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
          LinearProgressIndicator(
            value: progress == 0 ? 0.02 : progress,
            minHeight: 10,
            borderRadius: BorderRadius.circular(999),
            backgroundColor: Colors.white24,
            valueColor: const AlwaysStoppedAnimation<Color>(brandGreen),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MapInfoPill(label: 'Pendentes', value: '$pendingCount'),
              _MapInfoPill(label: 'Concluidos', value: '$doneCount'),
              _MapInfoPill(label: 'Proximo salto', value: nextJumpLabel),
            ],
          ),
          if (activeItem != null) ...[
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                SizedBox(
                  width: 170,
                  child: PrimaryButton(
                    label: currentItem != null
                        ? 'Abrir atendimento'
                        : 'Abrir proxima parada',
                    onPressed: onOpenCurrentVisit,
                  ),
                ),
                SizedBox(
                  width: 150,
                  child: SecondaryButton(
                    label: 'Centralizar mapa',
                    onPressed: onFocusCurrent,
                  ),
                ),
                SizedBox(
                  width: 130,
                  child: SecondaryButton(
                    label: 'Navegar',
                    onPressed: onOpenCurrentNavigation,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _MapInfoPill extends StatelessWidget {
  const _MapInfoPill({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFFCBD5E1),
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniActionChip extends StatelessWidget {
  const _MiniActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF8FAFC),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: brandBlue, size: 16),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  color: brandNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapStatusChip extends StatelessWidget {
  const _MapStatusChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _MapLegendCard extends StatelessWidget {
  const _MapLegendCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Legenda operacional',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: const [
              _MapLegendItem(color: Color(0xFFF59E0B), label: 'Cliente atual'),
              _MapLegendItem(color: Color(0xFF10B981), label: 'Concluido'),
              _MapLegendItem(
                color: Color(0xFF2563EB),
                label: 'Pendente com GPS',
              ),
              _MapLegendItem(
                color: Color(0xFF94A3B8),
                label: 'Sem coordenadas',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MapLegendItem extends StatelessWidget {
  const _MapLegendItem({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          height: 12,
          width: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFF475569),
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
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
    final currentVisit = await widget.repository.getVisitByRouteItem(
      widget.item.id,
    );
    final currentClient = await widget.repository.getClientSnapshot(
      widget.item.clientId,
    );
    final currentPhotos = currentVisit == null
        ? <LocalPhoto>[]
        : await widget.repository.listPhotos(currentVisit.localId);
    final currentSupplierExecutions = currentVisit == null
        ? <LocalSupplierExecution>[]
        : await widget.repository.listSupplierExecutions(currentVisit.localId);
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
  }

  Future<void> _startVisit() async {
    setState(() => busy = true);
    try {
      final created = await widget.repository.startVisit(widget.item);
      await _load();
      setState(
        () => message = legacyFlowEnabled
            ? 'Atendimento iniciado offline. Agora capture check-in, antes, depois e check-out.'
            : 'Atendimento iniciado offline. Capture check-in, passe por todos os fornecedores e finalize com o check-out.',
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

  Future<void> _openClientMap() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RouteMapPage(
          repository: widget.repository,
          promoterName: widget.promoterName,
          routeItems: [widget.item],
          onVisitChanged: ({String? nextMessage}) async {
            await _load();
          },
          initialItemId: widget.item.id,
        ),
      ),
    );
  }

  Future<void> _openClientNavigation() async {
    await openExternalNavigationForRouteItem(widget.item);
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
    final trimmedNotes = supplierNotesController.text.trim();

    if (requiresDeliveryFlow &&
        (!executionTypes.contains('supplier_before') ||
            !executionTypes.contains('supplier_after'))) {
      setState(
        () => message =
            'Conclua o fornecedor ${supplierLabel(supplier)} com foto antes e foto depois.',
      );
      return;
    }

    if (!requiresDeliveryFlow && trimmedNotes.isEmpty) {
      setState(
        () => message =
            'Quando nao houve entrega para ${supplierLabel(supplier)}, descreva o motivo nas observacoes antes de concluir.',
      );
      return;
    }

    if (requiresDeliveryFlow &&
        (productsReplenished == null || stockoutFound == null)) {
      setState(
        () => message =
            'Responda abastecimento e ruptura do fornecedor ${supplierLabel(supplier)} antes de concluir.',
      );
      return;
    }

    if (requiresDeliveryFlow && stockoutFound == true && trimmedNotes.isEmpty) {
      setState(
        () => message =
            'Quando houver ruptura no fornecedor ${supplierLabel(supplier)}, descreva o motivo nas observacoes antes de concluir.',
      );
      return;
    }

    final categories = categoriesFromSupplier(supplier);
    for (final category in categories) {
      final categoryDone = executionPhotos.any(
        (photo) => photo.categoryId == category.id,
      );
      if (!categoryDone) {
        setState(
          () => message =
              'Capture a foto da categoria ${category.displayName} antes de concluir o fornecedor ${supplierLabel(supplier)}.',
        );
        return;
      }
    }

    final activities = activitiesFromSupplier(supplier);
    for (final activity in activities) {
      final activityDone = executionPhotos.any(
        (photo) => photo.activityId == activity.id,
      );
      if (!activityDone) {
        setState(
          () => message =
              'Capture a evidencia da atividade ${activity.displayName} antes de concluir o fornecedor ${supplierLabel(supplier)}.',
        );
        return;
      }
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
          notes: trimmedNotes,
          finishedAtDevice: DateTime.now().toUtc().toIso8601String(),
          syncStatus: 'pending',
          updatedAt: DateTime.now().toUtc().toIso8601String(),
        ),
      );
      await widget.repository.addSyncLog(
        'pending',
        'Fornecedor ${supplierLabel(supplier)} concluido offline para ${widget.item.clientName}.',
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
    SupplierCategorySnapshot? category,
    SupplierActivitySnapshot? activity,
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

    final categoryPhotoCount = category == null
        ? 0
        : scopedPhotos.where((photo) => photo.categoryId == category.id).length;
    if (category != null &&
        categoryPhotoCount >= maxEvidencePhotosPerCategoryOrActivity) {
      setState(
        () => message =
            'A categoria ${category.displayName} ja atingiu o limite de $maxEvidencePhotosPerCategoryOrActivity fotos para o fornecedor ${supplierLabel(supplier!)}.',
      );
      return;
    }

    final activityPhotoCount = activity == null
        ? 0
        : scopedPhotos.where((photo) => photo.activityId == activity.id).length;
    if (activity != null &&
        activityPhotoCount >= maxEvidencePhotosPerCategoryOrActivity) {
      setState(
        () => message =
            'A atividade ${activity.displayName} ja atingiu o limite de $maxEvidencePhotosPerCategoryOrActivity fotos para o fornecedor ${supplierLabel(supplier!)}.',
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
        () => message = execution == null
            ? '${photoLabel(type)} salva localmente com data, hora e GPS quando disponivel.'
            : category != null
            ? 'Foto da categoria ${category.displayName} salva para o fornecedor ${supplierLabel(supplier!)} (${categoryPhotoCount + 1}/$maxEvidencePhotosPerCategoryOrActivity).'
            : activity != null
            ? 'Evidencia da atividade ${activity.displayName} salva para o fornecedor ${supplierLabel(supplier!)} (${activityPhotoCount + 1}/$maxEvidencePhotosPerCategoryOrActivity).'
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
      if (!mounted) return;
      Navigator.pop(context);
    } catch (error) {
      setState(() => message = normalizedError(error));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final evidenceSections = buildLocalEvidenceSections(
      photos,
      clientSuppliers,
    );

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
                VisitProgressCard(
                  hasVisitStarted: visit != null,
                  hasCheckin: hasCheckin,
                  allSuppliersCompleted: allSuppliersCompleted,
                  hasCheckout: hasCheckout,
                  visitCompleted: visit?.status == 'completed',
                  usesSupplierFlow: !legacyFlowEnabled,
                ),
                if (widget.item.hasCoordinates) ...[
                  const SizedBox(height: 14),
                  ClientLocationCard(
                    item: widget.item,
                    onOpenMap: () => unawaited(_openClientMap()),
                    onOpenNavigation: () => unawaited(_openClientNavigation()),
                  ),
                ],
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
                      title: 'Fornecedores deste cliente',
                      body:
                          'Passe pelos ${clientSuppliers.length} fornecedor(es). Se nao houve entrega, marque "Nao" e informe o motivo.',
                    ),
                    const SizedBox(height: 12),
                    ...clientSuppliers.map((supplier) {
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
                      return SupplierExecutionTile(
                        supplier: supplier,
                        status: execution?.status ?? 'pending',
                        hasBefore: executionTypes.contains('supplier_before'),
                        hasAfter: executionTypes.contains('supplier_after'),
                        deliveryReceivedAnswered:
                            execution?.deliveryReceived != null,
                        productsReplenishedAnswered:
                            execution?.productsReplenished != null,
                        stockoutFoundAnswered: execution?.stockoutFound != null,
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
                        categoryPhotoCounts: countPhotosByCategoryId(
                          photos.where(
                            (photo) =>
                                photo.supplierExecutionLocalId ==
                                activeSupplierExecution!.localId,
                          ),
                        ),
                        activityPhotoCounts: countPhotosByActivityId(
                          photos.where(
                            (photo) =>
                                photo.supplierExecutionLocalId ==
                                activeSupplierExecution!.localId,
                          ),
                        ),
                        onCaptureBefore: () => _capture(
                          'supplier_before',
                          supplier: activeSupplier!,
                        ),
                        onCaptureAfter: () => _capture(
                          'supplier_after',
                          supplier: activeSupplier!,
                        ),
                        onCaptureCategory: (category) => _capture(
                          'occurrence_extra',
                          supplier: activeSupplier!,
                          category: category,
                        ),
                        onCaptureActivity: (activity) => _capture(
                          'occurrence_extra',
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
                        title: 'Escolha um fornecedor',
                        body:
                            'Toque no fornecedor para responder a entrega, tirar as fotos e concluir o atendimento dele.',
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
                const SizedBox(height: 14),
                MessageBox(message: message),
                const SizedBox(height: 14),
                Text(
                  'Fotos salvas no aparelho',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                if (photos.isEmpty) const Text('Nenhuma foto capturada ainda.'),
                ...evidenceSections.map(
                  (section) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
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
                              Text(
                                section.title,
                                style: const TextStyle(
                                  color: brandNavy,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              if (section.subtitle?.trim().isNotEmpty ==
                                  true) ...[
                                const SizedBox(height: 4),
                                Text(
                                  section.subtitle!,
                                  style: const TextStyle(
                                    color: Color(0xFF64748B),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        ...section.photos.map(
                          (photo) => PhotoTile(
                            photo: photo,
                            suppliers: clientSuppliers,
                          ),
                        ),
                      ],
                    ),
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
                CompactSyncSummaryCard(
                  pending: summary.pending,
                  failed: summary.failed,
                  logCount: logs.length,
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
                  'Itens com erro',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                if (diagnostics.isEmpty)
                  const InfoCard(
                    title: 'Tudo certo',
                    body: 'Nao ha itens presos na fila local neste momento.',
                  )
                else
                  ...diagnostics.map((item) => DiagnosticCard(item: item)),
                const SizedBox(height: 14),
                Text(
                  'Historico de sincronizacao',
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
      'Atendimento iniciado offline para ${item.clientName}.',
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
          : categoryName != null
          ? 'Foto da categoria $categoryName salva com GPS.'
          : activityName != null
          ? 'Evidencia da atividade $activityName salva com GPS.'
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
      _assertSupplierExecutionReady(execution, executionPhotos, supplier);
    }
  }

  void _assertSupplierExecutionReady(
    LocalSupplierExecution execution,
    List<LocalPhoto> executionPhotos,
    SupplierSnapshot supplier,
  ) {
    if (execution.deliveryReceived == null) {
      throw Exception(
        'Informe se houve entrega para o fornecedor ${supplierLabel(supplier)}.',
      );
    }

    if (!supplierRequiresDeliveryFlow(execution.deliveryReceived)) {
      if ((execution.notes?.trim().isEmpty ?? true)) {
        throw Exception(
          'Informe nas observacoes o motivo da falta de entrega para ${supplierLabel(supplier)}.',
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

    if (execution.productsReplenished == null ||
        execution.stockoutFound == null) {
      throw Exception(
        'Responda abastecimento e ruptura do fornecedor ${supplierLabel(supplier)}.',
      );
    }

    if (execution.stockoutFound == true &&
        (execution.notes?.trim().isEmpty ?? true)) {
      throw Exception(
        'Descreva a ruptura em observacoes para o fornecedor ${supplierLabel(supplier)}.',
      );
    }

    final categories = categoriesFromSupplier(supplier);
    for (final category in categories) {
      final categoryDone = executionPhotos.any(
        (photo) => photo.categoryId == category.id,
      );
      if (!categoryDone) {
        throw Exception(
          'Capture a foto da categoria ${category.displayName} antes de concluir ${supplierLabel(supplier)}.',
        );
      }
    }

    final activities = activitiesFromSupplier(supplier);
    for (final activity in activities) {
      final activityDone = executionPhotos.any(
        (photo) => photo.activityId == activity.id,
      );
      if (!activityDone) {
        throw Exception(
          'Capture a evidencia da atividade ${activity.displayName} antes de concluir ${supplierLabel(supplier)}.',
        );
      }
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
      _assertSupplierExecutionReady(execution, executionPhotos, supplier);
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
    final payload = compactPayload({
      'clientGeneratedId': visit.localId,
      'routeId': visit.routeId,
      'routeItemId': visit.routeItemId,
      'clientId': visit.clientId,
      'status': visit.status,
      'startedAt': visit.startedAt,
      'finishedAt': visit.finishedAt,
      'gpsLatitude': visit.gpsLatitude,
      'gpsLongitude': visit.gpsLongitude,
      'notes': visit.notes,
    });
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
    final payload = compactPayload({
      'clientGeneratedId': execution.localId,
      'supplierId': execution.supplierId,
      'clientId': execution.clientId,
      'status': execution.status,
      'deliveryReceived': execution.deliveryReceived,
      'productsReplenished': execution.productsReplenished,
      'stockoutFound': execution.stockoutFound,
      'notes': execution.notes,
      'startedAtDevice': execution.startedAtDevice,
      'finishedAtDevice': execution.finishedAtDevice,
    });
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
      body: compactPayload({
        'type': photo.type,
        'clientGeneratedId': photo.localId,
        'capturedAt': photo.capturedAt,
        'gpsLatitude': photo.gpsLatitude,
        'gpsLongitude': photo.gpsLongitude,
        'supplierExecutionId': ?supplierExecutionId,
        'supplierId': ?supplierId,
        'categoryId': photo.categoryId,
        'categoryName': photo.categoryName,
        'activityId': photo.activityId,
        'activityName': photo.activityName,
        'contentType': 'image/jpeg',
        'base64Image': base64Encode(bytes),
      }),
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
      version: 4,
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
  final String? address;
  final String? city;
  final String? state;
  final double? latitude;
  final double? longitude;
  final Map<String, dynamic> payload;

  factory ClientSnapshot.fromJson(Map<String, dynamic> json) => ClientSnapshot(
    id: json['id'] as String,
    code: json['code']?.toString(),
    name: json['name'] as String,
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
    'name': name,
    'address': address,
    'city': city,
    'state': state,
    'latitude': latitude,
    'longitude': longitude,
    'payload_json': jsonEncode(payload),
  };
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

class SupplierCategorySnapshot {
  SupplierCategorySnapshot({
    required this.id,
    this.code,
    required this.name,
    required this.payload,
  });

  final String id;
  final String? code;
  final String name;
  final Map<String, dynamic> payload;

  String get displayName {
    if ((code?.trim().isNotEmpty ?? false)) {
      return '${code!.trim()} - ${name.trim()}';
    }
    return name.trim();
  }

  factory SupplierCategorySnapshot.fromJson(Map<String, dynamic> json) =>
      SupplierCategorySnapshot(
        id: json['id'] as String,
        code: json['code']?.toString(),
        name: ((json['name'] as String?) ?? 'Categoria').trim(),
        payload: json,
      );
}

class SupplierActivitySnapshot {
  SupplierActivitySnapshot({
    required this.id,
    this.code,
    required this.name,
    required this.payload,
  });

  final String id;
  final String? code;
  final String name;
  final Map<String, dynamic> payload;

  String get displayName {
    if ((code?.trim().isNotEmpty ?? false)) {
      return '${code!.trim()} - ${name.trim()}';
    }
    return name.trim();
  }

  factory SupplierActivitySnapshot.fromJson(Map<String, dynamic> json) =>
      SupplierActivitySnapshot(
        id: json['id'] as String,
        code: json['code']?.toString(),
        name: ((json['name'] as String?) ?? 'Atividade').trim(),
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
  final String? clientAddress;
  final double? clientLatitude;
  final double? clientLongitude;
  final String routeName;
  final String? visitStatus;

  bool get isDone =>
      status.toUpperCase() == 'COMPLETED' || visitStatus == 'completed';
  bool get hasCoordinates => clientLatitude != null && clientLongitude != null;

  factory RouteItemView.fromDb(Map<String, Object?> row) => RouteItemView(
    id: row['id'] as String,
    routeId: row['routeId'] as String,
    clientId: row['clientId'] as String,
    sequence: asInt(row['sequence']),
    status: row['status'] as String,
    clientName: row['clientName'] as String,
    clientAddress: row['clientAddress'] as String?,
    clientLatitude: asDouble(row['clientLatitude']),
    clientLongitude: asDouble(row['clientLongitude']),
    routeName: row['routeName'] as String,
    visitStatus: row['visitStatus'] as String?,
  );
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
    this.supplierName,
  });

  final String kind;
  final String status;
  final int attempts;
  final String? lastError;
  final String? clientName;
  final String? photoType;
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

Map<String, dynamic> compactPayload(Map<String, dynamic> input) {
  final output = <String, dynamic>{};
  input.forEach((key, value) {
    if (value == null) {
      return;
    }

    if (value is String && value.trim().isEmpty) {
      return;
    }

    output[key] = value;
  });
  return output;
}

Map<String, int> countPhotosByCategoryId(Iterable<LocalPhoto> photos) {
  final counts = <String, int>{};
  for (final photo in photos) {
    final categoryId = photo.categoryId?.trim();
    if (categoryId == null || categoryId.isEmpty) {
      continue;
    }
    counts[categoryId] = (counts[categoryId] ?? 0) + 1;
  }
  return counts;
}

Map<String, int> countPhotosByActivityId(Iterable<LocalPhoto> photos) {
  final counts = <String, int>{};
  for (final photo in photos) {
    final activityId = photo.activityId?.trim();
    if (activityId == null || activityId.isEmpty) {
      continue;
    }
    counts[activityId] = (counts[activityId] ?? 0) + 1;
  }
  return counts;
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

List<SupplierCategorySnapshot> categoriesFromSupplier(
  SupplierSnapshot supplier,
) {
  final raw = supplier.payload['categories'];
  if (raw is! List) {
    return const <SupplierCategorySnapshot>[];
  }

  return raw
      .whereType<Map>()
      .map(
        (item) => SupplierCategorySnapshot.fromJson(
          item.map((key, value) => MapEntry(key.toString(), value)),
        ),
      )
      .toList();
}

List<SupplierActivitySnapshot> activitiesFromSupplier(
  SupplierSnapshot supplier,
) {
  final raw = supplier.payload['activities'];
  if (raw is! List) {
    return const <SupplierActivitySnapshot>[];
  }

  return raw
      .whereType<Map>()
      .map(
        (item) => SupplierActivitySnapshot.fromJson(
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

bool supplierRequiresDeliveryFlow(bool? deliveryReceived) =>
    deliveryReceived != false;

List<String> optionalTextLine(String? value) =>
    value == null ? const <String>[] : <String>[value];

Future<void> openExternalNavigationForRouteItem(RouteItemView item) async {
  if (!item.hasCoordinates) {
    return;
  }

  final latitude = item.clientLatitude!;
  final longitude = item.clientLongitude!;
  final encodedLabel = Uri.encodeComponent(item.clientName);
  final googleUri = Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=$latitude,$longitude',
  );
  final geoUri = Uri.parse(
    'geo:$latitude,$longitude?q=$latitude,$longitude($encodedLabel)',
  );

  if (await canLaunchUrl(googleUri)) {
    await launchUrl(googleUri, mode: LaunchMode.externalApplication);
    return;
  }

  if (await canLaunchUrl(geoUri)) {
    await launchUrl(geoUri, mode: LaunchMode.externalApplication);
  }
}

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
    return Scaffold(body: SafeArea(child: child));
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
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: const BoxDecoration(color: brandNavy),
      child: Row(
        children: [
          if (showBack)
            FilledButton.tonalIcon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Voltar'),
            )
          else
            Image.asset('assets/promotorpro-icon.png', width: 42, height: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFFD6E2FF),
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (onLogout != null)
            IconButton(
              onPressed: onLogout,
              icon: const Icon(Icons.logout, color: Colors.white),
            ),
        ],
      ),
    );
  }
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key, required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Image.asset('assets/promotorpro-icon.png', width: 78, height: 78),
        const SizedBox(height: 16),
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
          style: Theme.of(context).textTheme.displaySmall?.copyWith(
            fontWeight: FontWeight.w900,
            color: brandNavy,
          ),
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
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 22,
            backgroundColor: brandNavy,
            child: Icon(Icons.person, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  promoterName,
                  style: const TextStyle(
                    color: brandNavy,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  promoterEmail,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  versionLabel,
                  style: const TextStyle(
                    color: brandBlue,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
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

class CompactHomeStatusCard extends StatelessWidget {
  const CompactHomeStatusCard({
    super.key,
    required this.totalClients,
    required this.pendingClients,
    required this.completedClients,
    required this.pendingSync,
    required this.failedSync,
  });

  final int totalClients;
  final int pendingClients;
  final int completedClients;
  final int pendingSync;
  final int failedSync;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Resumo rapido',
            style: TextStyle(
              color: brandNavy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _CountStatusChip(label: 'Clientes', value: '$totalClients'),
              _CountStatusChip(label: 'Pendentes', value: '$pendingClients'),
              _CountStatusChip(label: 'Atendidos', value: '$completedClients'),
              _CountStatusChip(label: 'Sync pendente', value: '$pendingSync'),
              if (failedSync > 0)
                _CountStatusChip(
                  label: 'Falhas',
                  value: '$failedSync',
                  danger: true,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class CompactSyncSummaryCard extends StatelessWidget {
  const CompactSyncSummaryCard({
    super.key,
    required this.pending,
    required this.failed,
    required this.logCount,
  });

  final int pending;
  final int failed;
  final int logCount;

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
          const Text(
            'Fila de sincronizacao',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: brandNavy,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _CountStatusChip(label: 'Pendentes', value: '$pending'),
              _CountStatusChip(
                label: 'Falhas',
                value: '$failed',
                danger: failed > 0,
              ),
              _CountStatusChip(label: 'Historico', value: '$logCount'),
            ],
          ),
        ],
      ),
    );
  }
}

class _CountStatusChip extends StatelessWidget {
  const _CountStatusChip({
    required this.label,
    required this.value,
    this.danger = false,
  });

  final String label;
  final String value;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: danger ? const Color(0xFFFEF2F2) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: danger ? const Color(0xFFFECACA) : line,
        ),
      ),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(
            color: brandNavy,
            fontWeight: FontWeight.w700,
          ),
          children: [
            TextSpan(text: '$label: '),
            TextSpan(
              text: value,
              style: TextStyle(
                color: danger ? const Color(0xFFB91C1C) : brandBlue,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
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
    return GridView.count(
      crossAxisCount: MediaQuery.of(context).size.width > 650 ? 4 : 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.45,
      children: cards.map((card) => MetricCard(data: card)).toList(),
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

class VisitProgressCard extends StatelessWidget {
  const VisitProgressCard({
    super.key,
    required this.hasVisitStarted,
    required this.hasCheckin,
    required this.allSuppliersCompleted,
    required this.hasCheckout,
    required this.visitCompleted,
    required this.usesSupplierFlow,
  });

  final bool hasVisitStarted;
  final bool hasCheckin;
  final bool allSuppliersCompleted;
  final bool hasCheckout;
  final bool visitCompleted;
  final bool usesSupplierFlow;

  @override
  Widget build(BuildContext context) {
    final steps = <_VisitStepData>[
      _VisitStepData(label: 'Iniciar', done: hasVisitStarted),
      _VisitStepData(label: 'Check-in', done: hasCheckin),
      if (usesSupplierFlow)
        _VisitStepData(label: 'Fornecedores', done: allSuppliersCompleted),
      _VisitStepData(label: 'Check-out', done: hasCheckout),
      _VisitStepData(label: 'Encerrar', done: visitCompleted),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Passos do atendimento',
            style: TextStyle(
              color: brandNavy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: steps
                .map(
                  (step) => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: step.done
                          ? const Color(0xFFECFDF5)
                          : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: step.done
                            ? const Color(0xFFA7F3D0)
                            : line,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          step.done
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          size: 18,
                          color: step.done
                              ? brandGreen
                              : const Color(0xFF94A3B8),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          step.label,
                          style: const TextStyle(
                            color: brandNavy,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _VisitStepData {
  const _VisitStepData({required this.label, required this.done});

  final String label;
  final bool done;
}

class RouteItemCard extends StatelessWidget {
  const RouteItemCard({
    super.key,
    required this.item,
    required this.onTap,
    required this.onOpenVisit,
    this.onOpenMap,
  });

  final RouteItemView item;
  final VoidCallback onTap;
  final VoidCallback onOpenVisit;
  final VoidCallback? onOpenMap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
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
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.clientName,
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            color: brandNavy,
                            fontSize: 18,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          item.clientAddress ?? 'Endereco nao informado',
                          style: const TextStyle(
                            color: Color(0xFF475569),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.routeName,
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (item.hasCoordinates)
                          const Padding(
                            padding: EdgeInsets.only(top: 4),
                            child: Text(
                              'GPS do cliente disponivel',
                              style: TextStyle(
                                color: brandBlue,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  SizedBox(
                    width: 180,
                    child: PrimaryButton(
                      label: 'Abrir atendimento',
                      onPressed: onOpenVisit,
                    ),
                  ),
                  SizedBox(
                    width: 160,
                    child: SecondaryButton(
                      label: 'Ver no mapa',
                      onPressed: onOpenMap,
                    ),
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
          Text(
            item.clientName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.clientAddress ?? 'Endereco nao informado',
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

class ClientLocationCard extends StatelessWidget {
  const ClientLocationCard({
    super.key,
    required this.item,
    required this.onOpenMap,
    required this.onOpenNavigation,
  });

  final RouteItemView item;
  final VoidCallback onOpenMap;
  final VoidCallback onOpenNavigation;

  @override
  Widget build(BuildContext context) {
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
          const Text(
            'Mapa do cliente',
            style: TextStyle(
              color: brandNavy,
              fontWeight: FontWeight.w900,
              fontSize: 20,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Veja o ponto do cliente no mapa antes de iniciar ou continuar o atendimento.',
            style: TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            height: 220,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: line),
            ),
            clipBehavior: Clip.antiAlias,
            child: IgnorePointer(
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: LatLng(
                    item.clientLatitude!,
                    item.clientLongitude!,
                  ),
                  initialZoom: 15,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'promotorpro_mobile',
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: LatLng(
                          item.clientLatitude!,
                          item.clientLongitude!,
                        ),
                        width: 62,
                        height: 62,
                        child: Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFFF59E0B),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 4),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x33172233),
                                blurRadius: 12,
                                offset: Offset(0, 6),
                              ),
                            ],
                          ),
                          child: Center(
                            child: Text(
                              '${item.sequence}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'GPS do cliente: ${item.clientLatitude!.toStringAsFixed(6)}, ${item.clientLongitude!.toStringAsFixed(6)}',
            style: const TextStyle(
              color: brandBlue,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              SizedBox(
                width: 180,
                child: PrimaryButton(
                  label: 'Abrir mapa completo',
                  onPressed: onOpenMap,
                ),
              ),
              SizedBox(
                width: 180,
                child: SecondaryButton(
                  label: 'Abrir no GPS',
                  onPressed: onOpenNavigation,
                ),
              ),
            ],
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
    this.counter,
  });

  final String label;
  final bool ok;
  final VoidCallback? onPressed;
  final String? counter;

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
          child: Row(
            children: [
              Expanded(
                child: Text(
                  ok ? '$label capturada' : label,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              if (counter != null)
                Text(
                  counter!,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF64748B),
                  ),
                ),
            ],
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
    final categories = categoriesFromSupplier(supplier);
    final activities = activitiesFromSupplier(supplier);
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
                children: [
                  Expanded(
                    child: Text(
                      supplierLabel(supplier),
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        color: brandNavy,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  Chip(
                    label: Text(
                      statusLabel,
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
                ],
              ),
              if (categories.isNotEmpty || activities.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (categories.isNotEmpty)
                      _MapStatusChip(
                        label: '${categories.length} categoria(s)',
                        color: brandBlue,
                      ),
                    if (activities.isNotEmpty)
                      _MapStatusChip(
                        label: '${activities.length} atividade(s)',
                        color: brandGreen,
                      ),
                  ],
                ),
              ],
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
    required this.hasBefore,
    required this.hasAfter,
    required this.deliveryReceived,
    required this.productsReplenished,
    required this.stockoutFound,
    required this.notesController,
    required this.busy,
    required this.categoryPhotoCounts,
    required this.activityPhotoCounts,
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
  final bool hasBefore;
  final bool hasAfter;
  final bool? deliveryReceived;
  final bool? productsReplenished;
  final bool? stockoutFound;
  final TextEditingController notesController;
  final bool busy;
  final Map<String, int> categoryPhotoCounts;
  final Map<String, int> activityPhotoCounts;
  final VoidCallback onCaptureBefore;
  final VoidCallback onCaptureAfter;
  final FutureOr<void> Function(SupplierCategorySnapshot category)
  onCaptureCategory;
  final FutureOr<void> Function(SupplierActivitySnapshot activity)
  onCaptureActivity;
  final FutureOr<void> Function(bool? value) onDeliveryChanged;
  final FutureOr<void> Function(bool? value) onProductsChanged;
  final FutureOr<void> Function(bool? value) onStockoutChanged;
  final FutureOr<void> Function(String value) onNotesChanged;
  final FutureOr<void> Function() onComplete;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final categories = categoriesFromSupplier(supplier);
    final activities = activitiesFromSupplier(supplier);
    final requiresDeliveryFlow = supplierRequiresDeliveryFlow(deliveryReceived);

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
                      'Fornecedor aberto',
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
          const SizedBox(height: 14),
          if (categories.isNotEmpty || activities.isNotEmpty) ...[
            SupplierGuidanceCard(
              categories: categories,
              activities: activities,
              categoryPhotoCounts: categoryPhotoCounts,
              activityPhotoCounts: activityPhotoCounts,
              busy: busy,
              onCaptureCategory: onCaptureCategory,
              onCaptureActivity: onCaptureActivity,
            ),
            const SizedBox(height: 14),
          ],
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
              title: 'Sem entrega',
              body:
                  'Se nao houve mercadoria, informe o motivo nas observacoes e conclua o fornecedor.',
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
            decoration: const InputDecoration(
              labelText: 'Observacoes do fornecedor',
              border: OutlineInputBorder(),
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

class SupplierGuidanceCard extends StatelessWidget {
  const SupplierGuidanceCard({
    super.key,
    required this.categories,
    required this.activities,
    required this.categoryPhotoCounts,
    required this.activityPhotoCounts,
    required this.busy,
    required this.onCaptureCategory,
    required this.onCaptureActivity,
  });

  final List<SupplierCategorySnapshot> categories;
  final List<SupplierActivitySnapshot> activities;
  final Map<String, int> categoryPhotoCounts;
  final Map<String, int> activityPhotoCounts;
  final bool busy;
  final FutureOr<void> Function(SupplierCategorySnapshot category)
  onCaptureCategory;
  final FutureOr<void> Function(SupplierActivitySnapshot activity)
  onCaptureActivity;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'O que fazer neste fornecedor',
            style: TextStyle(
              color: brandNavy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Tire as fotos das categorias e das atividades antes de concluir.',
            style: TextStyle(
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w700,
              height: 1.4,
            ),
          ),
          if (categories.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text(
              'Categorias vinculadas',
              style: TextStyle(color: brandNavy, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            ...categories.map(
              (category) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: const Color(0xFFDBEAFE),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.photo_camera_outlined,
                            color: brandBlue,
                          ),
                        ),
                        const SizedBox(width: 12),
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
                              const SizedBox(height: 4),
                              Text(
                                (categoryPhotoCounts[category.id] ?? 0) > 0
                                    ? 'Fotos registradas: ${categoryPhotoCounts[category.id] ?? 0}/$maxEvidencePhotosPerCategoryOrActivity.'
                                    : 'Capture a foto desta categoria para comprovar a execucao.',
                                style: const TextStyle(
                                  color: Color(0xFF64748B),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    EvidenceButton(
                      label: 'Foto da categoria',
                      ok: (categoryPhotoCounts[category.id] ?? 0) > 0,
                      counter:
                          '${categoryPhotoCounts[category.id] ?? 0}/$maxEvidencePhotosPerCategoryOrActivity',
                      onPressed: busy
                          || (categoryPhotoCounts[category.id] ?? 0) >=
                              maxEvidencePhotosPerCategoryOrActivity
                          ? null
                          : () {
                              final result = onCaptureCategory(category);
                              if (result is Future<void>) {
                                unawaited(result);
                              }
                            },
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (activities.isNotEmpty) ...[
            const SizedBox(height: 6),
            const Text(
              'Atividades para executar',
              style: TextStyle(color: brandNavy, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            ...activities.map(
              (activity) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 3),
                          child: Icon(
                            Icons.task_alt,
                            size: 18,
                            color: brandGreen,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            activity.displayName,
                            style: const TextStyle(
                              color: brandNavy,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    EvidenceButton(
                      label: 'Evidencia da atividade',
                      ok: (activityPhotoCounts[activity.id] ?? 0) > 0,
                      counter:
                          '${activityPhotoCounts[activity.id] ?? 0}/$maxEvidencePhotosPerCategoryOrActivity',
                      onPressed: busy
                          || (activityPhotoCounts[activity.id] ?? 0) >=
                              maxEvidencePhotosPerCategoryOrActivity
                          ? null
                          : () {
                              final result = onCaptureActivity(activity);
                              if (result is Future<void>) {
                                unawaited(result);
                              }
                            },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
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

class LocalEvidenceSection {
  const LocalEvidenceSection({
    required this.title,
    required this.photos,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final List<LocalPhoto> photos;
}

int _localEvidenceTimestamp(LocalPhoto photo) {
  final parsed = DateTime.tryParse(photo.capturedAt);
  return parsed?.millisecondsSinceEpoch ?? 0;
}

String _localEvidenceSupplierLabel(
  LocalPhoto photo,
  List<SupplierSnapshot> suppliers,
) {
  final supplier = supplierById(suppliers, photo.supplierId);
  return supplier == null ? '' : supplierLabel(supplier).trim();
}

int _localEvidenceVisitGroupOrder(LocalPhoto photo) {
  final hasSupplier =
      (photo.supplierExecutionLocalId?.trim().isNotEmpty ?? false) ||
      (photo.supplierId?.trim().isNotEmpty ?? false);

  if (!hasSupplier && photo.type == 'checkin') {
    return 0;
  }

  if (!hasSupplier && (photo.type == 'before' || photo.type == 'after')) {
    return 1;
  }

  if (hasSupplier) {
    return 2;
  }

  if (!hasSupplier && photo.type == 'checkout') {
    return 3;
  }

  return 4;
}

int _localEvidenceBucketOrder(LocalPhoto photo) {
  const visitLevelOrder = <String, int>{
    'checkin': 0,
    'before': 1,
    'after': 2,
    'checkout': 98,
  };
  const supplierLevelOrder = <String, int>{
    'supplier_before': 10,
    'category': 20,
    'activity': 30,
    'supplier_after': 40,
  };

  final hasSupplier =
      (photo.supplierExecutionLocalId?.trim().isNotEmpty ?? false) ||
      (photo.supplierId?.trim().isNotEmpty ?? false);

  if (hasSupplier) {
    if ((photo.categoryId?.trim().isNotEmpty ?? false) ||
        (photo.categoryName?.trim().isNotEmpty ?? false)) {
      return supplierLevelOrder['category'] ?? 20;
    }
    if ((photo.activityId?.trim().isNotEmpty ?? false) ||
        (photo.activityName?.trim().isNotEmpty ?? false)) {
      return supplierLevelOrder['activity'] ?? 30;
    }
    return supplierLevelOrder[photo.type] ?? 90;
  }

  return visitLevelOrder[photo.type] ?? 80;
}

List<LocalPhoto> sortLocalVisitEvidence(
  List<LocalPhoto> photos,
  List<SupplierSnapshot> suppliers,
) {
  final ordered = [...photos];
  ordered.sort((left, right) {
    final groupDiff =
        _localEvidenceVisitGroupOrder(left) -
        _localEvidenceVisitGroupOrder(right);
    if (groupDiff != 0) {
      return groupDiff;
    }

    final supplierDiff = _localEvidenceSupplierLabel(
      left,
      suppliers,
    ).compareTo(_localEvidenceSupplierLabel(right, suppliers));
    if (supplierDiff != 0) {
      return supplierDiff;
    }

    final bucketDiff =
        _localEvidenceBucketOrder(left) - _localEvidenceBucketOrder(right);
    if (bucketDiff != 0) {
      return bucketDiff;
    }

    return _localEvidenceTimestamp(left) - _localEvidenceTimestamp(right);
  });
  return ordered;
}

List<LocalEvidenceSection> buildLocalEvidenceSections(
  List<LocalPhoto> photos,
  List<SupplierSnapshot> suppliers,
) {
  final ordered = sortLocalVisitEvidence(photos, suppliers);
  final general = <LocalPhoto>[];
  final supplierBuckets = <String, List<LocalPhoto>>{};
  final supplierNames = <String, String>{};

  for (final photo in ordered) {
    final supplierLabelValue = _localEvidenceSupplierLabel(photo, suppliers);
    if (supplierLabelValue.isEmpty) {
      general.add(photo);
      continue;
    }

    final supplierKey =
        photo.supplierExecutionLocalId?.trim().isNotEmpty == true
        ? photo.supplierExecutionLocalId!.trim()
        : supplierLabelValue;
    supplierNames[supplierKey] = supplierLabelValue;
    supplierBuckets.putIfAbsent(supplierKey, () => <LocalPhoto>[]).add(photo);
  }

  final sections = <LocalEvidenceSection>[];

  if (general.isNotEmpty) {
    sections.add(
      LocalEvidenceSection(
        title: 'Etapas gerais da visita',
        subtitle: 'Check-in, evidencias gerais e check-out do atendimento.',
        photos: general,
      ),
    );
  }

  for (final entry in supplierBuckets.entries) {
    sections.add(
      LocalEvidenceSection(
        title: 'Fornecedor: ${supplierNames[entry.key] ?? entry.key}',
        subtitle: 'Fotos organizadas na ordem operacional deste fornecedor.',
        photos: entry.value,
      ),
    );
  }

  return sections;
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
    final categoryText = photo.categoryName?.trim().isNotEmpty == true
        ? 'Categoria: ${photo.categoryName!.trim()}'
        : null;
    final activityText = photo.activityName?.trim().isNotEmpty == true
        ? 'Atividade: ${photo.activityName!.trim()}'
        : null;
    final title = categoryText != null
        ? 'Foto da categoria'
        : activityText != null
        ? 'Evidencia da atividade'
        : supplier == null
        ? photoLabel(photo.type)
        : '${photoLabel(photo.type)} - ${supplierLabel(supplier)}';
    final detailLines = <String>[
      ...optionalTextLine(supplierText),
      ...optionalTextLine(categoryText),
      ...optionalTextLine(activityText),
      'Capturada: ${formatDate(photo.capturedAt)}',
      'GPS: ${photo.gpsLatitude?.toStringAsFixed(6) ?? 'sem gps'}, ${photo.gpsLongitude?.toStringAsFixed(6) ?? 'sem gps'}',
    ];
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: line),
      ),
      child: ListTile(
        leading: const Icon(Icons.photo_camera, color: brandBlue),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(detailLines.join('\n')),
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
        item.supplierName == null
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
