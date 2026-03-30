import 'dart:math';
import '../../../core/error/failures.dart';
import '../../entities/peer.dart';

class ReportInfo {
  final DateTime timestamp;
  final String reporterId;
  final double weight;
  
  ReportInfo(this.timestamp, this.reporterId, this.weight);
}

class OrbitsTrustManager {
  // Локальная БД жалоб
  final Map<String, List<ReportInfo>> _localBlacklist = {};
  
  // Кэш для Anti-Brigading (лимит 3 жалобы в час)
  final Map<String, int> _reportCountPerHour = {};
  DateTime _currentHour = DateTime.now();

  /// Расчет "веса" жалобы. 
  /// Anti-Brigading: Зависимость от возраста аккаунта (в днях) и количества доверенных связей.
  double calculateReportWeight(int accountAgeDays, int trustedConnections) {
    // Вес пустого (нового) аккаунта практически равен нулю
    if (accountAgeDays < 1) return 0.1; 
    
    // Формула: (лог возраста) + бонус за доверенные связи
    final ageWeight = log(accountAgeDays + 1) / log(10); 
    final networkWeight = log(trustedConnections + 2);
    
    return (ageWeight + networkWeight).clamp(0.1, 10.0);
  }

  /// Пожаловаться на пользователя (Report Flow)
  void reportPeer(String targetPeerId, String reporterId, double weight) {
    _cleanupHourlyLimits();

    if ((_reportCountPerHour[reporterId] ?? 0) >= 3) {
      throw Exception('Anti-Brigading Limit: Превышен лимит жалоб (до 3 в час).');
    }

    _reportCountPerHour[reporterId] = (_reportCountPerHour[reporterId] ?? 0) + 1;

    _localBlacklist.putIfAbsent(targetPeerId, () => []);
    _localBlacklist[targetPeerId]!.add(ReportInfo(DateTime.now(), reporterId, weight));
  }

  /// Вычисление дистанции доверия (Web of Trust)
  TrustLevel resolveTrustLevel(String targetPeerId, bool isDirectContact, int sharedTrustedNodes) {
    // 1. Физическая верификация - Gold статус не может быть перекрыт жалобами толпы (Immutable)
    if (_isVerifiedGold(targetPeerId)) {
      return TrustLevel.gold;
    }

    // 2. Проверка жалоб
    final reports = _localBlacklist[targetPeerId] ?? [];
    final totalWeight = reports.fold(0.0, (sum, report) => sum + report.weight);

    // Если "вес" жалоб больше критического порога - автоматический бан
    if (totalWeight > 25.0) {
      return TrustLevel.banned;
    }

    // 3. Вычисление позитивного уровня (Дистанция доверия)
    if (isDirectContact) {
      return TrustLevel.trusted;
    } else if (sharedTrustedNodes >= 2) {
      return TrustLevel.shieldGreen; // Доверенный несколькими вашими друзьями
    } else if (sharedTrustedNodes == 1) {
      return TrustLevel.shieldYellow; // Доверенный через 3-е рукопожатие
    }

    return TrustLevel.unknown;
  }

  /// Верификация через QR-код при личной встрече (Gold Status)
  void verifyPhysicalContact(String targetPeerId, String qrSignature) {
    // TODO: Здесь криптографическая проверка подписи QR-кода ключом партнера
    // Если подпись верна, статус навсегда становится Gold
    _markAsGold(targetPeerId);
  }

  bool _isVerifiedGold(String id) => false; // Заглушка БД
  void _markAsGold(String id) {} // Заглушка БД

  void _cleanupHourlyLimits() {
    final now = DateTime.now();
    if (now.difference(_currentHour).inHours >= 1) {
      _reportCountPerHour.clear();
      _currentHour = now;
    }
  }
}
