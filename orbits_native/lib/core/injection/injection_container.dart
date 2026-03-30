import 'package:get_it/get_it.dart';

// Service Locator
final sl = GetIt.instance;

Future<void> init() async {
  /// ---------- CORE ----------
  // Здесь будем регистрировать общие утилиты (NetworkInfo, Cryptography)

  /// ---------- DATA SOURCES ----------
  // sl.registerLazySingleton<LocalDataSource>(() => HiveLocalDataSourceImpl());
  // sl.registerLazySingleton<RemoteDataSource>(() => WebRTCRemoteDataSourceImpl());

  /// ---------- REPOSITORIES ----------
  // sl.registerLazySingleton<P2PRepository>(
  //   () => P2PRepositoryImpl(local: sl(), remote: sl(), networkInfo: sl()),
  // );

  /// ---------- USECASES ----------
  // sl.registerLazySingleton(() => ConnectToPeerUseCase(sl()));
  // sl.registerLazySingleton(() => SendMessageUseCase(sl()));

  /// ---------- PRESENTATION (BLoC) ----------
  // sl.registerFactory(() => ChatBloc(connect: sl(), send: sl()));
}
