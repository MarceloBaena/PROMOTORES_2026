import 'package:flutter_test/flutter_test.dart';
import 'package:promotorpro_mobile/main.dart';

void main() {
  test('traduz tipos de foto e status de sync', () {
    expect(photoLabel('checkin'), 'Check-in');
    expect(photoLabel('before'), 'Foto antes');
    expect(photoLabel('after'), 'Foto depois');
    expect(syncLabel('failed'), 'Falha');
  });
}
