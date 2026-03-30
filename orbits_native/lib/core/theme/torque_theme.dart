import 'package:flutter/material.dart';

class TorqueTheme {
  // Базовая палитра (Глубокий обсидиан космоса)
  static const Color backgroundObsidian = Color(0xFF0A0A0B);
  static const Color glassSurface = Color(0xCC1C1C1E); // Прозрачность 0.8 (Glass-morphism)
  
  // Акценты
  static const Color neonMatrixGreen = Color(0xFF00FF41);
  static const Color goldVerified = Color(0xFFFFD700);
  static const Color trustYellow = Color(0xFFFFCC00);
  static const Color dangerRed = Color(0xFFFF3B30);
  
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFF8E8E93);

  // Генерируем 120FPS-ready MaterialApp theme
  static ThemeData get themeData {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: backgroundObsidian,
      primaryColor: neonMatrixGreen,
      
      colorScheme: const ColorScheme.dark(
        primary: neonMatrixGreen,
        secondary: goldVerified,
        surface: glassSurface,
        background: backgroundObsidian,
        error: dangerRed,
      ),

      // Глобальные стили стекла для панелей
      cardTheme: const CardTheme(
        color: glassSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
      ),
      
      // Стилизация шрифтов
      textTheme: const TextTheme(
        displayLarge: TextStyle(color: textPrimary, fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 1.2),
        bodyLarge: TextStyle(color: textPrimary, fontSize: 16),
        bodyMedium: TextStyle(color: textSecondary, fontSize: 14),
      ),
      
      useMaterial3: true,
    );
  }

  /// Возвращает BoxDecoration с неоновым свечением, 
  /// которое можно отключать (возвращать null в boxShadow), если FPS падает.
  static BoxDecoration getNeonDecoration({Color color = neonMatrixGreen, bool glow = true}) {
    return BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color, width: 1.5),
      boxShadow: glow ? [
        BoxShadow(color: color.withOpacity(0.4), blurRadius: 15, spreadRadius: 0)
      ] : null,
    );
  }

  /// Динамическое затемнение UI при обрывах P2P соединения 
  /// Возвращает уровень Opacity виджетов интерфейса (1.0 = отлично, 0.4 = лаги)
  static double getNetworkDimmerValue(int pingMs) {
    if (pingMs <= 150) return 1.0;
    if (pingMs < 500) return 0.7; // Тускнеет
    return 0.4; // Почти пропал (Крайняя нестабильность / Ожидание сети)
  }
}
