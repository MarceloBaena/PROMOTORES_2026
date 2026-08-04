import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

class CameraCaptureException implements Exception {
  CameraCaptureException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CameraCaptureService {
  static Future<File?> capture(
    BuildContext context, {
    required String debugLabel,
  }) async {
    debugPrint('[CAMERA] Botao pressionado para $debugLabel');
    debugPrint('[CAMERA] Verificando permissao');

    final permissionReady = await _ensureCameraPermission(context);
    if (!permissionReady) {
      throw CameraCaptureException(
        'Permissao da camera nao concedida. Libere o acesso para registrar as evidencias da visita.',
      );
    }

    debugPrint('[CAMERA] Permissao concedida');
    debugPrint('[CAMERA] Buscando cameras disponiveis');

    List<CameraDescription> cameras;
    try {
      cameras = await availableCameras();
    } on CameraException catch (error) {
      debugPrint('[CAMERA] Falha ao listar cameras: ${error.code} ${error.description}');
      throw CameraCaptureException(
        'A camera do aparelho esta indisponivel no momento. Verifique as politicas do MDM e tente novamente.',
      );
    } catch (error) {
      debugPrint('[CAMERA] Erro inesperado ao listar cameras: $error');
      throw CameraCaptureException(
        'Nao foi possivel acessar a camera do aparelho.',
      );
    }

    if (cameras.isEmpty) {
      debugPrint('[CAMERA] Nenhuma camera retornada pelo Android');
      throw CameraCaptureException(
        'Nenhuma camera foi encontrada neste aparelho.',
      );
    }

    final selectedCamera = cameras.firstWhere(
      (camera) => camera.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );

    debugPrint(
      '[CAMERA] Abrindo camera interna: ${selectedCamera.name} (${selectedCamera.lensDirection.name})',
    );

    if (!context.mounted) {
      throw CameraCaptureException('Tela da camera foi fechada antes da captura.');
    }

    final result = await Navigator.of(context).push<File?>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _CameraCapturePage(
          camera: selectedCamera,
          debugLabel: debugLabel,
        ),
      ),
    );

    if (result == null) {
      debugPrint('[CAMERA] Captura cancelada pelo usuario');
      return null;
    }

    debugPrint('[CAMERA] Foto capturada em ${result.path}');
    return result;
  }

  static Future<bool> _ensureCameraPermission(BuildContext context) async {
    var permission = await Permission.camera.status;

    if (permission.isGranted) {
      return true;
    }

    if (permission.isPermanentlyDenied || permission.isRestricted) {
      if (!context.mounted) {
        return false;
      }
      await _showBlockedDialog(context);
      return false;
    }

    permission = await Permission.camera.request();

    if (permission.isGranted) {
      return true;
    }

    if (permission.isPermanentlyDenied || permission.isRestricted) {
      if (!context.mounted) {
        return false;
      }
      await _showBlockedDialog(context);
      return false;
    }

    if (!context.mounted) {
      return false;
    }
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permissao necessaria'),
        content: const Text(
          'O PromotorPro precisa acessar a camera para registrar check-in, fotos do fornecedor, categorias, atividades e check-out.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Fechar'),
          ),
        ],
      ),
    );
    return false;
  }

  static Future<void> _showBlockedDialog(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permissao bloqueada'),
        content: const Text(
          'A camera foi bloqueada para o PromotorPro. Abra as configuracoes do Android e libere o acesso para continuar.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await openAppSettings();
            },
            child: const Text('Abrir configuracoes'),
          ),
        ],
      ),
    );
  }
}

class _CameraCapturePage extends StatefulWidget {
  const _CameraCapturePage({
    required this.camera,
    required this.debugLabel,
  });

  final CameraDescription camera;
  final String debugLabel;

  @override
  State<_CameraCapturePage> createState() => _CameraCapturePageState();
}

class _CameraCapturePageState extends State<_CameraCapturePage> {
  CameraController? _controller;
  Future<void>? _initialization;
  bool _capturing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    final controller = CameraController(
      widget.camera,
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );

    _controller = controller;
    _initialization = controller.initialize();

    try {
      await _initialization;
      if (!mounted) return;
      debugPrint('[CAMERA] Camera interna inicializada com sucesso');
      setState(() {});
    } on CameraException catch (error) {
      debugPrint('[CAMERA] Erro ao inicializar camera: ${error.code} ${error.description}');
      if (!mounted) return;
      setState(() {
        _error = switch (error.code) {
          'CameraAccessDenied' =>
            'Acesso a camera negado pelo Android ou pela politica do aparelho.',
          'CameraAccessRestricted' =>
            'A camera foi restringida pela politica do aparelho.',
          'CameraAccessDeniedWithoutPrompt' =>
            'A camera foi bloqueada permanentemente para este aplicativo.',
          _ =>
            'Nao foi possivel inicializar a camera interna do PromotorPro.',
        };
      });
    } catch (error) {
      debugPrint('[CAMERA] Erro inesperado ao inicializar camera: $error');
      if (!mounted) return;
      setState(() {
        _error = 'Erro inesperado ao abrir a camera interna.';
      });
    }
  }

  @override
  void dispose() {
    unawaited(_controller?.dispose());
    super.dispose();
  }

  Future<void> _takePhoto() async {
    final controller = _controller;
    if (controller == null || _capturing) {
      return;
    }

    try {
      setState(() => _capturing = true);
      debugPrint('[CAMERA] Iniciando captura para ${widget.debugLabel}');
      await _initialization;
      final picture = await controller.takePicture();
      debugPrint('[CAMERA] Resultado recebido: ${picture.path}');
      if (!mounted) return;
      Navigator.of(context).pop(File(picture.path));
    } on CameraException catch (error) {
      debugPrint('[CAMERA] Falha ao capturar foto: ${error.code} ${error.description}');
      if (!mounted) return;
      setState(() {
        _error =
            'Nao foi possivel capturar a foto. Verifique a camera do aparelho e tente novamente.';
      });
    } catch (error) {
      debugPrint('[CAMERA] Erro inesperado na captura: $error');
      if (!mounted) return;
      setState(() {
        _error = 'Erro inesperado ao registrar a foto.';
      });
    } finally {
      if (mounted) {
        setState(() => _capturing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: _capturing ? null : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back),
                    label: const Text('Voltar'),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      widget.debugLabel,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: _error != null
                    ? Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.photo_camera_back_outlined,
                              color: Colors.white70,
                              size: 48,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      )
                    : _controller != null
                        ? FutureBuilder<void>(
                            future: _initialization,
                            builder: (context, snapshot) {
                              if (snapshot.connectionState !=
                                  ConnectionState.done) {
                                return const CircularProgressIndicator(
                                  color: Colors.white,
                                );
                              }
                              return CameraPreview(_controller!);
                            },
                          )
                        : const CircularProgressIndicator(color: Colors.white),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FilledButton.icon(
                    onPressed:
                        (_error != null || _capturing) ? null : _takePhoto,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 16,
                      ),
                    ),
                    icon: _capturing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.camera_alt),
                    label: Text(_capturing ? 'Capturando...' : 'Tirar foto'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
