import 'package:flutter/material.dart';
import 'package:orbits_native/domain/entities/user_profile.dart';
import 'core/injection/injection_container.dart' as di;

void main() async {
  // Инициализация слоя виджетов
  WidgetsFlutterBinding.ensureInitialized();
  
  // Инициализация локальной быстрой БД Hive
  await Hive.initFlutter();
  // Регистрация адаптера и открытие бокса профиля
  Hive.registerAdapter(UserProfileAdapter());
  await Hive.openBox<UserProfile>('user_profile');
  
  // Регистрация всех зависимостей (Clean Architecture DI)
  await di.init();

  runApp(const OrbitsApp());
}

class OrbitsApp extends StatelessWidget {
  const OrbitsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Orbits',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0A0B), // Глубокий обсидиан по спецификации Orbital Lottery/Torque UI
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00FF41), // Neon Matrix Green
          surface: Color(0xCC1C1C1E), // Эффект стекла (прозрачность)
        ),
        useMaterial3: true,
      ),
      home: const Scaffold(
        body: Center(
          child: Text(
            'ORBITS: NATIVE KERNEL INITIALIZED',
            style: TextStyle(color: Color(0xFF00FF41), fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }
}
