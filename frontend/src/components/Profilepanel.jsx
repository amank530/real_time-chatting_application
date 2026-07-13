/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  User, 
  FileText, 
  Upload, 
  Share2, 
  Calendar, 
  Clock, 
  Settings, 
  Shield, 
  HardDrive, 
  CheckCircle2, 
  Trash2, 
  Smartphone,
  Eye,
  AlertCircle,
  FolderOpen
} from "lucide-react";
import { getDb } from "../lib/firebase.js";
import { collection, onSnapshot, query, where, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";

export default function ProfilePanel({ currentUser, onBack }) {
  const [chats, setChats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit profile state
  const [displayName, setDisplayName] = useState(currentUser.displayName || "");
  const [photoURL, setPhotoURL] = useState(currentUser.photoURL || "");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  // Document upload states
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [targetChatId, setTargetChatId] = useState("");
  const [documentSuccessMsg, setDocumentSuccessMsg] = useState("");
  const [documentErrorMsg, setDocumentErrorMsg] = useState("");

  // Sync users and chats for dynamic selectors
  useEffect(() => {
    const db = getDb();
    
    // 1. Sync User list
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const uList = [];
      snap.forEach((d) => uList.push(d.data()));
      setAllUsers(uList);
    });

    // 2. Sync Chat rooms
    const qChats = query(collection(db, "chats"), where("members", "array-contains", currentUser.uid));
    const unsubChats = onSnapshot(qChats, (snap) => {
      const cList = [];
      snap.forEach((d) => {
        cList.push({ id: d.id, ...d.data() });
      });
      setChats(cList);
      if (cList.length > 0 && !targetChatId) {
        setTargetChatId(cList[0].id);
      }
    });

    // 3. Sync User's personal uploaded documents logs from Firestore
    // This provides durability and tracks what was shared by whom.
    const qDocs = query(collection(db, "user_documents"), where("uploadedBy", "==", currentUser.uid));
    const unsubDocs = onSnapshot(qDocs, (snap) => {
      const dList = [];
      snap.forEach((d) => {
        dList.push({ id: d.id, ...d.data() });
      });
      // Sort newest first
      dList.sort((a, b) => {
        const timeA = a.timestamp?.seconds || (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
        const timeB = b.timestamp?.seconds || (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
        return timeB - timeA;
      });
      setDocuments(dList);
      setLoading(false);
    }, (error) => {
      console.error("Failed to sync personal documents:", error);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubChats();
      unsubDocs();
    };
  }, [currentUser.uid]);

  // Handle Drag Events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Upload document through custom /api/upload API and record in user_documents
  const handleUploadDocument = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile) return;

    setUploadingDoc(true);
    setDocumentSuccessMsg("");
    setDocumentErrorMsg("");

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(",")[1];
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileType: selectedFile.type,
            fileData: base64Data
          })
        });

        if (!res.ok) throw new Error("Server rejected document upload.");
        const uploadResult = await res.json();

        // Register document log in Firestore
        const db = getDb();
        await addDoc(collection(db, "user_documents"), {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
          url: uploadResult.url,
          uploadedBy: currentUser.uid,
          uploadedByName: currentUser.displayName,
          timestamp: new Date()
        });

        setDocumentSuccessMsg(`Successfully uploaded "${selectedFile.name}" to cloud storage.`);
        setSelectedFile(null);
      } catch (err) {
        console.error("Document upload failed:", err);
        setDocumentErrorMsg(err.message || "Upload size limit exceeded or connection lost.");
      } finally {
        setUploadingDoc(false);
      }
    };
  };

  // Share an already uploaded document directly to a chosen Chat Room
  const handleShareDocumentToChat = async (docObj) => {
    if (!targetChatId) {
      alert("Please select a target conversation room from the dropdown list.");
      return;
    }

    try {
      const db = getDb();
      let fileCategory = "file";
      if (docObj.type.startsWith("image/")) fileCategory = "image";
      else if (docObj.type.startsWith("video/")) fileCategory = "video";
      else if (docObj.type.startsWith("audio/")) fileCategory = "audio";

      // Append standard message schema inside chats subcollection
      await addDoc(collection(db, "chats", targetChatId, "messages"), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        text: `Shared document: ${docObj.name}`,
        type: fileCategory,
        fileUrl: docObj.url,
        fileName: docObj.name,
        fileSize: docObj.size,
        timestamp: new Date(),
        readBy: [currentUser.uid],
        reactions: {}
      });

      // Update chat's last message
      await updateDoc(doc(db, "chats", targetChatId), {
        lastMessage: {
          text: `📎 Shared ${docObj.name}`,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          timestamp: new Date()
        }
      });

      // Get Chat's readable name to display in confirmation alert
      const chatRoom = chats.find(c => c.id === targetChatId);
      let targetName = chatRoom?.name || "Selected Room";
      if (chatRoom && !chatRoom.isGroup) {
        const otherId = chatRoom.members.find(m => m !== currentUser.uid);
        const otherUser = allUsers.find(u => u.uid === otherId);
        if (otherUser) targetName = otherUser.displayName;
      }

      setDocumentSuccessMsg(`Successfully shared "${docObj.name}" to conversation: "${targetName}"!`);
      
      // Auto clear message toast
      setTimeout(() => setDocumentSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Failed to share document to chat room:", err);
      alert("Failed to share document to chat.");
    }
  };

  // Delete uploaded document log
  const handleDeleteDocLog = async (id) => {
    if (!window.confirm("Are you sure you want to delete this document from your profile tracker?")) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, "user_documents", id));
      setDocumentSuccessMsg("Document log removed.");
      setTimeout(() => setDocumentSuccessMsg(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  // Save profile updates
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!displayName.trim()) return;

    setSavingProfile(true);
    setProfileSuccessMsg("");

    try {
      const db = getDb();
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || currentUser.photoURL
      });

      // Locally apply updates
      currentUser.displayName = displayName.trim();
      currentUser.photoURL = photoURL.trim() || currentUser.photoURL;

      setProfileSuccessMsg("Profile details updated successfully!");
      setEditingProfile(false);
      setTimeout(() => setProfileSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Profile save error:", err);
    } finally {
      setSavingProfile(false);
    }
  };

  // Formatter helpers
  const formatBytes = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div id="profile-details-page" className="flex-1 h-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">My Account & Documents</h3>
            <p className="text-[10px] text-slate-500">Manage your profile, system settings, and cloud files</p>
          </div>
        </div>
        
        {onBack && (
          <button
            onClick={onBack}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-300 transition"
          >
            ← Back to Chat
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Column 1: Profile card */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center relative overflow-hidden shadow-xl">
              <div className="absolute top-3 right-3">
                <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Active
                </span>
              </div>

              {/* Avatar Preview */}
              <div className="relative inline-block mt-2">
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName} 
                  className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-slate-800 shadow-xl"
                />
                <div className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 rounded-full border border-slate-900">
                  <Settings className="w-3.5 h-3.5 text-white" />
                </div>
              </div>

              <h2 className="text-base font-black text-white mt-4">{currentUser.displayName}</h2>
              <p className="text-xs text-indigo-400 font-semibold">{currentUser.role === "admin" ? "Community Administrator" : "Verified User"}</p>
              
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 text-left text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-mono">{currentUser.phoneNumber || "No number recorded"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  <span>Role: <strong className="text-slate-300 uppercase font-mono">{currentUser.role || "User"}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Joined Chatify: <strong className="text-slate-300">July 2026</strong></span>
                </div>
              </div>

              {profileSuccessMsg && (
                <div className="mt-3 p-2 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-[11px] rounded-lg">
                  {profileSuccessMsg}
                </div>
              )}

              {/* Edit Mode Controls */}
              {editingProfile ? (
                <form onSubmit={handleSaveProfile} className="mt-4 space-y-3 text-left border-t border-slate-800 pt-4">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Avatar Image URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="https://example.com/avatar.png"
                      value={photoURL}
                      onChange={(e) => setPhotoURL(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-55 text-white font-bold text-xs py-1.5 rounded transition"
                    >
                      {savingProfile ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProfile(false)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs py-1.5 rounded transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setEditingProfile(true)}
                  className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-2 rounded-lg transition font-bold"
                >
                  Edit Profile Details
                </button>
              )}
            </div>
          </div>

          {/* Column 2 & 3: File Upload and Documents Shared */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Box A: Interactive Drag and Drop Upload Zone */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Send & Upload New Document</h3>
              </div>

              {documentSuccessMsg && (
                <div className="p-3 bg-indigo-950/40 border border-indigo-500/20 text-indigo-300 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>{documentSuccessMsg}</span>
                </div>
              )}

              {documentErrorMsg && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{documentErrorMsg}</span>
                </div>
              )}

              {/* Drag Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${isDragOver ? "bg-indigo-950/20 border-indigo-500" : "border-slate-800 bg-slate-950/40 hover:border-slate-700"}`}
              >
                <input
                  type="file"
                  id="profile-doc-picker"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="profile-doc-picker" className="w-full h-full cursor-pointer flex flex-col items-center justify-center">
                  <div className="p-3 bg-slate-900 rounded-2xl text-slate-400 mb-2.5">
                    <Upload className="w-6 h-6 text-indigo-400" />
                  </div>
                  <span className="text-xs font-bold text-white">
                    {selectedFile ? selectedFile.name : "Drag and drop any document here"}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    {selectedFile ? formatBytes(selectedFile.size) : "or click to pick files (PDF, images, spreadsheets, archives)"}
                  </span>
                </label>
              </div>

              {/* Upload Controls */}
              {selectedFile && (
                <div className="flex items-center justify-between gap-4 bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Type: {selectedFile.type || "Document"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUploadDocument}
                      disabled={uploadingDoc}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-1.5 px-4 rounded-lg transition"
                    >
                      {uploadingDoc ? "Uploading..." : "Upload File"}
                    </button>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs py-1.5 px-3 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Box B: File History & Share Dashboard */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">My Cloud Documents List</h3>
                </div>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-750">
                  {documents.length} Docs
                </span>
              </div>

              {/* Target Room select helper */}
              {documents.length > 0 && (
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Target Conversation Room</label>
                    <p className="text-[10px] text-slate-500">Pick which chat to direct document shares to</p>
                  </div>
                  <select
                    value={targetChatId}
                    onChange={(e) => setTargetChatId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg text-xs p-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-56"
                  >
                    {chats.map((room) => {
                      let roomName = room.name || "Room";
                      if (!room.isGroup) {
                        const otherId = room.members.find(m => m !== currentUser.uid);
                        const otherUser = allUsers.find(u => u.uid === otherId);
                        if (otherUser) roomName = otherUser.displayName;
                      }
                      return (
                        <option key={room.id} value={room.id}>
                          {roomName} {room.isGroup ? "(Group)" : "(Direct)"}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* File logs list */}
              {loading ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  Loading shared documents...
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                  <FileText className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="font-bold text-slate-400 mb-0.5">No Uploaded Documents Found</p>
                  <p className="text-[10px]">Upload a spreadsheet, PDF, or image in the drag box above to populate this panel.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {documents.map((docItem) => {
                    return (
                      <div
                        key={docItem.id}
                        className="p-3 bg-slate-950 hover:bg-slate-950/80 border border-slate-850 rounded-xl transition flex items-center justify-between gap-4 group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-2 bg-slate-900 rounded-lg text-indigo-400 shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate group-hover:text-indigo-400 transition">
                              {docItem.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-500 font-mono">
                              <span>{formatBytes(docItem.size)}</span>
                              <span>•</span>
                              <span className="truncate">Uploaded {new Date(docItem.timestamp?.seconds * 1000 || docItem.timestamp).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={docItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
                            title="Preview Document"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => handleShareDocumentToChat(docItem)}
                            className="p-1.5 bg-indigo-900/40 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/20 hover:border-transparent rounded-md transition flex items-center gap-1 text-[10px] font-bold"
                            title="Share directly to chosen chat room"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            Share
                          </button>
                          <button
                            onClick={() => handleDeleteDocLog(docItem.id)}
                            className="p-1.5 hover:bg-rose-950/30 text-slate-500 hover:text-rose-400 rounded-md transition"
                            title="Remove log"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
