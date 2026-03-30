import 'dart:io';
import 'package:dartz/dartz.dart';
import '../../core/error/failures.dart';
import '../entities/peer.dart';
import '../entities/message.dart';

// Этот интерфейс определяет ЧТО приложение может делать по P2P, но не скрывает КАК именно (WebRTC/Sockets)
abstract class P2PRepository {
  /// Инициализация узла со своим позывным и генерация энтропийного ключа
  Future<Either<Failure, void>> initializeNode(String nickname, String masterKey);

  /// Установить соединение (прямое или через TURN)
  Future<Either<Failure, void>> connectToPeer(String targetPeerId);

  /// Отправить текстовое сообщение или пинг
  Future<Either<Failure, void>> sendMessage(Message message);

  /// Стриминг файла большого объема (до 10ГБ) по нативным чанкам в 1МБ
  Future<Either<Failure, void>> sendLargeFileStreaming(String targetPeerId, File file);

  /// Подписка на входящие события (сообщения, статусы typing)
  Stream<Message> get incomingMessagesStream;
  
  /// Подписка на изменение сети пиров
  Stream<List<Peer>> get connectedPeersStream;
}
