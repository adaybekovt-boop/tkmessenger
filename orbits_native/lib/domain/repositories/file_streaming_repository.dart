import 'dart:io';
import 'package:dartz/dartz.dart';
import '../../../core/error/failures.dart';

abstract class FileStreamingRepository {
  /// Инициализирует потоковую передачу большого файла по нативному WebRTC каналу.
  /// [targetPeerId] - ID получателя.
  /// [file] - Файл для передачи (до 10 ГБ).
  /// [resumeFromChunk] - Индекс чанка для продолжения загрузки (докачка при обрыве).
  Future<Either<Failure, void>> streamLargeFileStreaming(
    String targetPeerId, 
    File file, 
    {int resumeFromChunk = 0}
  );

  /// Получение потока статусов передачи (прогресс от 0.0 до 1.0)
  Stream<double> getTransferProgress(String fileId);
}
