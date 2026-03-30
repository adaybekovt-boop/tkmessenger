import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../../core/security/biometric_auth_service.dart';
import '../../../core/security/entropy_generator.dart';

part 'auth_event.dart';
part 'auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final BiometricAuthService _biometricService;
  final EntropyGenerator _entropyGenerator;

  AuthBloc({
    required BiometricAuthService biometricService,
    required EntropyGenerator entropyGenerator,
  })  : _biometricService = biometricService,
        _entropyGenerator = entropyGenerator,
        super(const AuthLocked()) {

    on<AttemptBiometricUnlock>((event, emit) async {
      final result = await _biometricService.authenticate();
      result.fold(
        (failure) => emit(AuthError(failure.message)),
        (isAuthenticated) {
          if (isAuthenticated) {
            // В реальной интеграции тут расшифровывается RAM Hive
            emit(const AuthUnlocked(isDuressMode: false));
          } else {
             emit(const AuthLocked());
          }
        },
      );
    });

    on<LockAppEvent>((event, emit) {
      // Имитация очистки ключей из ОЗУ (self-destruction timer trigger)
      emit(const AuthLocked());
    });

    on<GenerateChaosSeedEvent>((event, emit) {
      try {
        final phrase = _entropyGenerator.generateSeedPhrase(); // Uses 50+ coords
        emit(ChaosSeedGenerated(phrase));
      } catch (e) {
        emit(AuthError(e.toString()));
      }
    });

  }
}
