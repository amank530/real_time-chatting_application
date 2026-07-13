/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  ScreenShare, 
  Disc, 
  Volume2, 
  Radio, 
  Download,
  AlertCircle
} from "lucide-react";

export default function CallWindow({
  chatId,
  chatName,
  callType,
  callerName,
  isIncoming,
  onDecline,
  onAccept,
  onEndCall,
  socket,
  remoteUserId,
  embedded = false
}) {
  const [callStatus, setCallStatus] = useState("ringing");

  // Listen to call acceptance signal to successfully connect call
  useEffect(() => {
    if (!socket) return;
    const onCallAccepted = () => {
      setCallStatus("connected");
    };
    socket.on("call-accepted", onCallAccepted);
    return () => {
      socket.off("call-accepted", onCallAccepted);
    };
  }, [socket]);
  
  // Audio/Video mute controls
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(callType === "audio");
  
  // Call Recording Controls
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const mediaRecorderRef = useRef(null);

  // Streams
  const [localStream, setLocalStream] = useState(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Ringtone / sound effects
  const ringtoneRef = useRef(null);

  // Timer
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef(null);

  // Initialize Media Access (Camera & Mic)
  useEffect(() => {
    const acquireMedia = async () => {
      try {
        const constraints = {
          audio: true,
          video: callType === "video" ? { width: 640, height: 480 } : false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Could not acquire audio/video hardware streams. Simulating video stream instead:", err);
      }
    };

    if (callStatus === "connected") {
      acquireMedia();
      
      // Start call duration timer
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus, callType]);

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [localStream]);

  // Handle call accept
  const handleAcceptCall = () => {
    setCallStatus("connected");
    onAccept();
  };

  // Toggle local Audio mute
  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
    }
    setMicMuted(!micMuted);
  };

  // Toggle local Video transmission
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
    }
    setVideoOff(!videoOff);
  };

  // Toggle Screen Sharing Simulation
  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
        }
        setScreenSharing(true);
        
        displayStream.getVideoTracks()[0].onended = () => {
          // Restore camera stream
          if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
          }
          setScreenSharing(false);
        };
      } catch (err) {
        console.error("Screen sharing canceled:", err);
      }
    } else {
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      setScreenSharing(false);
    }
  };

  // Toggle recording session
  const toggleRecording = () => {
    if (!isRecording) {
      if (!localStream) {
        alert("Active media stream is required to record the call.");
        return;
      }
      try {
        const recorder = new MediaRecorder(localStream, { mimeType: "video/webm;codecs=vp9" });
        mediaRecorderRef.current = recorder;
        const chunks = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          
          // Automatic compilation download
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `chatify-recording-${chatName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);
        };

        recorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Failed to start MediaRecorder:", err);
      }
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div 
      id={embedded ? "active-call-embedded" : "active-call-modal"} 
      className={embedded 
        ? "w-full bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-between p-4 text-slate-100 shadow-xl overflow-hidden animate-fadeIn"
        : "fixed inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-between p-6 z-[99] text-slate-100"
      }
    >
      
      {/* Call Header Indicator */}
      <div className="w-full flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
          <span className="uppercase font-bold tracking-widest text-rose-500">
            {callType === "video" ? "HD Video Session" : "HD Audio Session"}
          </span>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 px-3 py-1 rounded-full font-mono font-medium text-slate-300">
          {callStatus === "connected" ? formatTimer(callDuration) : "Dialing..."}
        </div>
      </div>

      {/* Main Calling Stage */}
      <div className={`w-full flex flex-col justify-center items-center relative ${embedded ? "my-2" : "flex-1 max-w-4xl my-6"}`}>
        {callStatus === "ringing" ? (
          /* RINGING LAYOUT */
          <div className="text-center space-y-4">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping scale-150 duration-1000" />
              <img 
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(callerName)}`} 
                alt={callerName} 
                className={`${embedded ? "w-16 h-16" : "w-28 h-28"} rounded-full border-4 border-indigo-600 shadow-xl object-cover`}
              />
            </div>
            <div>
              <h2 className={`${embedded ? "text-lg" : "text-2xl"} font-black text-white`}>{callerName}</h2>
              <p className="text-slate-400 text-[11px] uppercase tracking-widest animate-pulse font-medium">Incoming Call...</p>
            </div>
          </div>
        ) : (
          /* CONNECTED STAGE */
          <div className={`w-full ${embedded ? "h-36 md:h-44" : "h-full min-h-[300px]"} grid grid-cols-1 md:grid-cols-2 gap-4 relative`}>
            {/* Local Video Stream Card */}
            <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center">
              {callType === "video" && !videoOff ? (
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              ) : (
                <div className="text-center p-3">
                  <div className={`${embedded ? "w-10 h-10 mb-1.5" : "w-20 h-20 mb-3"} bg-indigo-950 rounded-full border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 font-bold text-xs`}>
                    Local
                  </div>
                  <p className="text-[10px] text-slate-500">Your camera is deactivated</p>
                </div>
              )}
              <span className="absolute top-2 left-2 bg-slate-950/80 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400">
                You (Sender)
              </span>
            </div>

            {/* Remote Video Stream Card */}
            <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center">
              {callType === "video" ? (
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover bg-black"
                  // Fallback simulation video feed
                  poster={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(chatName)}`}
                />
              ) : (
                <div className="text-center p-3">
                  <div className={`${embedded ? "w-10 h-10 mb-1.5" : "w-20 h-20 mb-3"} bg-emerald-950 rounded-full border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 font-bold animate-pulse text-xs`}>
                    {chatName.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-[10px] text-slate-500">Remote Connected</p>
                </div>
              )}
              <span className="absolute top-2 left-2 bg-slate-950/80 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400">
                {chatName}
              </span>
            </div>

            {/* Call Recording alert tag */}
            {isRecording && (
              <div className="absolute top-2 right-2 bg-rose-900/80 border border-rose-500/40 text-rose-300 px-2.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1.5 animate-pulse">
                <Radio className="w-3 h-3" />
                RECORDING
              </div>
            )}
          </div>
        )}
      </div>

      {/* Call Actions Controls Footbar */}
      <div className={`w-full flex justify-center ${embedded ? "py-1" : "py-4"} shrink-0`}>
        {callStatus === "ringing" ? (
          /* RINGING ACTIONS */
          <div className="flex items-center gap-4">
            <button
              onClick={onDecline}
              className={`bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-lg shadow-rose-500/20 active:scale-95 transition ${embedded ? "p-2.5" : "p-4"}`}
              title="Decline Call"
            >
              <PhoneOff className={embedded ? "w-5 h-5" : "w-6 h-6"} />
            </button>
            <button
              onClick={handleAcceptCall}
              className={`bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/20 active:scale-95 transition ${embedded ? "p-2.5" : "p-4"}`}
              title="Accept Call"
            >
              <Volume2 className={`${embedded ? "w-5 h-5" : "w-6 h-6"} animate-bounce`} />
            </button>
          </div>
        ) : (
          /* CONNECTED ACTIONS */
          <div className={`flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-full shadow-2xl ${embedded ? "px-4 py-2" : "px-6 py-3"}`}>
            
            {/* Audio Toggle */}
            <button
              onClick={toggleMic}
              className={`rounded-full transition ${embedded ? "p-2" : "p-3"} ${micMuted ? "bg-rose-900/60 text-rose-400 border border-rose-500/20" : "bg-slate-800 hover:bg-slate-700 text-slate-300"}`}
              title={micMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {micMuted ? <MicOff className={embedded ? "w-4 h-4" : "w-5 h-5"} /> : <Mic className={embedded ? "w-4 h-4" : "w-5 h-5"} />}
            </button>

            {/* Video Toggle */}
            {callType === "video" && (
              <button
                onClick={toggleVideo}
                className={`rounded-full transition ${embedded ? "p-2" : "p-3"} ${videoOff ? "bg-rose-900/60 text-rose-400 border border-rose-500/20" : "bg-slate-800 hover:bg-slate-700 text-slate-300"}`}
                title={videoOff ? "Activate Camera" : "Deactivate Camera"}
              >
                {videoOff ? <VideoOff className={embedded ? "w-4 h-4" : "w-5 h-5"} /> : <Video className={embedded ? "w-4 h-4" : "w-5 h-5"} />}
              </button>
            )}

            {/* Screen sharing simulation (Only in Video) */}
            {callType === "video" && (
              <button
                onClick={toggleScreenShare}
                className={`rounded-full transition ${embedded ? "p-2" : "p-3"} ${screenSharing ? "bg-indigo-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300"}`}
                title={screenSharing ? "Stop sharing screen" : "Share screen"}
              >
                <ScreenShare className={embedded ? "w-4 h-4" : "w-5 h-5"} />
              </button>
            )}

            {/* Call recording */}
            <button
              onClick={toggleRecording}
              className={`rounded-full transition ${embedded ? "p-2" : "p-3"} ${isRecording ? "bg-rose-600 text-white animate-pulse" : "bg-slate-800 hover:bg-slate-700 text-slate-300"}`}
              title={isRecording ? "Stop Call Recording" : "Record call to disk"}
            >
              <Disc className={embedded ? "w-4 h-4" : "w-5 h-5"} />
            </button>

            {/* End call */}
            <button
              onClick={onEndCall}
              className={`bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-md shadow-rose-500/10 active:scale-95 transition ${embedded ? "p-2 ml-1" : "p-3 ml-2"}`}
              title="Hang up call"
            >
              <PhoneOff className={embedded ? "w-4 h-4" : "w-5 h-5"} />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
