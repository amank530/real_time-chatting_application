/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc 
} from "firebase/firestore";
import { getDb } from "../lib/firebase.js";
import { 
  MessageSquare, 
  Users, 
  Brain, 
  ShieldAlert, 
  Search, 
  Plus, 
  Settings, 
  LogOut, 
  Sparkles,
  Check,
  UserPlus,
  Moon,
  Sun,
  Lock,
  Smile,
  Circle,
  Phone,
  Video,
  AlertCircle
} from "lucide-react";

export default function Sidebar({
  currentUser,
  activeChat,
  onSelectChat,
  activeTab,
  setActiveTab,
  onLogout,
  typingUsers,
  onlineStatusList,
  showCallHistory,
  onToggleCallHistory,
  allUsers = [],
  onStartCall
}) {
  const [chats, setChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  
  // Create chat states
  const [selectedUserId, setSelectedUserId] = useState("");
  const [searchPhoneNumber, setSearchPhoneNumber] = useState("");
  const [foundUser, setFoundUser] = useState(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [groupPassword, setGroupPassword] = useState("");
  const [isEncryptedGroup, setIsEncryptedGroup] = useState(false);

  // Settings & Status states
  const [aiEnabled, setAiEnabled] = useState(currentUser.aiSettings?.autoReplyOn || false);
  const [aiMode, setAiMode] = useState(currentUser.aiSettings?.mode || "Away");
  const [customRule, setCustomRule] = useState(currentUser.aiSettings?.customRule || "");
  const [displayName, setDisplayName] = useState(currentUser.displayName || "");

  // Switch back to chats tab if AI is deactivated while on AI tab
  useEffect(() => {
    if (activeTab === "ai-assistant" && !currentUser.aiSettings?.autoReplyOn) {
      setActiveTab("chats");
    }
  }, [activeTab, currentUser.aiSettings?.autoReplyOn, setActiveTab]);

  // Fetch Chat rooms (personal only)
  useEffect(() => {
    const db = getDb();
    const chatsRef = collection(db, "chats");
    
    // Sub 1: Personal Chats
    const qPersonal = query(chatsRef, where("members", "array-contains", currentUser.uid));
    
    let personalChatsList = [];

    const handleUpdate = () => {
      // Sort by last message timestamp or creation
      const sorted = [...personalChatsList];
      sorted.sort((a, b) => {
        const timeA = a.lastMessage?.timestamp?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.lastMessage?.timestamp?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setChats(sorted);
    };

    const unsubPersonal = onSnapshot(qPersonal, (snapshot) => {
      personalChatsList = [];
      snapshot.forEach((doc) => {
        personalChatsList.push({ id: doc.id, ...doc.data() });
      });
      handleUpdate();
    }, (err) => {
      console.error("Personal chats sync error:", err);
    });

    return () => {
      unsubPersonal();
    };
  }, [currentUser.uid]);

  // Search User by Phone Number
  const handleSearchByPhone = (e) => {
    if (e) e.preventDefault();
    const queryStr = searchPhoneNumber.trim();
    if (!queryStr) {
      setFoundUser(null);
      setSearchPerformed(false);
      setSelectedUserId("");
      return;
    }

    const normalizePhone = (num) => {
      if (!num) return "";
      return num.replace(/\D/g, "");
    };

    const normQuery = normalizePhone(queryStr);

    const found = allUsers.find(user => {
      const dbPhone = user.phoneNumber || "";
      if (dbPhone.trim() === queryStr) return true;
      if (normQuery.length >= 7 && normalizePhone(dbPhone) === normQuery) return true;
      return false;
    });

    if (found) {
      setFoundUser(found);
      setSelectedUserId(found.uid);
    } else {
      setFoundUser(null);
      setSelectedUserId("");
    }
    setSearchPerformed(true);
  };

  // Create One-to-One DM
  const handleCreateDM = async (startCallType = null) => {
    if (!selectedUserId) return;
    const db = getDb();
    let chatRoom = null;

    // Check if DM room already exists
    const existing = chats.find(c => !c.isGroup && c.members.includes(selectedUserId) && c.members.includes(currentUser.uid));
    if (existing) {
      chatRoom = existing;
      onSelectChat(existing);
      setShowNewChatModal(false);
      setSelectedUserId("");
    } else {
      const targetUser = allUsers.find(u => u.uid === selectedUserId);
      const roomName = targetUser ? targetUser.displayName : "Direct Chat";
      const roomAvatar = targetUser ? targetUser.photoURL : "";

      const newChat = {
        isGroup: false,
        members: [currentUser.uid, selectedUserId],
        createdAt: new Date(),
        lastMessage: {
          text: "Started a secure direct chat.",
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          timestamp: new Date()
        }
      };

      try {
        const chatDoc = await addDoc(collection(db, "chats"), newChat);
        chatRoom = { id: chatDoc.id, ...newChat };
        onSelectChat(chatRoom);
        setShowNewChatModal(false);
        setSelectedUserId("");
      } catch (err) {
        console.error("Failed to create DM:", err);
        return;
      }
    }

    if (startCallType && onStartCall && chatRoom) {
      onStartCall(startCallType, chatRoom);
    }
  };

  // Create Multi-User Group
  const handleCreateGroup = async () => {
    if (!groupName || selectedGroupMembers.length === 0) return;
    const db = getDb();

    const newChat = {
      name: groupName,
      isGroup: true,
      members: [currentUser.uid, ...selectedGroupMembers],
      admins: [currentUser.uid],
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupName)}`,
      createdAt: new Date(),
      lastMessage: {
        text: `Created group chat "${groupName}"`,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        timestamp: new Date()
      },
      encryptionPassword: isEncryptedGroup && groupPassword ? groupPassword : undefined
    };

    try {
      const chatDoc = await addDoc(collection(db, "chats"), newChat);
      onSelectChat({ id: chatDoc.id, ...newChat });
      setShowNewGroupModal(false);
      setGroupName("");
      setSelectedGroupMembers([]);
      setGroupPassword("");
      setIsEncryptedGroup(false);
    } catch (err) {
      console.error("Failed to create Group:", err);
    }
  };

  // Update Settings in Firestore
  const handleSaveSettings = async () => {
    const db = getDb();
    const userRef = doc(db, "users", currentUser.uid);
    try {
      const updatedSettings = {
        displayName: displayName,
        aiSettings: {
          enabled: aiEnabled,
          mode: aiMode,
          customRule: customRule,
          autoReplyOn: aiEnabled
        }
      };
      await updateDoc(userRef, updatedSettings);
      
      // Update local state by muting modal
      currentUser.displayName = displayName;
      currentUser.aiSettings = updatedSettings.aiSettings;
      
      setShowSettingsModal(false);
    } catch (err) {
      console.error("Failed to update user profile settings:", err);
    }
  };

  const getStatusColor = (uid) => {
    const socketUser = onlineStatusList.find(u => u.userId === uid);
    if (socketUser?.online) return "bg-green-500 border-slate-900";
    return "bg-slate-500 border-slate-900";
  };

  const isUserOnline = (uid) => {
    return onlineStatusList.some(u => u.userId === uid && u.online);
  };

  // Filter chats by search query
  const filteredChats = chats.filter((c) => {
    if (c.isGroup) {
      return c.name?.toLowerCase().includes(searchQuery.toLowerCase());
    } else {
      // Find the other member's name
      const otherId = c.members.find(m => m !== currentUser.uid);
      const otherUser = allUsers.find(u => u.uid === otherId);
      const chatName = otherUser ? otherUser.displayName : "Secure Room";
      return chatName.toLowerCase().includes(searchQuery.toLowerCase()) || 
             c.lastMessage?.text?.toLowerCase().includes(searchQuery.toLowerCase());
    }
  });

  return (
    <div id="app-sidebar" className="w-80 h-full bg-slate-900 flex flex-col border-r border-slate-800 text-slate-100 shrink-0 font-sans">
      
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-md shadow-indigo-500/10">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="font-sans font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            Chatify
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={onToggleCallHistory}
            className={`p-1.5 rounded-lg transition ${showCallHistory ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            title="Call History"
          >
            <Phone className={`w-4 h-4 ${showCallHistory ? "text-white" : "text-indigo-400 hover:text-indigo-300"}`} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      {(() => {
        const showActiveAi = !!currentUser.aiSettings?.autoReplyOn;
        const showAdmin = currentUser.role === "admin";
        let cols = 0;
        if (showActiveAi) cols++;
        if (showAdmin) cols++;
        
        if (cols === 0) return null;
        
        const gridColsClass = cols === 2 ? "grid-cols-2" : "grid-cols-1";
        
        return (
          <div className={`grid ${gridColsClass} bg-slate-950 p-1 m-3 rounded-lg border border-slate-800/80 animate-none`}>
            {showActiveAi && (
              <button
                onClick={() => setActiveTab("ai-assistant")}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-md text-xs font-semibold transition ${activeTab === "ai-assistant" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                <Brain className="w-4 h-4 text-indigo-400" />
                Active AI
              </button>
            )}
            
            {showAdmin && (
              <button
                onClick={() => setActiveTab("admin")}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-md text-xs font-semibold transition ${activeTab === "admin" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                <ShieldAlert className="w-4 h-4" />
                Admin
              </button>
            )}
          </div>
        );
      })()}

      {/* Main Tab Content inside Sidebar */}
      {activeTab === "chats" ? (
        <>
          
          {/* Chat Controls */}
          <div className="px-3 mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            
            {/* Quick Action Buttons */}
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-indigo-400 hover:text-white transition"
              title="New DM Chat"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowNewGroupModal(true)}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white transition"
              title="New Group Chat"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>

          {/* Active AI Auto-Reply Banner */}
          {currentUser.aiSettings?.autoReplyOn && (
            <div className="mx-3 mb-3 bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/30 p-2.5 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">AI Auto-Reply Active</p>
                  <p className="text-[10px] text-slate-400 truncate">Responding in &quot;{currentUser.aiSettings.mode}&quot; mode</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="p-1 text-indigo-400 hover:text-white hover:bg-indigo-900/40 rounded transition shrink-0"
                  title="Configure AI Auto-Reply"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-ping shrink-0" />
              </div>
            </div>
          )}

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {filteredChats.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No conversations found. Create one now!
              </div>
            ) : (
              filteredChats.map((room) => {
                const isSelected = activeChat?.id === room.id;
                
                // Retrieve room's visuals
                let name = room.name || "Secure Room";
                let avatar = room.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`;
                let isOnline = false;

                if (!room.isGroup) {
                  const otherId = room.members.find(m => m !== currentUser.uid);
                  // Find user locally if possible, or load online status from Socket list
                  isOnline = otherId ? isUserOnline(otherId) : false;
                  
                  // Try to find full user name
                  const otherUserInfo = allUsers.find(u => u.uid === otherId);
                  if (otherUserInfo) {
                    name = otherUserInfo.displayName;
                    avatar = otherUserInfo.photoURL;
                  }
                }

                // Check typing state
                const typingText = typingUsers[room.id];

                return (
                  <button
                    key={room.id}
                    onClick={() => onSelectChat(room)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition ${isSelected ? "bg-indigo-600/90 text-white" : "hover:bg-slate-800/60"}`}
                  >
                    <div className="relative shrink-0">
                      <img src={avatar} alt={name} className="w-10 h-10 rounded-full object-cover border border-slate-700" />
                      {!room.isGroup && (
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${isOnline ? "bg-green-500 border-slate-900" : "bg-slate-500 border-slate-900"}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-bold truncate flex items-center gap-1.5">
                          {room.encryptionPassword && (
                            <Lock className="w-3 h-3 text-emerald-400 shrink-0" title="End-to-End Encrypted" />
                          )}
                          {name}
                        </span>
                        {room.lastMessage?.timestamp && (
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                            {new Date(room.lastMessage.timestamp?.seconds * 1000 || room.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      
                      {typingText ? (
                        <p className="text-[11px] text-emerald-400 font-medium truncate animate-pulse">
                          {typingText}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 truncate leading-tight">
                          <strong className="font-semibold text-slate-300">{room.lastMessage?.senderId === currentUser.uid ? "You: " : `${room.lastMessage?.senderName || ""}: `}</strong>
                          {room.lastMessage?.text}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : activeTab === "ai-assistant" ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Brain className="w-12 h-12 text-indigo-400 mb-3 animate-none" />
          <h3 className="font-bold text-sm text-white mb-1">Personal AI Active</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
            Toggle the full-screen view using the navigation tabs inside the main area to configure notes, tasks, events, and routine reminders!
          </p>
          <div className="space-y-2 w-full">
            <button
              onClick={() => setActiveTab("ai-assistant")}
              className="w-full bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs py-2 rounded-lg transition font-medium"
            >
              Launch Assistant Console
            </button>
            <button
              onClick={() => setActiveTab("chats")}
              className="w-full bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs py-2 rounded-lg transition font-semibold border border-indigo-500/20"
            >
              ← Back to Chats
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-rose-400 mb-3 animate-pulse" />
          <h3 className="font-bold text-sm text-white mb-1">Admin Dashboard Mode</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
            Staff access enabled. Head over to the central dashboard to manage users, inspect audit logs, and moderate messages.
          </p>
          <button
            onClick={() => setActiveTab("chats")}
            className="w-full bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 text-xs py-2 rounded-lg transition font-semibold border border-rose-800/30"
          >
            ← Back to Chats
          </button>
        </div>
      )}

      {/* User Profile Footer */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-9 h-9 rounded-full object-cover border border-slate-700" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border border-slate-900" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white truncate">{currentUser.displayName}</h4>
            <div className="flex items-center gap-1">
              {currentUser.aiSettings?.autoReplyOn ? (
                <>
                  <Circle className="w-1.5 h-1.5 fill-indigo-400 text-indigo-400 shrink-0 animate-pulse" />
                  <p className="text-[10px] text-indigo-400 font-bold truncate uppercase tracking-wider">AI Active</p>
                </>
              ) : (
                <>
                  <Circle className="w-1.5 h-1.5 fill-slate-500 text-slate-500 shrink-0" />
                  <p className="text-[10px] text-slate-500 font-medium truncate uppercase tracking-wider">AI Inactive</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition"
            title="Profile & Status"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onLogout}
            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-md transition"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MODAL: New Direct Chat */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-none">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              Add Contact for Chatting
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter the phone number of the person you want to chat with. The system will search for any registered account with that number.
            </p>

            {/* Phone Lookup Input */}
            <form onSubmit={handleSearchByPhone} className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g. +919876543210, 5551234567"
                  value={searchPhoneNumber}
                  onChange={(e) => {
                    setSearchPhoneNumber(e.target.value);
                    setSearchPerformed(false);
                    setFoundUser(null);
                    setSelectedUserId("");
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!searchPhoneNumber.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs px-4 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                Search
              </button>
            </form>

            {/* Search Results / Details Panel */}
            {searchPerformed && foundUser && (
              <div className="mb-6 p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex flex-col gap-3 animate-none">
                <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Account Available!
                </div>
                <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700">
                  <img src={foundUser.photoURL} alt={foundUser.displayName} className="w-12 h-12 rounded-full object-cover border border-slate-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{foundUser.displayName}</p>
                    <p className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-indigo-400" />
                      {foundUser.phoneNumber}
                    </p>
                    {foundUser.role === "admin" && (
                      <span className="inline-block mt-1 text-[9px] bg-rose-950/60 text-rose-300 border border-rose-500/20 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                        Staff
                      </span>
                    )}
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    onClick={() => handleCreateDM()}
                    className="flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] py-2 px-1.5 rounded-lg transition shadow cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chat
                  </button>
                  <button
                    onClick={() => handleCreateDM("audio")}
                    className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] py-2 px-1.5 rounded-lg transition shadow cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Voice
                  </button>
                  <button
                    onClick={() => handleCreateDM("video")}
                    className="flex items-center justify-center gap-1 bg-violet-600 hover:bg-violet-500 text-white font-bold text-[11px] py-2 px-1.5 rounded-lg transition shadow cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Video
                  </button>
                </div>
              </div>
            )}

            {searchPerformed && !foundUser && (
              <div className="mb-6 p-4 bg-rose-950/30 border border-rose-500/20 rounded-xl flex flex-col gap-2 animate-none">
                <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  Account Not Available
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  No registered user was found with the phone number <span className="font-mono text-slate-200">"{searchPhoneNumber}"</span>. Please make sure the number is typed correctly.
                </p>
              </div>
            )}

            {!searchPerformed && (
              <div className="mb-6 py-6 text-center text-slate-500 text-xs border border-dashed border-slate-700/60 rounded-xl bg-slate-900/30">
                Type a user's phone number above and click search.
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => { 
                  setShowNewChatModal(false); 
                  setSelectedUserId(""); 
                  setSearchPhoneNumber("");
                  setFoundUser(null);
                  setSearchPerformed(false);
                }}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs py-2.5 rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: New Group Chat */}
      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-none">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Create a Group Room
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g., Engineering Team, Family"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Encryption Toggle */}
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    End-to-End Encryption
                  </span>
                  <input
                    type="checkbox"
                    checked={isEncryptedGroup}
                    onChange={(e) => setIsEncryptedGroup(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800"
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal mb-2">
                  When enabled, all message payloads in this room will be AES-GCM encrypted and decrypted 100% on users&apos; clients using a secret passcode.
                </p>
                {isEncryptedGroup && (
                  <input
                    type="password"
                    placeholder="Set Group Secure Passcode"
                    value={groupPassword}
                    onChange={(e) => setGroupPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white placeholder-slate-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">Select Members</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto bg-slate-900 p-2.5 rounded-lg border border-slate-700">
                  {allUsers.length === 0 ? (
                    <div className="text-center py-2 text-slate-500 text-xs">No users to add.</div>
                  ) : (
                    allUsers.map((user) => {
                      const isSelected = selectedGroupMembers.includes(user.uid);
                      return (
                        <button
                          key={user.uid}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedGroupMembers(selectedGroupMembers.filter(id => id !== user.uid));
                            } else {
                              setSelectedGroupMembers([...selectedGroupMembers, user.uid]);
                            }
                          }}
                          className={`w-full flex items-center justify-between p-1.5 rounded text-xs text-left transition ${isSelected ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40" : "hover:bg-slate-800 border border-transparent"}`}
                        >
                          <div className="flex items-center gap-2">
                            <img src={user.photoURL} alt={user.displayName} className="w-6 h-6 rounded-full object-cover" />
                            <span className="font-medium">{user.displayName}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNewGroupModal(false);
                  setGroupName("");
                  setSelectedGroupMembers([]);
                  setGroupPassword("");
                  setIsEncryptedGroup(false);
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs py-2.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName || selectedGroupMembers.length === 0 || (isEncryptedGroup && !groupPassword)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs py-2.5 rounded-lg"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Settings & Status */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-none">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl text-slate-100">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-700 pb-3">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">AI Settings & Chat Presence</h3>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* AI Auto-Reply Toggles */}
              <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">AI Auto-Reply Assistant</h4>
                    <p className="text-[10px] text-slate-400">Generate context-aware automated smart replies when messaged.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800"
                  />
                </div>

                {aiEnabled && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Status Mode</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {["Away", "Working", "Sleeping", "Custom"].map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setAiMode(mode)}
                            className={`py-1.5 rounded text-xs font-semibold border transition ${aiMode === mode ? "bg-indigo-600 text-white border-indigo-400" : "bg-slate-950 hover:bg-slate-900 text-slate-400 border-slate-800"}`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custom Reply Behavior / Instructions</label>
                      <textarea
                        rows={2}
                        placeholder={aiMode === "Custom" ? "Instruct your AI reply (e.g. 'Away climbing, back by noon.')" : `Auto-responding with ${aiMode} mode standard.`}
                        value={customRule}
                        onChange={(e) => setCustomRule(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs py-2.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 rounded-lg"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
