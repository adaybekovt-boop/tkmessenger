import 'dart:io';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../../../domain/entities/message.dart';

abstract class WebRTCRemoteDataSource {
  /// Инициализация PeerConnection (нативные C++ биндинги flutter_webrtc)
  Future<void> initializeEngine(String nickname, String masterKey);

  /// Соединение по ICE (Host/Srflx/Relay)
  Future<void> connect(String targetPeerId, {List<Map<String, dynamic>> iceServers = const []});

  /// Отправка пакета через RTCDataChannel
  Future<void> sendDataPacket(Message message);

  /// Чтение 10ГБ файлов через стрим (1MB chunks)
  Future<void> streamLargeFile(String targetPeerId, File file);

  Stream<Message> get incomingStream;
}
