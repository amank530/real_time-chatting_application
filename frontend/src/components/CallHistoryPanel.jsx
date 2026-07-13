/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Phone, 
  Video, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed,
  Clock, 
  X, 
  Trash2, 
  User, 
  ChevronRight,
  Sparkles,
  Calendar
} from "lucide-react";
import { getDb } from "../lib/firebase.js";
import { collection, onSnapshot, query, where, deleteDoc, doc, writeBatch, getDocs } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";

export default function CallHistoryPanel({ currentUser, onClose, isFullView = false }) {
  const [callLogs, setCallLogs] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Sync users to map their real-time profile pictures and details
  useEffect(() => {
    const db = getDb();
    const usersRef = collection(db, "users");
    
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const map = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        map[data.uid] = data;
      });
      setUsersMap(map);
    }, (error) => {
      console.error("Failed to sync users for call history:", error);
    });

    return () => unsubscribe();
  }, []);

  // Sync call logs real-time for the current user
  useEffect(() => {
    const db = getDb();
    const callsRef = collection(db, "calls");
    
    const unsubscribe = onSnapshot(callsRef, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.callerId === currentUser.uid || data.receiverId === currentUser.uid) {
          list.push({ id: docSnap.id, ...data });
        }
      });

      // Sort by timestamp descending
      list.sort((a, b) => {
        const timeA = a.timestamp?.seconds || (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
        const timeB = b.timestamp?.seconds || (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
        return timeB - timeA;
      });

      setCallLogs(list);
      setLoading(false);
    }, (error) => {
      console.error("Failed to sync call logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Format call duration nicely
  const formatDuration = (seconds) => {
    if (seconds === undefined || seconds === null) return "0s";
    if (seconds <= 0) return "Missed";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Parse firebase timestamp to human readable date and clock time
  const formatDateTime = (timestamp) => {
    if (!timestamp) return { dateStr: "Recent", timeStr: "" };
    const dateObj = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    
    const dateStr = dateObj.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    
    const timeStr = dateObj.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return { dateStr, timeStr };
  };

  // Clear call logs for current user (locally / batch delete)
  const handleClearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear your call history log?")) return;
    try {
      const db = getDb();
      const batch = writeBatch(db);
      callLogs.forEach((log) => {
        const ref = doc(db, "calls", log.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to clear call history:", err);
    }
  };

  return (
    <motion.div
      initial={isFullView ? { opacity: 0 } : { x: "100%", opacity: 0.9 }}
      animate={{ x: 0, opacity: 1 }}
      exit={isFullView ? { opacity: 0 } : { x: "100%", opacity: 0.9 }}
      transition={{ type: "spring", damping: 25, stiffness: 220 }}
      className={isFullView 
        ? "flex-1 h-full bg-slate-950 flex flex-col relative overflow-hidden" 
        : "w-80 md:w-96 h-full bg-slate-900 border-l border-slate-800 flex flex-col relative shrink-0 z-40 overflow-hidden"
      }
    >
      {/* Header */}
      <div className={`bg-slate-950 border-b border-slate-800 flex items-center justify-between shadow-md shrink-0 ${isFullView ? "px-6 py-4 md:px-8" : "p-4"}`}>
        <div className={`flex items-center justify-between w-full ${isFullView ? "max-w-3xl mx-auto" : ""}`}>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Phone className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Call Logs</h3>
              <p className="text-[10px] text-slate-500">Video & Voice History</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {callLogs.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition"
                title="Clear Call History"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Close Panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main logs display */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-900/40">
        <div className={isFullView ? "max-w-3xl mx-auto w-full" : ""}>
          {loading ? (
            <div className="h-48 flex items-center justify-center flex-col text-slate-500 space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-[11px] tracking-widest uppercase">Fetching logs...</p>
            </div>
          ) : callLogs.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-12 h-12 bg-slate-800/80 rounded-2xl flex items-center justify-center text-slate-500 border border-slate-700/50">
                <PhoneMissed className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-300">No Call Logs</h4>
                <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed mx-auto">
                  No recent WebRTC voice or video streams detected.
                </p>
              </div>
            </div>
          ) : (
            <div className={isFullView ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-2"}>
              {callLogs.map((log) => {
                const isOutgoing = log.callerId === currentUser.uid;
                const otherUserId = isOutgoing ? log.receiverId : log.callerId;
                const otherUserObj = usersMap[otherUserId];
                
                const otherName = otherUserObj?.displayName || (isOutgoing ? log.receiverName : log.callerName) || "User";
                const photoURL = otherUserObj?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(otherName)}`;
                
                const { dateStr, timeStr } = formatDateTime(log.timestamp);
                const durationFormatted = formatDuration(log.duration);
                const isVideo = log.type === "video";

                // Icon & color styling for direction
                let directionIcon = null;
                let statusText = "";
                let badgeColor = "";

                if (isOutgoing) {
                  directionIcon = <PhoneOutgoing className="w-3.5 h-3.5 text-blue-400" />;
                  statusText = "Outgoing";
                  badgeColor = "text-blue-400 bg-blue-950/40 border-blue-900/30";
                } else {
                  if (log.duration === 0) {
                    directionIcon = <PhoneMissed className="w-3.5 h-3.5 text-rose-400 animate-pulse" />;
                    statusText = "Missed";
                    badgeColor = "text-rose-400 bg-rose-950/40 border-rose-900/30";
                  } else {
                    directionIcon = <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400" />;
                    statusText = "Incoming";
                    badgeColor = "text-emerald-400 bg-emerald-950/40 border-emerald-900/30";
                  }
                }

                return (
                  <motion.div
                    key={log.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-slate-950 hover:bg-slate-950/80 rounded-xl border border-slate-800/80 transition flex items-start gap-3 relative overflow-hidden group shadow-sm"
                  >
                    {/* Left: User Avatar */}
                    <div className="relative shrink-0">
                      <img 
                        src={photoURL} 
                        alt={otherName} 
                        className="w-10 h-10 rounded-full object-cover border border-slate-800"
                      />
                      <div className="absolute -bottom-1 -right-1 p-1 bg-slate-950 rounded-full border border-slate-800">
                        {isVideo ? (
                          <Video className="w-2.5 h-2.5 text-indigo-400" />
                        ) : (
                          <Phone className="w-2.5 h-2.5 text-emerald-400" />
                        )}
                      </div>
                    </div>

                    {/* Center: Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white truncate pr-1 group-hover:text-indigo-300 transition">
                          {otherName}
                        </h4>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${badgeColor} uppercase tracking-wider`}>
                          {log.type}
                        </span>
                      </div>

                      {/* Metadata line: Direction & Time */}
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="shrink-0 flex items-center justify-center">
                          {directionIcon}
                        </span>
                        <span className="font-semibold truncate">
                          {statusText}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="truncate flex items-center gap-1" title={timeStr}>
                          <Clock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                          {timeStr}
                        </span>
                      </div>

                      {/* Footer stats: Date & Duration */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[9px] text-slate-500">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar className="w-2.5 h-2.5" />
                          {dateStr}
                        </span>
                        <span className="font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850">
                          {durationFormatted}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer statistics badge */}
      <div className={`p-3 bg-slate-950 border-t border-slate-850 flex items-center justify-between text-[10px] text-slate-400 shrink-0 ${isFullView ? "md:px-8" : ""}`}>
        <div className={`flex items-center justify-between w-full ${isFullView ? "max-w-3xl mx-auto" : ""}`}>
          <span className="font-medium">Total logged sessions:</span>
          <span className="font-mono bg-indigo-950 text-indigo-300 border border-indigo-900/50 px-2 py-0.5 rounded-full font-bold">
            {callLogs.length}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
