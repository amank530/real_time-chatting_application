/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc, getDoc, setDoc, collection, addDoc } from "firebase/firestore";
import { io } from "socket.io-client";
import { 
  ShieldCheck, 
  Sparkles, 
  Zap, 
  MessageSquare, 
  Users, 
  Brain, 
  VolumeX, 
  Lock,
  Compass,
  AlertTriangle,
  FileCheck
} from "lucide-react";

import { getFirebase, getDb, getFirebaseAuth } from "./lib/firebase.js";
import AuthScreen from "./components/AuthScreen.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatArea from "./components/ChatArea.jsx";
import CallWindow from "./components/CallWindow.jsx";
import AiAssistantPanel from "./components/AiAssistantPanel.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import ProfilePanel from "./components/ProfilePanel.jsx";
import CallHistoryPanel from "./components/CallHistoryPanel.jsx";
import { AnimatePresence } from "motion/react";

export default function App() {
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [activeTab, setActiveTab] = useState("chats");
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  
  // Socket.IO signaling & indicators
  const [socket, setSocket] = useState(null);
  const [typingUsers, setTypingUsers] = useState({}); // chatId -> string description
  const [onlineStatusList, setOnlineStatusList] = useState([]);

  // HD Calling Overlays states
  const [activeCallSession, setActiveCallSession] = useState(null);
  const [isIncomingCall, setIsIncomingCall] = useState(false);

  // Resize listener for mobile/tablet responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const logCallEventToChat = async (chatId, text) => {
    if (!chatId) return;
    try {
      const db = getDb();
      const messagesRef = collection(db, "chats", chatId, "messages");
      await addDoc(messagesRef, {
        senderId: "system",
        senderName: "System",
        text: text,
        type: "system",
        timestamp: new Date(),
        readBy: ["system"],
        reactions: {},
        encrypted: false
      });
      // Update last message in the room
      const chatRef = doc(db, "chats", chatId);
      await updateDoc(chatRef, {
        lastMessage: {
          text: `📢 ${text}`,
          senderId: "system",
          senderName: "System",
          timestamp: new Date()
        }
      });
      if (socket) {
        socket.emit("message-updated", { chatId });
      }
    } catch (err) {
      console.warn("Failed to log call system event message:", err);
    }
  };

  // Real-time sync of all users from Firestore
  useEffect(() => {
    if (!currentUser) {
      setAllUsers([]);
      return;
    }
    const db = getDb();
    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersList = [];
      snapshot.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.uid !== currentUser.uid) {
          usersList.push(u);
        }
      });
      setAllUsers(usersList);
    }, (error) => {
      console.error("Failed to stream users in App.jsx:", error);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Initialize Firebase dynamically on mount
  useEffect(() => {
    getFirebase()
      .then(({ auth, db }) => {
        setFirebaseReady(true);

        // Bind auth state change listener
        onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            // Fetch and set user profile from Firestore
            const dbRef = getDb();
            const userRef = doc(dbRef, "users", firebaseUser.uid);
            onSnapshot(userRef, (docSnap) => {
              if (docSnap.exists()) {
                const profile = docSnap.data();
                setCurrentUser(profile);
              }
            }, (err) => {
              console.error("Failed to stream user profile for authenticated user:", err);
            });
          } else {
            // Fallback: check if there's a custom DB user logged in locally
            const localUserId = localStorage.getItem("chatify_user_id");
            if (localUserId) {
              const dbRef = getDb();
              const userRef = doc(dbRef, "users", localUserId);
              onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                  const profile = docSnap.data();
                  setCurrentUser(profile);
                } else {
                  setCurrentUser(null);
                }
              }, (err) => {
                console.error("Failed to stream user profile for local custom user:", err);
                setCurrentUser(null);
              });
            } else {
              setCurrentUser(null);
            }
          }
        });
      })
      .catch((err) => {
        console.error("Firebase init failed in App.jsx", err);
      });
  }, []);

  // Manage Real-time network sockets, Typing states, and Video Signalling
  useEffect(() => {
    if (!currentUser) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Connect Socket.IO to full-stack backend
    const socketInstance = io(window.location.origin);
    setSocket(socketInstance);

    // Register user as active on network
    socketInstance.emit("user-online", {
      userId: currentUser.uid,
      displayName: currentUser.displayName
    });

    // Listen to typing status updates
    socketInstance.on("typing-status", (data) => {
      setTypingUsers((prev) => {
        const copy = { ...prev };
        if (data.isTyping && data.userId !== currentUser.uid) {
          copy[data.chatId] = `${data.userName}`;
        } else {
          delete copy[data.chatId];
        }
        return copy;
      });
    });

    // Listen to network active status updates
    socketInstance.on("active-users-list", (data) => {
      setOnlineStatusList(data);
    });

    // Helper to update call logs in Firestore on hangup/decline
    const updateCallDurationInDb = (session) => {
      if (session && session.dbLogId) {
        const duration = session.startTime ? Math.round((Date.now() - session.startTime) / 1000) : 0;
        const db = getDb();
        updateDoc(doc(db, "calls", session.dbLogId), {
          duration: duration,
          endedAt: new Date()
        }).catch(err => console.warn("Failed to update call duration:", err));
      }
    };

    // Listen to incoming WebRTC phone calling sessions
    socketInstance.on("incoming-call", (data) => {
      const db = getDb();
      const callLogRef = doc(collection(db, "calls"));
      const callLogId = callLogRef.id;

      setActiveCallSession({
        id: `call-${Date.now()}`,
        chatId: data.chatId,
        callerId: data.from,
        callerName: data.callerName,
        receiverId: currentUser.uid,
        receiverName: currentUser.displayName,
        type: data.type,
        status: "ringing",
        createdAt: new Date(),
        dbLogId: callLogId,
        startTime: null
      });
      setIsIncomingCall(true);

      // Log incoming call to Firestore history
      setDoc(callLogRef, {
        id: callLogId,
        chatId: data.chatId,
        callerId: data.from,
        callerName: data.callerName,
        receiverId: currentUser.uid,
        receiverName: currentUser.displayName,
        type: data.type,
        timestamp: new Date(),
        status: "incoming",
        duration: 0
      }).catch(err => console.error("Failed to log incoming call:", err));
    });

    socketInstance.on("call-accepted", () => {
      setActiveCallSession((prev) => {
        if (prev) {
          const updated = { ...prev, status: "connected", startTime: Date.now() };
          // Update status in call history
          const db = getDb();
          if (prev.dbLogId) {
            updateDoc(doc(db, "calls", prev.dbLogId), {
              status: "connected"
            }).catch(err => console.warn("Failed to update call status in db on accept:", err));
          }
          // Log connected status to chat room
          logCallEventToChat(prev.chatId, `📞 ${prev.type === "video" ? "Video" : "Voice"} Call Connected Successfully`);
          return updated;
        }
        return prev;
      });
    });

    socketInstance.on("call-ended", () => {
      setActiveCallSession((prev) => {
        if (prev) {
          updateCallDurationInDb(prev);
        }
        return null;
      });
      setIsIncomingCall(false);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [currentUser?.uid]);

  // Logout Trigger
  const handleLogout = async () => {
    if (currentUser) {
      const db = getDb();
      // Set offline status in Firestore
      const userRef = doc(db, "users", currentUser.uid);
      try {
        await updateDoc(userRef, { online: false, lastSeen: new Date() });
      } catch (err) {
        console.warn("Could not update online status during sign-out:", err);
      }
    }

    localStorage.removeItem("chatify_user_id");

    getFirebase().then(({ auth }) => {
      signOut(auth).then(() => {
        setCurrentUser(null);
        setActiveChat(null);
        setActiveTab("chats");
      });
    });
  };

  // Helper to update call log duration
  const updateCallDurationInDb = (session) => {
    if (session && session.dbLogId) {
      const duration = session.startTime ? Math.round((Date.now() - session.startTime) / 1000) : 0;
      const db = getDb();
      updateDoc(doc(db, "calls", session.dbLogId), {
        duration: duration,
        endedAt: new Date()
      }).catch(err => console.warn("Failed to update call duration:", err));
    }
  };

  // Trigger Outgoing Call Session
  const handleStartOutgoingCall = (type, customChat = null) => {
    const chatToUse = customChat || activeChat;
    if (!chatToUse || !socket || !currentUser) return;

    // Find recipient UID
    const receiverId = chatToUse.members.find(m => m !== currentUser.uid) || "";
    const recipientUser = allUsers.find(u => u.uid === receiverId);
    const receiverName = recipientUser ? recipientUser.displayName : (chatToUse.name || "Remote User");

    const db = getDb();
    const callLogRef = doc(collection(db, "calls"));
    const callLogId = callLogRef.id;

    const session = {
      id: `call-${Date.now()}`,
      chatId: chatToUse.id,
      callerId: currentUser.uid,
      callerName: currentUser.displayName,
      receiverId,
      receiverName,
      type,
      status: "ringing",
      createdAt: new Date(),
      dbLogId: callLogId,
      startTime: Date.now() // start timing immediately
    };

    setActiveCallSession(session);
    setIsIncomingCall(false);

    // Log call to Firestore history
    setDoc(callLogRef, {
      id: callLogId,
      chatId: chatToUse.id,
      callerId: currentUser.uid,
      callerName: currentUser.displayName,
      receiverId,
      receiverName,
      type,
      timestamp: new Date(),
      status: "outgoing",
      duration: 0
    }).catch(err => console.error("Failed to log outgoing call:", err));

    // Signalling trigger to Socket server
    socket.emit("call-user", {
      userToCall: receiverId,
      signalData: null,
      from: currentUser.uid,
      callerName: currentUser.displayName,
      type,
      chatId: chatToUse.id
    });
  };

  const handleDeclineIncomingCall = () => {
    if (socket && activeCallSession) {
      socket.emit("end-call", { to: activeCallSession.callerId });
      
      // Update status in call history
      const db = getDb();
      if (activeCallSession.dbLogId) {
        updateDoc(doc(db, "calls", activeCallSession.dbLogId), {
          status: "declined"
        }).catch(err => console.warn(err));
      }

      // Log call as missed/declined to chat room
      logCallEventToChat(activeCallSession.chatId, `❌ Missed/Declined ${activeCallSession.type === "video" ? "Video" : "Voice"} Call`);

      updateCallDurationInDb(activeCallSession);
    }
    setActiveCallSession(null);
    setIsIncomingCall(false);
  };

  const handleAcceptIncomingCall = () => {
    if (socket && activeCallSession) {
      socket.emit("answer-call", { to: activeCallSession.callerId, signal: null });
      setActiveCallSession(prev => prev ? { ...prev, status: "connected", startTime: Date.now() } : null);

      // Update status in call history
      const db = getDb();
      if (activeCallSession.dbLogId) {
        updateDoc(doc(db, "calls", activeCallSession.dbLogId), {
          status: "connected"
        }).catch(err => console.warn(err));
      }

      // Log connected status to chat room
      logCallEventToChat(activeCallSession.chatId, `📞 ${activeCallSession.type === "video" ? "Video" : "Voice"} Call Connected`);
    }
  };

  const handleHangUpCall = () => {
    if (socket && activeCallSession) {
      const targetId = isIncomingCall ? activeCallSession.callerId : activeCallSession.receiverId;
      socket.emit("end-call", { to: targetId });

      if (activeCallSession.status === "ringing") {
        // If it was cancelled before connected
        const db = getDb();
        if (activeCallSession.dbLogId) {
          updateDoc(doc(db, "calls", activeCallSession.dbLogId), {
            status: "missed"
          }).catch(err => console.warn(err));
        }
        logCallEventToChat(activeCallSession.chatId, `❌ Not Connected/Cancelled ${activeCallSession.type === "video" ? "Video" : "Voice"} Call`);
      } else {
        // If it was connected, log end with duration
        const duration = activeCallSession.startTime ? Math.round((Date.now() - activeCallSession.startTime) / 1000) : 0;
        const durationStr = duration > 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
        logCallEventToChat(activeCallSession.chatId, `⏱️ Call Ended (Duration: ${durationStr})`);
      }

      updateCallDurationInDb(activeCallSession);
    }
    setActiveCallSession(null);
    setIsIncomingCall(false);
  };

  // If Firebase is booting
  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 font-sans">
        <div className="p-4 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/10 mb-4 animate-bounce">
          <MessageSquare className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm font-bold tracking-widest text-slate-400 uppercase animate-pulse">
          Initializing secure chat servers...
        </p>
      </div>
    );
  }

  // If user is block muted
  if (currentUser?.blocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 font-sans">
        <div className="p-4 bg-rose-950/40 border border-rose-500/20 text-rose-400 rounded-full mb-4 animate-pulse">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-4">
          Your account has been suspended by content moderation staff for violating community guidelines.
        </p>
        <button 
          onClick={handleLogout}
          className="bg-rose-600 hover:bg-rose-500 font-bold text-xs py-2 px-6 rounded-lg transition"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // If not authenticated
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={(profile) => setCurrentUser(profile)} />;
  }

  // Sidebar visibility on mobile
  const showSidebar = !isMobile || (activeTab === "chats" && !activeChat && !showCallHistory);

  // Main area visibility on mobile
  const showMainArea = !isMobile || activeChat || showCallHistory || activeTab !== "chats";

  return (
    <div id="root-viewport-container" className="h-screen w-screen bg-slate-950 flex overflow-hidden font-sans select-none antialiased">
      
      {/* Sidebar Section */}
      {showSidebar && (
        <Sidebar
          currentUser={currentUser}
          activeChat={activeChat}
          onSelectChat={(chat) => {
            setActiveChat(chat);
            setActiveTab("chats");
            setShowCallHistory(false);
          }}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab !== "chats") {
              setActiveChat(null);
            }
          }}
          onLogout={handleLogout}
          typingUsers={typingUsers}
          onlineStatusList={onlineStatusList}
          showCallHistory={showCallHistory}
          onToggleCallHistory={() => {
            setShowCallHistory(prev => {
              const next = !prev;
              if (next) {
                setActiveChat(null);
              }
              return next;
            });
          }}
          allUsers={allUsers}
          onStartCall={handleStartOutgoingCall}
        />
      )}

      {/* Main Panel Area */}
      {showMainArea && (
        <div className="flex-1 h-full flex flex-col overflow-hidden w-full">
          {activeTab === "chats" ? (
            activeChat ? (
              <ChatArea
                currentUser={currentUser}
                chat={activeChat}
                onStartCall={handleStartOutgoingCall}
                socket={socket}
                typingUserText={typingUsers[activeChat.id] || null}
                onBack={isMobile ? () => setActiveChat(null) : null}
                allUsers={allUsers}
                activeCallSession={activeCallSession}
                isIncomingCall={isIncomingCall}
                onDeclineCall={handleDeclineIncomingCall}
                onAcceptCall={handleAcceptIncomingCall}
                onEndCall={handleHangUpCall}
              />
            ) : showCallHistory ? (
              <CallHistoryPanel
                currentUser={currentUser}
                onClose={() => setShowCallHistory(false)}
                isFullView={true}
              />
            ) : (
              /* Blank Welcome Stage */
              <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                <div className="max-w-xl space-y-8">
                  <div className="flex items-center justify-center gap-4 text-left">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-indigo-500/10 rounded-full scale-125 blur-xl" />
                      <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                        <Compass className="w-7 h-7 animate-spin" style={{ animationDuration: "12s" }} />
                      </div>
                    </div>
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        Welcome to Chatify
                      </h1>
                      <p className="text-xs text-slate-400">
                        Your enterprise-grade AI messaging & WebRTC video hub
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Select an active workspace DM or group to initiate WebRTC streams, share file logs, and deploy client-side encryption.
                  </p>

                  {/* Feature highlight cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl text-left">
                      <Lock className="w-5 h-5 text-emerald-400 mb-2" />
                      <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">AES-GCM Encryption</h4>
                      <p className="text-[10px] text-slate-500 leading-normal mt-1">Client-side password key derivation ensures total privacy.</p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl text-left">
                      <Sparkles className="w-5 h-5 text-indigo-400 mb-2" />
                      <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">AI Assistant</h4>
                      <p className="text-[10px] text-slate-500 leading-normal mt-1">Saves preference context, routines, and drafts messages.</p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl text-left">
                      <Zap className="w-5 h-5 text-amber-500 mb-2" />
                      <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">HD Calling</h4>
                      <p className="text-[10px] text-slate-500 leading-normal mt-1">Signaled voice and video WebRTC calling with live local recorders.</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : activeTab === "ai-assistant" ? (
            <AiAssistantPanel 
              currentUser={currentUser} 
              onBack={isMobile ? () => setActiveTab("chats") : null}
            />
          ) : activeTab === "profile" ? (
            <ProfilePanel
              currentUser={currentUser}
              onBack={() => setActiveTab("chats")}
            />
          ) : (
            <AdminPanel 
              onBack={isMobile ? () => setActiveTab("chats") : null}
            />
          )}
        </div>
      )}

      {/* Full Screen HD calling Overlay - only if not already shown embedded inside the active chat area */}
      {activeCallSession && (!activeChat || activeChat.id !== activeCallSession.chatId) && (
        <CallWindow
          chatId={activeCallSession.chatId}
          chatName={isIncomingCall ? activeCallSession.callerName : activeCallSession.receiverName}
          callType={activeCallSession.type}
          callerName={activeCallSession.callerName}
          isIncoming={isIncomingCall}
          onDecline={handleDeclineIncomingCall}
          onAccept={handleAcceptIncomingCall}
          onEndCall={handleHangUpCall}
          socket={socket}
          remoteUserId={isIncomingCall ? activeCallSession.callerId : activeCallSession.receiverId}
        />
      )}
    </div>
  );
}
