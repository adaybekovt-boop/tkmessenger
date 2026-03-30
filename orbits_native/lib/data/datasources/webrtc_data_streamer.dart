import 'dart:io';
import 'dart:typed_data';
import 'dart:async';
import 'package:crypto/crypto.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

class WebRtcDataStreamer {
  // Строго по ТЗ: фрагменты по 1 МБ (1024 * 1024 байт)
  static const int _chunkSize = 1024 * 1024; 
  
  final Map<String, StreamController<double>> _progressControllers = {};

  /// Zero-RAM Spikes передача. 
  /// Файл читается кусками напрямую с диска и сливается в `RTCDataChannel`.
  Future<void> streamFile(
    RTCDataChannel dataChannel, 
    File file, 
    String fileId,
    {int resumeFromChunk = 0}
  ) async {
    final int totalSize = await file.length();
    final int totalChunks = (totalSize / _chunkSize).ceil();
    
    _progressControllers[fileId] = StreamController<double>.broadcast();

    // Смещение для возобновления скачивания (Resume Capability)
    int startOffset = resumeFromChunk * _chunkSize;
    
    if (startOffset >= totalSize) {
      throw Exception('Resume offset is larger than file size');
    }

    final stream = file.openRead(startOffset);
    
    int currentChunkIndex = resumeFromChunk;
    int bytesSentBytes = startOffset;

    // Вспомогательный буфер, если куски File.openRead приходят не по 1 МБ
    List<int> chunkBuffer = [];

    await for (final List<int> data in stream) {
      chunkBuffer.addAll(data);

      while (chunkBuffer.length >= _chunkSize) {
        final chunkData = Uint8List.fromList(chunkBuffer.sublist(0, _chunkSize));
        chunkBuffer = chunkBuffer.sublist(_chunkSize);

        await _sendChunk(dataChannel, chunkData, currentChunkIndex, fileId);
        
        currentChunkIndex++;
        bytesSentBytes += _chunkSize;
        _progressControllers[fileId]?.add(bytesSentBytes / totalSize);
      }
    }

    // Отправка остатков файла (последний чанк, который меньше 1 МБ)
    if (chunkBuffer.isNotEmpty) {
      final chunkData = Uint8List.fromList(chunkBuffer);
      await _sendChunk(dataChannel, chunkData, currentChunkIndex, fileId);
      
      bytesSentBytes += chunkBuffer.length;
      _progressControllers[fileId]?.add(1.0); // Полностью загружен
    }

    _progressControllers[fileId]?.close();
    _progressControllers.remove(fileId);
  }

  /// Упаковывает данные и отправляет в дата-канал с проверкой контрольной суммы (Integrity)
  Future<void> _sendChunk(
    RTCDataChannel channel, 
    Uint8List data, 
    int chunkIndex, 
    String fileId
  ) async {
    // В реальном P2P размер буфера RTC имеет пределы.
    // Если буфер переполнен (slow connection), ждем его освобождения.
    while (channel.bufferedAmount != null && channel.bufferedAmount! > 16 * 1024 * 1024) {
      await Future.delayed(const Duration(milliseconds: 50));
    }

    // Integrity Check (Hash) - SHA256 для 1MB файла
    final checksum = sha256.convert(data).toString();

    // Создаем заголовок чанка с метаданными (JSON или бинарная сигнатура)
    // Упрощенно передаем в виде String для контрольной суммы, а данные бинарно.
    // В Production используется бинарный header: [MetaDataLength][JSON Bytes][Payload]
    // Здесь отправляем данные напрямую, а мета-информацию отдельным сервисным пакетом 
    // перед бинарным выбросом.
    final headerStr = '{"fileId":"$fileId","chunk":$chunkIndex,"checksum":"$checksum"}';
    channel.send(RTCDataChannelMessage(headerStr));
    
    // Отправка 1MB бинарных данных
    channel.send(RTCDataChannelMessage.fromBinary(data));
  }

  Stream<double> getProgressStream(String fileId) {
    if (_progressControllers.containsKey(fileId)) {
      return _progressControllers[fileId]!.stream;
    }
    return const Stream<double>.empty();
  }
}
