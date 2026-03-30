part of 'auth_bloc.dart';

abstract class AuthState extends Equatable {
  const AuthState();
  
  @override
  List<Object> get props => [];
}

class AuthLocked extends AuthState {
  final bool hasChaosSeed;
  const AuthLocked({this.hasChaosSeed = false});
}

class AuthUnlocked extends AuthState {
  final bool isDuressMode; // Флаг поддельного входа (Fake Cabinet)
  const AuthUnlocked({this.isDuressMode = false});

  @override
  List<Object> get props => [isDuressMode];
}

class ChaosSeedGenerated extends AuthState {
  final List<String> seedPhrase;
  const ChaosSeedGenerated(this.seedPhrase);

  @override
  List<Object> get props => [seedPhrase];
}

class AuthError extends AuthState {
  final String message;
  const AuthError(this.message);

  @override
  List<Object> get props => [message];
}
