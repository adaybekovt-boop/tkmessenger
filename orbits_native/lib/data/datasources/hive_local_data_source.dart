import '../../../domain/entities/message.dart';

abstract class HiveLocalDataSource {
  /// Инициализация шифрованного бокса (алгоритм AES)
  Future<void> openEncryptedBox(String masterKey);

  /// Асинхронное чтение без блокировки UI-потока (Isolates в будущем)
  Future<List<Message>> getChatHistory(String chatId);

  /// Сохранение сообщения (работает в 10 раз быстрее IndexedDB)
  Future<void> saveMessage(Message message);
  
  /// Полная очистка ("Кнопка Паника" из ТЗ №9)
  Future<void> wipeAllData();
}
