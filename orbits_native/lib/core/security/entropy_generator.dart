import 'dart:convert';
import 'package:crypto/crypto.dart';

class EntropyGenerator {
  final List<String> _recordedCoordinates = [];
  
  /// Добавление координаты для энтропии. 
  /// Вызывается при GestureDetector(onPanUpdate: ...)
  void pushEntropyMove(double dx, double dy, int msTimestamp) {
    _recordedCoordinates.add('$dx:$dy:$msTimestamp');
  }

  /// Генерация массива из 12 слов (Seed phrase) на основе хешированных координат.
  /// (Упрощенная реализация - ТЗ №10: Identity Recovery)
  List<String> generateSeedPhrase() {
    if (_recordedCoordinates.length < 50) {
      throw Exception('Недостаточно хаотичных движений (Нужно больше энтропии)');
    }

    final rawString = _recordedCoordinates.join('|');
    final bytes = utf8.encode(rawString);
    final digest = sha256.convert(bytes);
    
    // Имитация создания 12 слов (В реальном проекте используется BIP39)
    final hexDigest = digest.toString();
    
    // Разбиваем на 12 "кусков" для подстановки из словаря
    final list = <String>[];
    for(int i = 0; i < 12; i++) {
        // Условно берем куски HEX и сопоставляем (mock)
        int slice = int.parse(hexDigest.substring(i*2, i*2+2), radix: 16);
        list.add(_mockDictionaryBIP39[slice % _mockDictionaryBIP39.length]);
    }
    
    return list;
  }

  void clearCache() {
    _recordedCoordinates.clear();
  }

  // Заглушка минимального набора слов для примера
  static const List<String> _mockDictionaryBIP39 = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 
    'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
    'orbit', 'trust', 'secure', 'cipher', 'zero', 'peer', 'mesh', 'network', 'node', 'relay'
  ];
}
