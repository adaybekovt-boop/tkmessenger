import 'dart:io';
import 'package:flutter_windowmanager/flutter_windowmanager.dart';

class ScreenPrivacyService {
  /// Блокировка скриншотов (ТЗ №9: Экранный Приват - Android / iOS)
  /// Активирует FLAG_SECURE, чтобы предотвратить создание скриншота или запись экрана.
  Future<void> enableScreenPrivacy() async {
    if (Platform.isAndroid) {
      await FlutterWindowManager.addFlags(FlutterWindowManager.FLAG_SECURE);
    } else if (Platform.isIOS) {
      // Для iOS на Flutter потребуется отдельный слушатель userDidTakeScreenshotNotification,
      // в рамках Dart-кода это нужно вызывать через MethodChannel (здесь зарезервировано).
      // TODO: Вызов MethodChannel('isCaptured').
    }
  }

  /// Снятие блокировки (если пользователь в настройках выберет "Разрешить скриншоты",
  /// т.к. "Конфликт с ОС: флаг FLAG_SECURE на Android иногда мешает работе кастомных прошивок")
  Future<void> disableScreenPrivacy() async {
    if (Platform.isAndroid) {
      await FlutterWindowManager.clearFlags(FlutterWindowManager.FLAG_SECURE);
    }
  }
}
