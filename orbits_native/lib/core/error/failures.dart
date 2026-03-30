import 'package:equatable/equatable.dart';

abstract class Failure extends Equatable {
  final String message;
  
  const Failure({required this.message});
  
  @override
  List<Object> get props => [message];
}

// Ошибки P2P соединения (таймауты, недоступность TURN, обрывы)
class NetworkFailure extends Failure {
  const NetworkFailure({required super.message});
}

// Ошибки локальной базы данных (Hive)
class CacheFailure extends Failure {
  const CacheFailure({required super.message});
}

// Ошибки безопасности (неверный PIN/Биометрия, попытка скриншота)
class SecurityFailure extends Failure {
  const SecurityFailure({required super.message});
}
