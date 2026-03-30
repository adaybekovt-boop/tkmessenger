import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../../domain/entities/message.dart';
import '../../../domain/entities/peer.dart';

part 'chat_event.dart';
part 'chat_state.dart';

class ChatBloc extends Bloc<ChatEvent, ChatState> {
  ChatBloc() : super(ChatInitial()) {
    on<ConnectToPeerEvent>((event, emit) async {
      emit(ChatConnecting());
      // Имитация задержки подключения (в будущем вызов UseCase)
      await Future.delayed(const Duration(seconds: 1));
      emit(const ChatConnected(peerId: 'Собеседник'));
    });

    on<SendMessageEvent>((event, emit) {
      if (state is ChatConnected) {
        final currentMessages = (state as ChatConnected).messages;
        emit((state as ChatConnected).copyWith(
          messages: List.from(currentMessages)..add(event.message),
        ));
      }
    });
  }
}
