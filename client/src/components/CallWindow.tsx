import React, { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Maximize2 } from 'lucide-react';
import { useSocketStore } from '../store/useSocketStore';

interface CallWindowProps {
  targetUserId: string;
  isVideo: boolean;
  isIncoming: boolean;
  onClose: () => void;
}

const CallWindow: React.FC<CallWindowProps> = ({ targetUserId, isVideo, isIncoming, onClose }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideo);
  const socket = useSocketStore((state) => state.socket);

  const setupWebRTC = async () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('ice_candidate', { targetUserId, candidate: event.candidate });
      }
    };

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    localStream.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream.current;
    }

    localStream.current.getTracks().forEach(track => {
      peerConnection.current?.addTrack(track, localStream.current!);
    });
  };

  useEffect(() => {
    setupWebRTC();
    
    socket?.on('ice_candidate', async (data) => {
      await peerConnection.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    return () => {
      localStream.current?.getTracks().forEach(t => t.stop());
      peerConnection.current?.close();
      socket?.off('ice_candidate');
    };
  }, []);

  const handleHangup = () => {
    socket?.emit('hangup', { targetUserId });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-md">
      <div className="relative w-full max-w-4xl aspect-video bg-tg-bg-secondary rounded-2xl overflow-hidden shadow-2xl">
        
        {/* Remote Video */}
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover"
        />

        {/* Local Video (PiP) */}
        <div className="absolute top-4 right-4 w-1/4 aspect-video bg-tg-bg-primary rounded-lg border-2 border-tg-accent overflow-hidden shadow-lg">
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 px-8 py-4 bg-tg-bg-elevated bg-opacity-50 backdrop-blur-xl rounded-full border border-white border-opacity-10">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full transition-all ${isMuted ? 'bg-tg-text-danger' : 'bg-tg-bg-input hover:bg-opacity-80'}`}
          >
            {isMuted ? <MicOff /> : <Mic />}
          </button>

          <button 
            onClick={() => setIsVideoOff(!isVideoOff)}
            className={`p-4 rounded-full transition-all ${isVideoOff ? 'bg-tg-text-danger' : 'bg-tg-bg-input hover:bg-opacity-80'}`}
          >
            {isVideoOff ? <VideoOff /> : <Video />}
          </button>

          <button className="p-4 bg-tg-bg-input hover:bg-opacity-80 rounded-full transition-all">
            <Monitor />
          </button>

          <button 
            onClick={handleHangup}
            className="p-4 bg-tg-text-danger hover:bg-opacity-80 rounded-full transition-all text-white"
          >
            <PhoneOff />
          </button>
        </div>

        {/* User Info Overlay */}
        <div className="absolute top-8 left-8">
          <h2 className="text-2xl font-bold text-white shadow-sm">{targetUserId}</h2>
          <span className="text-tg-accent animate-pulse">On call...</span>
        </div>
      </div>
    </div>
  );
};

export default CallWindow;
