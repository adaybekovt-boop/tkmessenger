import 'dart:io';
import 'package:dartz/dartz.dart';
import '../../core/error/failures.dart';
import '../../domain/repositories/file_streaming_repository.dart';
import '../datasources/webrtc_data_streamer.dart';
import '../datasources/webrtc_remote_data_source.dart';

class FileStreamingRepositoryImpl implements FileStreamingRepository {
  final WebRtcDataStreamer streamer;
  final WebRTCRemoteDataSource remoteDataSource;

  FileStreamingRepositoryImpl({
    required this.streamer,
    required this.remoteDataSource,
  });

  @override
  Future<Either<Failure, void>> streamLargeFileStreaming(
    String targetPeerId, 
    File file, 
    {int resumeFromChunk = 0}
  ) async {
    try {
      final fileId = file.path.split(Platform.pathSeparator).last;
      
      // В реальном сценарии мы получаем/устанавливаем DataChannel через remoteDataSource.
      // Здесь предполагается, что соединение с targetPeerId уже открыто:
      // final dataChannel = await remoteDataSource.getChannel(targetPeerId);
      final dataChannel = null; // Заглушка (mock) для демонстрационной архитектуры
      
      if (dataChannel == null) {
        return Left(NetworkFailure(message: 'Не найдено активное WebRTC P2P соединение с $targetPeerId'));
      }

      // Вызов ядра стриминга (Zero-RAM Spikes, Chunking, SHA256 Integrity)
      await streamer.streamFile(dataChannel, file, fileId, resumeFromChunk: resumeFromChunk);

      return const Right(null);
    } catch (e) {
      // При обрыве соединения (Network error) мы перехватываем ошибку и логируем как Failure.
      // В UI (Bloc) это будет перехвачено, а затем запрошена докачка с последнего сохраненного чанка.
      return Left(NetworkFailure(message: 'Ошибка P2P стриминга (докачка возможна): $e'));
    }
  }

  @override
  Stream<double> getTransferProgress(String fileId) {
    return streamer.getProgressStream(fileId);
  }
}
