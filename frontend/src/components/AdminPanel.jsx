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
  onSnapshot, 
  deleteDoc 
} from "firebase/firestore";
import { getDb } from "../lib/firebase.js";
import { 
  ShieldAlert, 
  Users, 
  MessageSquare, 
  VolumeX, 
  Ban, 
  Check, 
  Trash2, 
  Search, 
  AlertTriangle,
  Flame,
  ArrowLeft,
  Lock,
  ShieldCheck,
  X,
  Key
} from "lucide-react";

export default function AdminPanel({ onBack }) {
  // Database state
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditMessages, setAuditMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // JWT Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(true);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  // Detailed account view state
  const [selectedUser, setSelectedUser] = useState(null);

  // 1. Verify existing JWT on mount
  useEffect(() => {
    const checkToken = async () => {
      const token = sessionStorage.getItem("chatify_admin_jwt");
      if (!token) {
        setVerifyingToken(false);
        setIsAuthenticated(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ token })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem("chatify_admin_jwt");
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error("JWT Verification error:", err);
        setIsAuthenticated(false);
      } finally {
        setVerifyingToken(false);
      }
    };

    checkToken();
  }, []);

  // 2. Stream user profiles from Firestore
  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [isAuthenticated]);

  // 3. Stream chats and messages
  useEffect(() => {
    if (!isAuthenticated) return;

    const db = getDb();
    const q = collection(db, "chats");
    
    const unsubscribe = onSnapshot(q, async (roomsSnapshot) => {
      const rooms = [];
      roomsSnapshot.forEach((doc) => {
        rooms.push({ id: doc.id, ...doc.data() });
      });
      setChats(rooms);

      const auditList = [];
      for (const room of rooms) {
        try {
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
        } catch (msgErr) {
          console.warn(`Could not read messages for room ${room.id}:`, msgErr);
        }
      }
      
      auditList.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
      setAuditMessages(auditList);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Handle Admin Credentials Login & JWT generation
  const handleAdminLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError("");
    setAuthenticating(true);
    
    if (!adminUsername || !adminPassword) {
      setAuthError("Username and password are required.");
      setAuthenticating(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        sessionStorage.setItem("chatify_admin_jwt", data.token);
        setIsAuthenticated(true);
      } else {
        setAuthError(data.error || "Authentication failed. Incorrect admin credentials.");
      }
    } catch (err) {
      console.error("Admin login failed:", err);
      setAuthError("Could not connect to the system validation server.");
    } finally {
      setAuthenticating(false);
    }
  };

  // Toggle user mute state
  const handleToggleMute = async (user) => {
    const db = getDb();
    const userRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userRef, {
        muted: !user.muted
      });
    } catch (err) {
      console.error("Mute toggle failed:", err);
    }
  };

  // Toggle user blocked/active state
  const handleToggleBlock = async (user) => {
    const db = getDb();
    const userRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userRef, {
        blocked: !user.blocked
      });
    } catch (err) {
      console.error("Block status toggle failed:", err);
    }
  };

  // Delete user profile document permanently
  const handleDeleteUser = async (user) => {
    const db = getDb();
    try {
      await deleteDoc(doc(db, "users", user.uid));
      setSelectedUser(null);
    } catch (err) {
      console.error("Failed to delete user profile:", err);
    }
  };

  // Moderate/Delete chat message
  const handleModerateDelete = async (chatId, messageId) => {
    const db = getDb();
    try {
      const msgDocRef = doc(db, "chats", chatId, "messages", messageId);
      await updateDoc(msgDocRef, {
        text: "[This message was deleted by Admin Content Moderation]",
        deleted: true
      });
    } catch (err) {
      console.error("Moderation delete error:", err);
    }
  };

  const filteredUsers = users.filter((u) => 
    (u.displayName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.phoneNumber || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render Loader if checking JWT
  if (verifyingToken) {
    return (
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center text-slate-200">
        <div className="p-4 bg-rose-600 rounded-2xl shadow-xl shadow-rose-500/10 mb-4 animate-bounce">
          <Lock className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm font-bold tracking-widest text-slate-400 uppercase animate-pulse">
          Validating Security Token...
        </p>
      </div>
    );
  }

  // Render JWT Authenticator Lock Screen
  if (!isAuthenticated) {
    return (
      <div className="flex-1 h-full bg-slate-950 flex items-center justify-center p-4 sm:p-6 select-none font-sans relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(244,63,94,0.1),rgba(255,255,255,0))]" />
        
        <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="p-4 bg-gradient-to-tr from-rose-600 to-amber-600 rounded-2xl text-white shadow-lg shadow-rose-500/20">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight uppercase">System Access Gated</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Content moderation and audit tools require validated staff JWT credentials.
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            {authError && (
              <div className="bg-rose-950/40 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <p>{authError}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Staff Account Username
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g., admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Security Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  placeholder="e.g., admin123"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authenticating}
              className="w-full bg-rose-600 hover:bg-rose-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs py-3 rounded-xl transition shadow-lg shadow-rose-500/10 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {authenticating ? "Validating Credentials..." : "Authenticate JWT Session"}
            </button>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-full bg-slate-800 hover:bg-slate-755 text-slate-300 font-semibold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel & Exit
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // Render Full Admin Panel View
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
                JWT SECURED STAFF
              </span>
            </h1>
            <p className="text-xs text-slate-400">Perform user moderation, inspect conversations, delete users, and view active database statistics.</p>
          </div>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem("chatify_admin_jwt");
            setIsAuthenticated(false);
          }}
          className="bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60 font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer self-start md:self-auto"
        >
          Revoke JWT Session
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between col-span-1 md:col-span-1">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total Registered Users</p>
            <h3 className="text-2xl font-black text-white">{users.length}</h3>
          </div>
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="w-full">
        
        {/* User Accounts Management panel */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 flex flex-col h-[520px]">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Registered Accounts
              <span className="text-[10px] text-slate-400 font-mono">({users.length})</span>
            </h3>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Find by name/number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-8 pr-3 text-[11px] text-white focus:outline-none focus:border-rose-500"
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
                  onClick={() => setSelectedUser(user)}
                  className="bg-slate-950 border border-slate-850 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:border-rose-500/30 transition hover:bg-slate-900/40"
                  title="Click to manage account details"
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
                      <p className="text-[10px] text-slate-400 truncate">{user.phoneNumber || "Guest Account"}</p>
                    </div>
                  </div>

                  {user.role !== "admin" ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${user.online ? "bg-green-500" : "bg-slate-600"}`} />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 px-1 py-0.5">Details</span>
                    </div>
                  ) : (
                    <span className="text-[9px] text-rose-400 bg-rose-500/5 px-2 py-0.5 rounded-md border border-rose-500/10 font-bold uppercase shrink-0">Root</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* User Details Slide Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6 text-slate-100 relative">
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="relative">
                <img 
                  src={selectedUser.photoURL || "https://api.dicebear.com/7.x/pixel-art/svg?seed=fallback"} 
                  alt={selectedUser.displayName} 
                  className="w-24 h-24 rounded-full object-cover border-4 border-rose-500/20 shadow-xl" 
                />
                <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${selectedUser.online ? "bg-green-500" : "bg-slate-500"}`} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                  {selectedUser.displayName}
                  {selectedUser.role === "admin" && (
                    <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-bold px-2 py-0.5 rounded font-sans uppercase">Admin</span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-1">{selectedUser.phoneNumber || "Verified Guest"}</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                <span className="text-slate-400 font-medium">Account ID</span>
                <span className="font-mono text-[10px] text-slate-300 select-all">{selectedUser.uid}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                <span className="text-slate-400 font-medium">Presence Status</span>
                <span className={`font-bold uppercase tracking-wider text-[10px] ${selectedUser.online ? "text-green-400" : "text-slate-400"}`}>
                  {selectedUser.online ? "Online / Active" : "Offline / Idle"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                <span className="text-slate-400 font-medium">Moderation Status</span>
                <span className={`font-bold uppercase tracking-wider text-[10px] ${selectedUser.blocked ? "text-rose-400" : "text-emerald-400"}`}>
                  {selectedUser.blocked ? "Inactive / Suspended" : "Active / Verified"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Muted Status</span>
                <span className={`font-bold uppercase tracking-wider text-[10px] ${selectedUser.muted ? "text-amber-400" : "text-slate-400"}`}>
                  {selectedUser.muted ? "Muted" : "Active Sound"}
                </span>
              </div>
            </div>

            {selectedUser.role !== "admin" && (
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                
                {/* Active/Inactive block toggle */}
                <button
                  onClick={async () => {
                    await handleToggleBlock(selectedUser);
                    setSelectedUser(prev => ({ ...prev, blocked: !prev.blocked }));
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs border transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${selectedUser.blocked ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-950/60" : "bg-rose-950/40 text-rose-400 border-rose-500/30 hover:bg-rose-950/60"}`}
                >
                  <Ban className="w-4 h-4" />
                  {selectedUser.blocked ? "Make Active" : "Make Inactive"}
                </button>

                {/* Mute/Unmute toggle */}
                <button
                  onClick={async () => {
                    await handleToggleMute(selectedUser);
                    setSelectedUser(prev => ({ ...prev, muted: !prev.muted }));
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs border transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${selectedUser.muted ? "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-900" : "bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-950/60"}`}
                >
                  <VolumeX className="w-4 h-4" />
                  {selectedUser.muted ? "Unmute" : "Mute"}
                </button>

                {/* Delete button */}
                <button
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to permanently delete user ${selectedUser.displayName}? This action cannot be undone.`)) {
                      await handleDeleteUser(selectedUser);
                    }
                  }}
                  className="py-2 px-3 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-500 text-white transition flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </div>
            )}

            <button
              onClick={() => setSelectedUser(null)}
              className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
            >
              Close Profile Details
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
