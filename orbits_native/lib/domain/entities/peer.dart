import 'package:equatable/equatable.dart';

enum TrustLevel { 
  unknown,
  trusted,       // Контакт
  shieldGreen,   // Доверенный в сети (из Web of Trust)
  shieldYellow,  // Через 3-е рукопожатие
  gold,          // [NEW] Бизнес-верификация через личный контакт (QR-код)
  banned         // Забаненный мошенник/спамер
}

class Peer extends Equatable {
  final String id;
  final String nickname;
  final bool isOnline;
  final TrustLevel trustScore;

  const Peer({
    required this.id,
    required this.nickname,
    this.isOnline = false,
    this.trustScore = TrustLevel.unknown,
  });

  @override
  List<Object?> get props => [id, nickname, isOnline, trustScore];
}
