import 'package:flutter_test/flutter_test.dart';
import 'package:promotorpro_mobile/main.dart';

void main() {
  test('traduz tipos de foto e status de sync', () {
    expect(photoLabel('checkin'), 'Check-in');
    expect(photoLabel('before'), 'Foto antes');
    expect(photoLabel('after'), 'Foto depois');
    expect(syncLabel('failed'), 'Falha');
  });

  test('monta categorias e atividades a partir do payload do fornecedor', () {
    final supplier = SupplierSnapshot.fromJson({
      'id': 'sup-1',
      'code': 'FOR-001',
      'name': 'Fornecedor Demo',
      'categories': [
        {'id': 'cat-1', 'code': 'CAT-01', 'name': 'Gondola normal'},
      ],
      'activities': [
        {'id': 'act-1', 'code': 'ATV-01', 'name': 'Verificar validade'},
      ],
    });

    final categories = categoriesFromSupplier(supplier);
    final activities = activitiesFromSupplier(supplier);

    expect(categories, hasLength(1));
    expect(categories.first.displayName, 'CAT-01 - Gondola normal');
    expect(activities, hasLength(1));
    expect(activities.first.displayName, 'ATV-01 - Verificar validade');
  });
}
