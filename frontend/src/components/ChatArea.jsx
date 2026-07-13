/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  arrayUnion
} from "firebase/firestore";
import { getDb } from "../lib/firebase.js";
import { 
  Phone, 
  Video, 
  Send, 
  Paperclip, 
  Smile, 
  Lock, 
  Unlock, 
  Sparkles, 
  Search, 
  MoreVertical, 
  Reply, 
  Edit2, 
  Trash2, 
  Download, 
  FileText, 
  Image, 
  Music, 
  Film,
  CheckCheck,
  ChevronDown,
  X,
  Eye,
  ArrowLeft
} from "lucide-react";
import { encryptText, decryptText } from "../lib/crypto";
import CallWindow from "./CallWindow";

export default function ChatArea({
  currentUser,
  chat,
  onStartCall,
  socket,
  typingUserText,
  onBack,
  allUsers = [],
  activeCallSession = null,
  isIncomingCall = false,
  onDeclineCall = () => {},
  onAcceptCall = () => {},
  onEndCall = () => {},
  onViewUserProfile
}) {
  const [messages, setMessages] = useState([]);
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  
  // E2EE Password Status - set secure automatic E2EE key based on secret chat.id
  const [roomPassword, setRoomPassword] = useState(chat.encryptionPassword || "chatify_e2ee_" + chat.id);
  const [showPwdSetup, setShowPwdSetup] = useState(false);
  const [pwdInput, setPwdInput] = useState("");

  // Lightbox
  const [activeLightboxImage, setActiveLightboxImage] = useState(null);

  // File Upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Typing state tracking
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const typingTimeoutRef = useRef(null);

  // Resolve other user's real name and photoURL/avatar for direct message rooms
  const otherUserId = !chat.isGlobal && !chat.isGroup ? chat.members?.find(m => m !== currentUser.uid) : null;
  const otherUser = otherUserId ? (allUsers || []).find(u => u.uid === otherUserId) : null;

  const chatName = chat.isGlobal 
    ? "Global Lobby (Everyone)" 
    : chat.isGroup 
      ? (chat.name || "Group Chat") 
      : (otherUser ? otherUser.displayName : "Direct Message");

  const chatAvatar = chat.isGlobal 
    ? (chat.avatar || "https://api.dicebear.com/7.x/initials/svg?seed=Global")
    : chat.isGroup 
      ? (chat.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${chatName}`)
      : (otherUser ? (otherUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${chatName}`) : (chat.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=Direct`));

  // Listen to Messages in this Chat Room
  useEffect(() => {
    const db = getDb();
    const messagesRef = collection(db, "chats", chat.id, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      setMessages(msgs);

      // Trigger automatic read receipt if last message is from other user
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.senderId !== currentUser.uid && !lastMsg.readBy.includes(currentUser.uid)) {
          const msgDocRef = doc(db, "chats", chat.id, "messages", lastMsg.id);
          updateDoc(msgDocRef, {
            readBy: arrayUnion(currentUser.uid)
          });
        }
      }
    });

    return () => unsubscribe();
  }, [chat.id, currentUser.uid]);

  // Handle local typing socket broadcast
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (socket) {
      if (!isTypingLocal) {
        setIsTypingLocal(true);
        socket.emit("typing", {
          chatId: chat.id,
          userId: currentUser.uid,
          userName: currentUser.displayName,
          isTyping: true
        });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        setIsTypingLocal(false);
        socket.emit("typing", {
          chatId: chat.id,
          userId: currentUser.uid,
          userName: currentUser.displayName,
          isTyping: false
        });
      }, 2000);
    }
  };

  // Perform Client-Side decryption of messages as they arrive
  useEffect(() => {
    const decryptAll = async () => {
      const dict = {};
      for (const msg of messages) {
        if (msg.encrypted) {
          dict[msg.id] = await decryptText(msg.text, roomPassword);
        } else {
          dict[msg.id] = msg.text;
        }
      }
      setDecryptedMessages(dict);
    };

    decryptAll();
  }, [messages, roomPassword]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUserText]);

  // Send Message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const db = getDb();
    const finalPassword = roomPassword || chat.encryptionPassword;
    const encrypted = !!finalPassword;

    let payloadText = inputText.trim();
    if (encrypted) {
      payloadText = await encryptText(payloadText, finalPassword);
    }

    const newMessage = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      text: payloadText,
      type: "text",
      timestamp: new Date(),
      readBy: [currentUser.uid],
      reactions: {},
      encrypted: encrypted
    };

    if (replyingTo) {
      newMessage.replyTo = {
        messageId: replyingTo.id,
        text: decryptedMessages[replyingTo.id] || replyingTo.text,
        senderName: replyingTo.senderName
      };
    }

    try {
      const messagesRef = collection(db, "chats", chat.id, "messages");
      await addDoc(messagesRef, newMessage);

      // Update last message in Chat Room
      const chatRef = doc(db, "chats", chat.id);
      await updateDoc(chatRef, {
        lastMessage: {
          text: encrypted ? "🔐 [Encrypted Message]" : inputText.trim(),
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          timestamp: new Date()
        }
      });

      // Clear input fields
      setInputText("");
      setReplyingTo(null);
      
      // Notify update through sockets
      if (socket) {
        socket.emit("message-updated", { chatId: chat.id });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // Quick AI Assistant composer response helper
  const handleAiSmartDraft = async () => {
    if (messages.length === 0) return;
    setUploading(true);
    try {
      const recent = messages.slice(-5).map(m => ({
        senderName: m.senderName,
        text: decryptedMessages[m.id] || m.text
      }));

      const lastOpponentMsg = [...messages].reverse().find(m => m.senderId !== currentUser.uid);
      if (!lastOpponentMsg) {
        setUploading(false);
        return;
      }

      const res = await fetch("/api/ai/auto-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomingMessage: decryptedMessages[lastOpponentMsg.id] || lastOpponentMsg.text,
          recentMessages: recent,
          senderName: lastOpponentMsg.senderName,
          userProfile: currentUser
        })
      });

      const data = await res.json();
      if (data.reply) {
        setInputText(data.reply);
      }
    } catch (err) {
      console.error("AI Draft error:", err);
    } finally {
      setUploading(false);
    }
  };

  // Upload attachment file (converts to base64 and uploads to Express server)
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(",")[1];
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileData: base64Data
          })
        });

        if (!uploadRes.ok) throw new Error("Upload failed");
        const uploadData = await uploadRes.json();

        // Send message with file url
        let fileCategory = "file";
        if (file.type.startsWith("image/")) fileCategory = "image";
        else if (file.type.startsWith("video/")) fileCategory = "video";
        else if (file.type.startsWith("audio/")) fileCategory = "audio";

        const db = getDb();
        const messagesRef = collection(db, "chats", chat.id, "messages");
        
        const fileMessage = {
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          text: `Shared an attachment: ${file.name}`,
          type: fileCategory,
          fileUrl: uploadData.url,
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date(),
          readBy: [currentUser.uid],
          reactions: {}
        };

        await addDoc(messagesRef, fileMessage);

        const chatRef = doc(db, "chats", chat.id);
        await updateDoc(chatRef, {
          lastMessage: {
            text: `📎 Sent an ${fileCategory}`,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            timestamp: new Date()
          }
        });

        if (socket) {
          socket.emit("message-updated", { chatId: chat.id });
        }
      } catch (err) {
        console.error(err);
        alert("File size too large or upload server unavailable.");
      } finally {
        setUploading(false);
      }
    };
  };

  // Edit Message
  const handleSaveEdit = async () => {
    if (!editingMessage || !editText.trim()) return;
    const db = getDb();
    const msgDocRef = doc(db, "chats", chat.id, "messages", editingMessage.id);

    try {
      let finalPayload = editText.trim();
      if (editingMessage.encrypted) {
        finalPayload = await encryptText(finalPayload, roomPassword);
      }

      await updateDoc(msgDocRef, {
        text: finalPayload,
        edited: true
      });
      setEditingMessage(null);
      setEditText("");
      if (socket) socket.emit("message-updated", { chatId: chat.id });
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Message (soft delete)
  const handleDeleteMessage = async (msgId) => {
    const db = getDb();
    const msgDocRef = doc(db, "chats", chat.id, "messages", msgId);
    try {
      await updateDoc(msgDocRef, {
        text: "This message was deleted.",
        deleted: true
      });
      if (socket) socket.emit("message-updated", { chatId: chat.id });
    } catch (err) {
      console.error(err);
    }
  };

  // Add Message Reaction
  const handleAddReaction = async (msgId, emoji) => {
    const db = getDb();
    const msgDocRef = doc(db, "chats", chat.id, "messages", msgId);
    
    // Find message locally
    const msgObj = messages.find(m => m.id === msgId);
    if (!msgObj) return;

    const currentReactions = msgObj.reactions || {};
    const updatedReactions = { ...currentReactions, [currentUser.uid]: emoji };

    try {
      await updateDoc(msgDocRef, {
        reactions: updatedReactions
      });
      if (socket) socket.emit("message-updated", { chatId: chat.id });
    } catch (err) {
      console.error(err);
    }
  };

  // Setup E2EE Password locally for room
  const handleSetupRoomPassword = async () => {
    if (!pwdInput.trim()) return;
    setRoomPassword(pwdInput.trim());
    setShowPwdSetup(false);
    
    // Update chat model in firebase if user is an admin
    if (chat.admins?.includes(currentUser.uid)) {
      const db = getDb();
      const chatRef = doc(db, "chats", chat.id);
      await updateDoc(chatRef, { encryptionPassword: pwdInput.trim() });
    }
    setPwdInput("");
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const filteredMessagesList = messages.filter(m => {
    if (!messageSearchQuery.trim()) return true;
    const decText = decryptedMessages[m.id] || m.text;
    return decText.toLowerCase().includes(messageSearchQuery.toLowerCase()) || 
           m.senderName.toLowerCase().includes(messageSearchQuery.toLowerCase());
  });

  return (
    <div id="chat-workspace" className="flex-1 h-full bg-slate-950 flex flex-col relative text-slate-100 font-sans">
      
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Back to Chats"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div 
            onClick={() => {
              if (!chat.isGlobal && !chat.isGroup && otherUser && onViewUserProfile) {
                onViewUserProfile(otherUser);
              }
            }}
            className={`flex items-center gap-3 ${(!chat.isGlobal && !chat.isGroup && otherUser) ? "cursor-pointer hover:opacity-85 transition" : ""}`}
            title={(!chat.isGlobal && !chat.isGroup && otherUser) ? "View User Profile" : undefined}
          >
            <img 
              src={chatAvatar} 
              alt={chatName} 
              className="w-10 h-10 rounded-full object-cover border border-slate-800 shrink-0"
            />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                {chatName}
                {!chat.isGlobal && (
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" title="End-to-End Encrypted Active" />
                )}
              </h3>
              <p className="text-[11px] text-slate-400 leading-tight">
                {chat.isGlobal ? "Public square - chat with everyone!" : chat.isGroup ? `${chat.members.length} members` : "Direct Message Conversation"}
              </p>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Voice call */}
          {!chat.isGlobal && (
            <button
              onClick={() => onStartCall("audio")}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
              title="HD Voice Call"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}

          {/* Video call */}
          {!chat.isGlobal && (
            <button
              onClick={() => onStartCall("video")}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-500/10"
              title="HD Video Call"
            >
              <Video className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Embedded active calling session container */}
      {activeCallSession && activeCallSession.chatId === chat.id && (
        <div className="px-4 pt-3 shrink-0">
          <CallWindow
            chatId={activeCallSession.chatId}
            chatName={isIncomingCall ? activeCallSession.callerName : activeCallSession.receiverName}
            callType={activeCallSession.type}
            callerName={activeCallSession.callerName}
            isIncoming={isIncomingCall}
            onDecline={onDeclineCall}
            onAccept={onAcceptCall}
            onEndCall={onEndCall}
            socket={socket}
            remoteUserId={isIncomingCall ? activeCallSession.callerId : activeCallSession.receiverId}
            embedded={true}
          />
        </div>
      )}

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
        {filteredMessagesList.length === 0 ? (
          <div className="text-center text-slate-600 text-xs py-12 flex-1 flex flex-col justify-center items-center gap-2">
            <Unlock className="w-8 h-8 text-slate-800" />
            <span>This conversation is empty. Type a message below!</span>
          </div>
        ) : (
          filteredMessagesList.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            const decryptedText = decryptedMessages[msg.id] || msg.text;

            if (msg.type === "system") {
              return (
                <div key={msg.id} className="w-full flex justify-center my-1.5 animate-fadeIn">
                  <div className="bg-slate-900 border border-slate-800 text-slate-400 text-[10px] sm:text-xs font-semibold px-4 py-1.5 rounded-full shadow-inner flex items-center gap-1.5 max-w-[90%] break-words justify-center">
                    <span className="text-indigo-400">⚡</span>
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            // Resolve sender's photoURL and user object
            let senderAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(msg.senderName)}`;
            if (isMe) {
              senderAvatar = currentUser.photoURL || senderAvatar;
            } else {
              const u = allUsers.find(usr => usr.uid === msg.senderId);
              if (u?.photoURL) {
                senderAvatar = u.photoURL;
              }
            }

            const handleViewSenderProfile = () => {
              if (onViewUserProfile) {
                if (isMe) {
                  onViewUserProfile(currentUser);
                } else {
                  const u = allUsers.find(usr => usr.uid === msg.senderId);
                  if (u) {
                    onViewUserProfile(u);
                  }
                }
              }
            };

            return (
              <div 
                key={msg.id}
                className={`flex gap-3 max-w-[85%] group relative ${isMe ? "self-end flex-row-reverse" : "self-start flex-row"}`}
              >
                {/* Clickable Sender Avatar */}
                <img 
                  src={senderAvatar} 
                  alt={msg.senderName} 
                  onClick={handleViewSenderProfile}
                  className="w-7 h-7 rounded-full object-cover border border-slate-800 shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition shadow-sm"
                  title={`View profile of ${msg.senderName}`}
                />

                <div className={`flex flex-col relative ${isMe ? "items-end" : "items-start"}`}>
                  {/* Sender Name */}
                  {!isMe && (
                    <span 
                      onClick={handleViewSenderProfile}
                      className="text-[10px] text-slate-400 font-bold mb-1 ml-1 cursor-pointer hover:text-indigo-400 transition"
                      title="View Profile"
                    >
                      {msg.senderName}
                    </span>
                  )}

                  {/* Reply To Preview in bubble */}
                  {msg.replyTo && (
                    <div className="bg-slate-900/80 border-l-2 border-indigo-500 p-1.5 rounded-t-lg text-[10px] text-slate-400 mb-0.5 max-w-sm">
                      <strong className="block text-slate-300 font-bold">{msg.replyTo.senderName}</strong>
                      <span className="truncate block">{msg.replyTo.text}</span>
                    </div>
                  )}

                  {/* Main bubble */}
                  <div className={`p-3 rounded-xl shadow-md ${isMe ? "bg-indigo-600 rounded-tr-none text-white" : "bg-slate-900 rounded-tl-none text-slate-100"}`}>
                    
                    {/* Text or Rich Media attachments */}
                    {msg.type === "image" && msg.fileUrl ? (
                      <div className="space-y-1">
                        <img 
                          src={msg.fileUrl} 
                          alt={msg.fileName} 
                          className="max-h-60 rounded-lg cursor-pointer hover:opacity-90 object-contain"
                          onClick={() => setActiveLightboxImage(msg.fileUrl || null)}
                        />
                        <p className="text-[10px] opacity-75">{msg.fileName}</p>
                      </div>
                    ) : msg.type === "video" && msg.fileUrl ? (
                      <video controls src={msg.fileUrl} className="max-h-64 rounded-lg bg-black" />
                    ) : msg.type === "audio" && msg.fileUrl ? (
                      <div className="flex items-center gap-2.5 bg-slate-950/60 p-2 rounded-lg">
                        <Music className="w-4 h-4 text-indigo-400" />
                        <audio controls src={msg.fileUrl} className="w-48 h-8 rounded animate-none" />
                      </div>
                    ) : msg.type === "file" && msg.fileUrl ? (
                      <div className="flex items-center gap-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                        <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate text-slate-100">{msg.fileName}</p>
                          <p className="text-[10px] text-slate-400">{formatBytes(msg.fileSize)}</p>
                        </div>
                        <a 
                          href={msg.fileUrl} 
                          download={msg.fileName}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 transition shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      /* Plain or encrypted text */
                      <p className={`text-xs leading-relaxed whitespace-pre-wrap break-all ${msg.deleted ? "italic text-slate-400" : ""}`}>
                        {decryptedText}
                      </p>
                    )}

                    {/* Bubble details */}
                    <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[9px] opacity-70">
                      {msg.encrypted && !msg.deleted && <Lock className="w-2.5 h-2.5 text-emerald-400" title="End-to-End Encrypted" />}
                      {msg.edited && <span>(edited)</span>}
                      <span>
                        {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && (
                        <CheckCheck className={`w-3 h-3 ${msg.readBy.length > 1 ? "text-indigo-300" : "text-slate-400"}`} />
                      )}
                    </div>
                  </div>

                  {/* Reaction tags displayed on the bubble */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex items-center gap-1 mt-1 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded-full shadow-sm text-[10px] shrink-0">
                      {Object.entries(msg.reactions).map(([uid, emoji]) => (
                        <span key={uid} title={`Reacted by ${uid}`} className="cursor-default select-none">{emoji}</span>
                      ))}
                    </div>
                  )}

                  {/* Hover Action drawer for message reactions / edit / delete */}
                  {!msg.deleted && (
                    <div className={`absolute top-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded-lg shadow-lg z-20 transition-opacity ${isMe ? "-left-40" : "-right-40"}`}>
                      
                      {/* Emoticons */}
                      <div className="flex items-center gap-0.5 mr-2.5 border-r border-slate-800 pr-2">
                        {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleAddReaction(msg.id, emoji)}
                            className="hover:scale-125 transition text-xs font-sans"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      {/* Thread reply */}
                      <button
                        onClick={() => setReplyingTo(msg)}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                        title="Reply"
                      >
                        <Reply className="w-3 h-3" />
                      </button>

                      {/* Edit/Delete if owned */}
                      {isMe && msg.type === "text" && (
                        <button
                          onClick={() => { setEditingMessage(msg); setEditText(decryptedText); }}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                          title="Edit Message"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      {isMe && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 hover:bg-slate-800 text-rose-500 hover:bg-rose-950/20 rounded"
                          title="Delete Message"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Incoming typing indication */}
        {typingUserText && (
          <div className="self-start ml-2 text-[10px] text-indigo-400 flex items-center gap-2 animate-pulse leading-none shrink-0 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
            </span>
            <span>{typingUserText} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Preview bar above Input */}
      {replyingTo && (
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
            <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">
              Replying to <strong className="text-slate-300 font-semibold">{replyingTo.senderName}</strong>: {decryptedMessages[replyingTo.id] || replyingTo.text}
            </span>
          </div>
          <button 
            onClick={() => setReplyingTo(null)}
            className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editing Message Input overlay */}
      {editingMessage && (
        <div className="px-4 py-2 bg-indigo-950/40 border-t border-indigo-500/20 flex items-center justify-between shrink-0">
          <div className="flex-1 mr-4">
            <label className="block text-[9px] uppercase tracking-wider font-bold text-indigo-400 mb-1">Edit Message Mode</label>
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }}
            />
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => { setEditingMessage(null); setEditText(""); }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] rounded"
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveEdit}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded shadow-md shadow-indigo-500/15"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Input panel */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          
          {/* File Attachment selector */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
            title="Attach Document/Media"
          >
            <Paperclip className="w-4.5 h-4.5" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          />

          {/* Input textbox */}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={roomPassword ? "🔐 Send encrypted message..." : "Type your message..."}
              value={inputText}
              onChange={handleInputChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-4 pr-12 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            
            {/* AI Assistant Compose Assist */}
            <button
              type="button"
              onClick={handleAiSmartDraft}
              disabled={uploading || messages.length === 0}
              className="absolute right-2 top-2 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-30 rounded-lg transition"
              title="Compose draft via AI Auto-Response"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || uploading}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl shadow-lg shadow-indigo-500/10 transition shrink-0"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </form>
      </div>

      {/* IMAGE LIGHTBOX */}
      {activeLightboxImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <button 
            onClick={() => setActiveLightboxImage(null)}
            className="absolute top-4 right-4 p-2 bg-slate-900/60 text-white hover:bg-slate-800 rounded-full border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={activeLightboxImage} alt="Expanded preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}
