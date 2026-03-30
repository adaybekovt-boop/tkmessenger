part of 'chat_bloc.dart';

abstract class ChatEvent extends Equatable {
  const ChatEvent();

  @override
  List<Object> get props => [];
}

class ConnectToPeerEvent extends ChatEvent {
  final String peerId;

  const ConnectToPeerEvent(this.peerId);

  @override
  List<Object> get props => [peerId];
}

class SendMessageEvent extends ChatEvent {
  final Message message;

  const SendMessageEvent(this.message);

  @override
  List<Object> get props => [message];
}
