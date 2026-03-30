import 'package:equatable/equatable.dart';

enum MessageType { text, image, video, file, audio, ping, typing }

enum MessageStatus { sending, sent, delivered, read, failed }

class Message extends Equatable {
  final String id;        // Timestamp or UUID
  final String senderId;  // От кого
  final String chatId;    // Для кого (или название чата)
  final String content;   // Текст или путь к файлу/blob
  final MessageType type;
  final MessageStatus status;
  final DateTime timestamp;

  const Message({
    required this.id,
    required this.senderId,
    required this.chatId,
    required this.content,
    required this.type,
    required this.status,
    required this.timestamp,
  });

  @override
  List<Object?> get props => [id, senderId, chatId, content, type, status, timestamp];
}
