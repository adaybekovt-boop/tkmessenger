import 'package:hive/hive.dart';
import '../../domain/entities/user_profile.dart';

class LocalStorageRepositoryImpl {
  final Box<UserProfile> _profileBox;

  LocalStorageRepositoryImpl(this._profileBox);

  UserProfile? getUserProfile() => _profileBox.get('profile');

  Future<void> saveUserProfile(UserProfile profile) async {
    await _profileBox.put('profile', profile);
  }
}
