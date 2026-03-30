import 'package:hive/hive.dart';

part 'user_profile.g.dart';

@HiveType(typeId: 0)
class UserProfile extends HiveObject {
  @HiveField(0)
  String nickname;

  @HiveField(1)
  String avatarPath; // local file path or base64 string

  @HiveField(2)
  bool biometricsEnabled;

  UserProfile({required this.nickname, required this.avatarPath, this.biometricsEnabled = false});
}
