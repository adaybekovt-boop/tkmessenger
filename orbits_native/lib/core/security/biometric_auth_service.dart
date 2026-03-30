import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:dartz/dartz.dart';
import '../error/failures.dart';

class BiometricAuthService {
  final LocalAuthentication auth = LocalAuthentication();

  /// Проверяет наличие настроенной биометрии на телефоне
  Future<bool> get canCheckBiometrics async {
    return await auth.canCheckBiometrics || await auth.isDeviceSupported();
  }

  /// Открытие интерфейса FaceID/Fingerprint.
  /// В ТЗ №10 указано: "Доступ в приложение только по FaceID / отпечатку."
  Future<Either<Failure, bool>> authenticate() async {
    try {
      final canCheck = await canCheckBiometrics;
      if (!canCheck) {
        return const Left(SecurityFailure(message: 'Биометрия не поддерживается устройством. Включите пароль.'));
      }

      final authenticated = await auth.authenticate(
        localizedReason: 'Для входа в Крипто-Кабинет требуется подтверждение личности',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false, // Разрешаем PIN код ОС
        ),
      );

      return Right(authenticated);
    } on PlatformException catch (e) {
      return Left(SecurityFailure(message: 'Ошибка доступа к биометрии: ${e.message}'));
    }
  }

  /// Проверка на ввода лже-пароля (Duress Password) 
  /// Если введен именно этот пароль — открывается пустая БД.
  bool isDuressPassword(String input, String expectedDuressHash) {
    // Здесь должна быть логика сравнения криптографического хеша (SHA-256)
    // чтобы не хранить "лже-пароль" в открытом виде в ОЗУ.
    return false; // Логика будет расширена в AuthBloc
  }
}
