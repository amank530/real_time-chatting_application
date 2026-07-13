/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { getDb } from "../lib/firebase.js";
import { 
  Brain, 
  Sparkles, 
  Send, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Heart, 
  User, 
  Clock, 
  Plus, 
  Trash2, 
  Bot, 
  Lock,
  ArrowLeft
} from "lucide-react";

export default function AiAssistantPanel({ currentUser, onBack }) {
  const [activeSubTab, setActiveSubTab] = useState("note");
  const [memories, setMemories] = useState([]);
  
  // Create Memory States
  const [newContent, setNewContent] = useState("");
  
  // Private AI Chat States
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    {
      id: "welcome",
      role: "ai",
      content: `Hello ${currentUser.displayName}! I am your Personal AI Assistant. With your permission, I remember your notes, tasks, events, and routines. Ask me to draft a schedule, summarize your notes, or help you organize your day!`,
      timestamp: new Date()
    }
  ]);
  const [aiLoading, setAiLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Sync memories from Firestore
  useEffect(() => {
    const db = getDb();
    const memoriesRef = collection(db, "ai_memories");
    const q = query(memoriesRef, where("userId", "==", currentUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort newer first
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMemories(list);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Auto-scroll AI private chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Create new memory document
  const handleAddMemory = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const db = getDb();
    const memoryData = {
      userId: currentUser.uid,
      type: activeSubTab,
      content: newContent.trim(),
      timestamp: Date.now()
    };

    try {
      await addDoc(collection(db, "ai_memories"), memoryData);
      setNewContent("");

      // Add positive visual notification to AI chat
      setChatHistory(prev => [
        ...prev,
        {
          id: `notif-${Date.now()}`,
          role: "ai",
          content: `📝 Added new ${activeSubTab}: "${newContent.trim()}". I have committed this to my memory banks and will refer to it when you ask me questions!`,
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete memory doc
  const handleDeleteMemory = async (id) => {
    const db = getDb();
    try {
      await deleteDoc(doc(db, "ai_memories", id));
    } catch (err) {
      console.error(err);
    }
  };

  // Chat with Personal Assistant
  const handleSendAiMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || aiLoading) return;

    const userMsgText = chatInput.trim();
    const newUserBubble = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userMsgText,
      timestamp: new Date()
    };

    setChatHistory(prev => [...prev, newUserBubble]);
    setChatInput("");
    setAiLoading(true);

    try {
      // Package recent context history for Gemini model
      const formattedHistory = chatHistory
        .filter(h => h.id !== "welcome")
        .slice(-6)
        .map(h => ({
          role: h.role === "user" ? "user" : "model",
          content: h.content
        }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsgText,
          history: formattedHistory,
          memories: memories, // Exposing our local Firestore notes/routines
          userProfile: currentUser
        })
      });

      if (!res.ok) throw new Error("AI Request failed");
      const data = await res.json();

      setChatHistory(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: data.reply || "I apologize, I encountered a temporary problem processing that message.",
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: "ai",
          content: "Sorry, I am having trouble connecting to my cognitive networks. Verify that your Gemini API Key is configured in settings.",
          timestamp: new Date()
        }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const getSubTabDetails = (type) => {
    switch(type) {
      case "note": return { title: "Notes & Ideas", placeholder: "Write a note or brainstorm idea..." };
      case "task": return { title: "To-Do Tasks", placeholder: "Enter a task description (e.g. Finish React presentation)..." };
      case "calendar": return { title: "Events & Meetings", placeholder: "Add itinerary (e.g. Sync with team at 3:00 PM on Tuesday)..." };
      case "routine": return { title: "Daily Routines", placeholder: "Log standard routine (e.g. Wake up at 6:30 AM, drink coffee)..." };
      case "preference": return { title: "Preferences", placeholder: "Log preferences (e.g. Prefers dark themes, allergic to peanuts)..." };
      case "contact": return { title: "Contacts Directory", placeholder: "Add contact details (e.g. Sarah Smith - Product Lead - sarah@team.com)..." };
      default: return { title: "Memories", placeholder: "Write content..." };
    }
  };

  return (
    <div id="ai-assistant-pane" className="flex-1 h-full bg-slate-950 flex flex-col md:flex-row text-slate-100 overflow-hidden">
      
      {/* Left pane: Memory cockpit */}
      <div className="w-full md:w-1/2 p-6 border-r border-slate-800 flex flex-col h-full overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition mr-1 cursor-pointer"
              title="Back to Chats"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/15">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
              Personal AI Cockpit
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </h2>
            <p className="text-xs text-slate-400">Add notes, tasks, calendars, and routines for your AI to remember.</p>
          </div>
        </div>

        {/* Memory Categories buttons Grid */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { id: "note", label: "Notes", icon: FileText, color: "text-amber-400 bg-amber-500/10" },
            { id: "task", label: "To-Dos", icon: CheckSquare, color: "text-emerald-400 bg-emerald-500/10" },
            { id: "calendar", label: "Calendar", icon: Calendar, color: "text-sky-400 bg-sky-500/10" },
            { id: "routine", label: "Routines", icon: Clock, color: "text-indigo-400 bg-indigo-500/10" },
            { id: "preference", label: "Favorites", icon: Heart, color: "text-rose-400 bg-rose-500/10" },
            { id: "contact", label: "Contacts", icon: User, color: "text-violet-400 bg-violet-500/10" }
          ].map((tab) => {
            const IconComp = tab.icon;
            const isSelected = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveSubTab(tab.id); setNewContent(""); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition text-center ${isSelected ? "bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-500/10" : "bg-slate-900 hover:bg-slate-800/80 border-slate-800 text-slate-300"}`}
              >
                <IconComp className={`w-5 h-5 ${isSelected ? "text-white" : tab.color.split(" ")[0]}`} />
                <span className="text-[10px] font-bold tracking-wide uppercase">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Add Memory Form */}
        <form onSubmit={handleAddMemory} className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-6">
          <h3 className="text-xs font-bold text-slate-200 mb-2.5 uppercase tracking-wider">
            Record New {getSubTabDetails(activeSubTab).title}
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={getSubTabDetails(activeSubTab).placeholder}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg py-2 px-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 rounded-lg flex items-center gap-1 transition"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </form>

        {/* Saved Memories list */}
        <div className="flex-1 space-y-2">
          <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">
            Stored memories for {getSubTabDetails(activeSubTab).title}
          </h3>
          {memories.filter(m => m.type === activeSubTab).length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
              Memory bank is currently empty. Record something above to get started!
            </div>
          ) : (
            memories
              .filter(m => m.type === activeSubTab)
              .map((mem) => (
                <div 
                  key={mem.id} 
                  className="bg-slate-900 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between gap-4 group hover:border-slate-700 transition"
                >
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {mem.content}
                  </p>
                  <button
                    onClick={() => handleDeleteMemory(mem.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 transition shrink-0 opacity-0 group-hover:opacity-100"
                    title="Erase memory item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Right pane: Private AI Assistant chat */}
      <div className="w-full md:w-1/2 flex flex-col h-full bg-slate-950">
        
        {/* Assistant Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center gap-3 shadow-sm shrink-0">
          <div className="w-10 h-10 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Bot className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Personal AI Assistant
              <Lock className="w-3.5 h-3.5 text-slate-500" title="Private Encrypted Session" />
            </h3>
            <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-900/40 text-[9px] text-indigo-300 border border-indigo-500/20 font-bold uppercase tracking-wider">
              Gemini 2.5 Cognitive Layer
            </span>
          </div>
        </div>

        {/* Private logs messages thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 flex flex-col">
          {chatHistory.map((bubble) => {
            const isMe = bubble.role === "user";
            return (
              <div 
                key={bubble.id}
                className={`max-w-[85%] p-3.5 rounded-2xl shadow-sm leading-relaxed text-xs ${isMe ? "self-end bg-indigo-600 text-white rounded-tr-none" : "self-start bg-slate-900 text-slate-200 rounded-tl-none border border-slate-800"}`}
              >
                {!isMe && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-indigo-400 font-bold">
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI Assistant</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{bubble.content}</p>
                <div className="text-[9px] opacity-60 text-right mt-1 font-mono">
                  {bubble.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
          {aiLoading && (
            <div className="self-start bg-slate-900 border border-slate-800 max-w-[85%] p-4 rounded-2xl rounded-tl-none flex items-center gap-2 text-xs text-indigo-300 animate-pulse">
              <Bot className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Analyzing memories and synthesizing suggestions...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Assistant chat form input */}
        <form onSubmit={handleSendAiMessage} className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Query your Assistant (e.g., 'Draft a schedule from my calendar entries')..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              disabled={aiLoading}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || aiLoading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-800 text-white rounded-xl shadow-lg transition shrink-0"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
