/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  deleteDoc 
} from "firebase/firestore";
import { getDb } from "../lib/firebase.js";
import { 
  ShieldAlert, 
  Users, 
  MessageSquare, 
  PhoneCall, 
  VolumeX, 
  Ban, 
  Check, 
  Trash2, 
  Search, 
  AlertTriangle,
  Flame,
  ArrowLeft
} from "lucide-react";

export default function AdminPanel({ onBack }) {
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditMessages, setAuditMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync users
  useEffect(() => {
    const db = getDb();
    const q = collection(db, "users");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() });
      });
      setUsers(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync rooms & aggregate messages for audit
  useEffect(() => {
    const db = getDb();
    const q = collection(db, "chats");
    
    const unsubscribe = onSnapshot(q, async (roomsSnapshot) => {
      const rooms = [];
      roomsSnapshot.forEach((doc) => {
        rooms.push({ id: doc.id, ...doc.data() });
      });
      setChats(rooms);

      // Aggregate all recent messages across all rooms for audit logs
      const auditList = [];
      for (const room of rooms) {
        const msgsSnap = await getDocs(collection(db, "chats", room.id, "messages"));
        msgsSnap.forEach((mDoc) => {
          const m = mDoc.data();
          auditList.push({
            ...m,
            id: mDoc.id,
            chatId: room.id,
            roomName: room.name || `DM Chat (${room.members.length} members)`
          });
        });
      }
      // Sort newer messages first
      auditList.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
      setAuditMessages(auditList);
    });

    return () => unsubscribe();
  }, []);

  // Toggle user mute state
  const handleToggleMute = async (user) => {
    const db = getDb();
    const userRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userRef, {
        muted: !user.muted
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle user block state
  const handleToggleBlock = async (user) => {
    const db = getDb();
    const userRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userRef, {
        blocked: !user.blocked
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Moderate & Delete message from Admin Dashboard
  const handleModerateDelete = async (chatId, messageId) => {
    const db = getDb();
    try {
      // Soft delete showing moderated message text
      const msgDocRef = doc(db, "chats", chatId, "messages", messageId);
      await updateDoc(msgDocRef, {
        text: "[This message was deleted by Admin Content Moderation]",
        deleted: true
      });
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter((u) => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="admin-dashboard-container" className="flex-1 h-full bg-slate-950 p-6 overflow-y-auto text-slate-100">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border border-rose-500/20 p-6 rounded-2xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-rose-500/[0.02]">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition mr-2 cursor-pointer"
              title="Back to Chats"
            >
              <ArrowLeft className="w-5 h-5 text-rose-400" />
            </button>
          )}
          <div className="p-3 bg-rose-600 rounded-xl shadow-lg shadow-rose-500/20 animate-pulse">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
              System Administration
              <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold tracking-widest px-1.5 py-0.5 rounded">
                Root Staff
              </span>
            </h1>
            <p className="text-xs text-slate-400">Perform user moderation, inspect encrypted and plain conversations, and view active database statistics.</p>
          </div>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total Users</p>
            <h3 className="text-2xl font-black text-white">{users.length}</h3>
          </div>
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
        </div>
        
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total Chats</p>
            <h3 className="text-2xl font-black text-white">{chats.length}</h3>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total Messages</p>
            <h3 className="text-2xl font-black text-white">{auditMessages.length}</h3>
          </div>
          <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* User Accounts Management panel */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Registered Accounts
              <span className="text-[10px] text-slate-400 font-mono">({users.length})</span>
            </h3>
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Find users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 pl-8 pr-3 text-[11px] text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">No matching accounts found.</div>
            ) : (
              filteredUsers.map((user) => (
                <div 
                  key={user.uid}
                  className="bg-slate-950 border border-slate-850 p-3 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={user.photoURL} alt={user.displayName} className="w-8.5 h-8.5 rounded-full object-cover border border-slate-800" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                        {user.displayName}
                        {user.role === "admin" && (
                          <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[8px] font-bold px-1.5 py-0.2 rounded font-sans uppercase">Admin</span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                    </div>
                  </div>

                  {user.role !== "admin" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Mute toggle button */}
                      <button
                        onClick={() => handleToggleMute(user)}
                        className={`p-1.5 rounded-md border transition ${user.muted ? "bg-amber-950/40 text-amber-400 border-amber-500/30" : "bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border-transparent"}`}
                        title={user.muted ? "Unmute User" : "Mute User"}
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                      </button>

                      {/* Block toggle button */}
                      <button
                        onClick={() => handleToggleBlock(user)}
                        className={`p-1.5 rounded-md border transition ${user.blocked ? "bg-rose-950/40 text-rose-400 border-rose-500/30" : "bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border-transparent"}`}
                        title={user.blocked ? "Unblock User" : "Block User"}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Global Chat logs content moderator */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 flex flex-col h-[500px]">
          <div className="mb-4 shrink-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Chat Moderator Feed
              <span className="text-[10px] text-slate-400 font-mono">({auditMessages.length})</span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-1">Audit trail of recent conversation activity across all public and direct channels.</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {auditMessages.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">No chats logs present in the database.</div>
            ) : (
              auditMessages.map((msg) => (
                <div 
                  key={msg.id}
                  className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl space-y-2 relative"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-900 text-[9px] text-indigo-400 border border-slate-800 font-bold truncate max-w-[120px]">
                        {msg.roomName}
                      </span>
                      <span className="text-[10px] text-slate-300 font-bold">{msg.senderName}</span>
                    </div>
                    
                    {!msg.deleted && (
                      <button
                        onClick={() => handleModerateDelete(msg.chatId, msg.id)}
                        className="p-1 hover:bg-rose-950/20 text-slate-500 hover:text-rose-400 rounded transition"
                        title="Moderate Delete Message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className={`text-xs text-slate-300 break-all leading-normal ${msg.deleted ? "italic text-slate-500" : ""}`}>
                    {msg.encrypted && !msg.deleted ? "🔐 [Encrypted Message Content - Client Private]" : msg.text}
                  </p>

                  <div className="flex items-center justify-between text-[8px] text-slate-400">
                    <span className="font-mono">{msg.id}</span>
                    <span>
                      {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleString() : "just now"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
