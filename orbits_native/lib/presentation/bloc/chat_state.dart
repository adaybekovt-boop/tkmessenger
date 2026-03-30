part of 'chat_bloc.dart';

abstract class ChatState extends Equatable {
  const ChatState();
  
  @override
  List<Object> get props => [];
}

class ChatInitial extends ChatState {}

class ChatConnecting extends ChatState {}

class ChatConnected extends ChatState {
  final String peerId;
  final List<Message> messages;

  const ChatConnected({required this.peerId, this.messages = const []});

  ChatConnected copyWith({String? peerId, List<Message>? messages}) {
    return ChatConnected(
      peerId: peerId ?? this.peerId,
      messages: messages ?? this.messages,
    );
  }

  @override
  List<Object> get props => [peerId, messages];
}

class ChatError extends ChatState {
  final String message;

  const ChatError(this.message);

  @override
  List<Object> get props => [message];
}
