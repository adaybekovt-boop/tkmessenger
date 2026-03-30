part of 'auth_bloc.dart';

abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object> get props => [];
}

class AttemptBiometricUnlock extends AuthEvent {}

class LockAppEvent extends AuthEvent {}

class GenerateChaosSeedEvent extends AuthEvent {
  final List<String> coordsRaw; // Упрощенный ввод сырых координат
  const GenerateChaosSeedEvent(this.coordsRaw);
}
