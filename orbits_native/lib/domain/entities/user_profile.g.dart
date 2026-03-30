// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_profile.dart';

class UserProfileAdapter extends TypeAdapter<UserProfile> {
  @override
  final int typeId = 0;

  @override
  UserProfile read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return UserProfile(
      nickname: fields[0] as String,
      avatarPath: fields[1] as String,
      biometricsEnabled: fields[2] as bool? ?? false,
    );
  }

  @override
  void write(BinaryWriter writer, UserProfile obj) {
    writer
      ..writeByte(3)
      ..writeByte(0)
      ..write(obj.nickname)
      ..writeByte(1)
      ..write(obj.avatarPath)
      ..writeByte(2)
      ..write(obj.biometricsEnabled);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserProfileAdapter && runtimeType == other.runtimeType && typeId == other.typeId;
}
