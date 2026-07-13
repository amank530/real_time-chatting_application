/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { Server as SocketServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS support
const io = new SocketServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json({ limit: "50mb" }));

// Configure local uploads storage
const uploadsPath = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

// API: Local File Upload
app.post("/api/upload", (req, res) => {
  const { fileName, fileType, fileData } = req.body; // fileData is base64 string
  if (!fileName || !fileData) {
    return res.status(400).json({ error: "Missing file name or file data" });
  }
  try {
    const buffer = Buffer.from(fileData, "base64");
    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(uploadsPath, safeName);
    fs.writeFileSync(filePath, buffer);
    res.json({ url: `/uploads/${safeName}` });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload file" });
  }
});

// API: Get Firebase config
app.get("/api/config", (req, res) => {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      res.json(config);
    } else {
      res.status(404).json({ error: "Firebase config file not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize Gemini AI Client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will be unavailable.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

const ai = getAiClient();

// API: Personal AI Assistant Chat
app.post("/api/ai/chat", async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API is not configured. Please add GEMINI_API_KEY." });
  }

  const { message, history, memories, userProfile } = req.body;

  try {
    // Construct rich context from memories
    let contextPrompt = "You are a Personal AI Assistant integrated into Chatify, a modern communication platform.\n";
    contextPrompt += "With the user's permission, you remember their notes, tasks, preferences, calendar events, contacts, and daily routines to help them.\n\n";

    if (userProfile) {
      contextPrompt += `User Profile:\n- Name: ${userProfile.displayName || "User"}\n- Email: ${userProfile.email || "N/A"}\n\n`;
    }

    if (memories && memories.length > 0) {
      contextPrompt += "User's Memorized Preferences & Notes:\n";
      memories.forEach((m) => {
        contextPrompt += `- [Type: ${m.type}] ${m.content} (Added on: ${new Date(m.timestamp).toLocaleDateString()})\n`;
      });
      contextPrompt += "\n";
    }

    contextPrompt += "Instructions for the AI Assistant:\n";
    contextPrompt += "1. Provide helpful, concise, personalized, and smart suggestions based on the user's memories when relevant.\n";
    contextPrompt += "2. You can help them manage tasks, plan their routines, write summaries, and set reminders.\n";
    contextPrompt += "3. Maintain a warm, friendly, professional, and supportive tone.\n";
    contextPrompt += "4. If the user asks to 'remember' or 'memorize' something, respond that you have saved it, and explain what you've remembered.\n";

    const formattedContents = [
      { role: "user", parts: [{ text: contextPrompt }] },
    ];

    // Map existing history to Gemini contents schema
    if (history && history.length > 0) {
      history.forEach((h) => {
        formattedContents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content }],
        });
      });
    }

    // Add current user message
    formattedContents.push({ role: "user", parts: [{ text: message }] });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: formattedContents,
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error("AI Assistant Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
});

// API: AI Auto-Reply Generation
app.post("/api/ai/auto-reply", async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API is not configured." });
  }

  const { incomingMessage, recentMessages, senderName, userProfile } = req.body;

  try {
    const mode = userProfile?.aiSettings?.mode || "Away";
    const customRule = userProfile?.aiSettings?.customRule || "";

    let systemPrompt = `You are an AI Auto-Reply agent responding on behalf of ${userProfile?.displayName || "the user"}.\n`;
    systemPrompt += `The user is currently in "${mode}" mode.\n`;
    
    if (mode === "Away") {
      systemPrompt += "The user is currently away from their device and cannot answer immediately. Keep the response polite, friendly, and short, explaining that they'll get back as soon as they return.\n";
    } else if (mode === "Working") {
      systemPrompt += "The user is currently working and focusing. The auto-reply should inform that the user is working but can be contacted for urgent matters, or they will respond later.\n";
    } else if (mode === "Sleeping") {
      systemPrompt += "The user is sleeping right now. Keep the response warm, quiet, and extremely brief. Let them know it's late and the user will reply in the morning.\n";
    } else if (mode === "Custom") {
      systemPrompt += `The user has set a custom auto-reply rule: "${customRule}". Adhere to this custom rule strictly.\n`;
    }

    systemPrompt += "\nYour reply should be written in first person as if you are the user's automated helper or the user themselves (e.g., 'Hello! This is an automated reply. I am currently...'). Always sound polite, clear, and extremely concise (maximum 1-2 sentences).\n";
    systemPrompt += "DO NOT make up commitments on their behalf.\n";

    let context = `Incoming message from ${senderName}: "${incomingMessage}"\n`;
    if (recentMessages && recentMessages.length > 0) {
      context += "\nRecent Conversation Context:\n";
      recentMessages.slice(-5).forEach((m) => {
        context += `${m.senderName}: ${m.text}\n`;
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n" + context }] }
      ]
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error("AI Auto-Reply Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const activeUsers = new Map();

io.on("connection", (socket) => {
  // User online status tracking
  socket.on("user-online", (data) => {
    activeUsers.set(socket.id, {
      userId: data.userId,
      socketId: socket.id,
      displayName: data.displayName,
      online: true,
    });
    // Broadcast updated active users list
    io.emit("active-users-list", Array.from(activeUsers.values()));
  });

  // Typing indicators
  socket.on("typing", (data) => {
    socket.broadcast.emit("typing-status", data);
  });

  // Reactions, edits, deletions real-time notifications
  socket.on("message-updated", (data) => {
    socket.broadcast.emit("message-updated-notification", data);
  });

  // WebRTC HD Calling signaling
  socket.on("call-user", (data) => {
    // Find target user's sockets
    for (const [sid, user] of activeUsers.entries()) {
      if (user.userId === data.userToCall) {
        io.to(sid).emit("incoming-call", {
          signal: data.signalData,
          from: data.from,
          callerName: data.callerName,
          type: data.type,
          chatId: data.chatId,
        });
      }
    }
  });

  socket.on("answer-call", (data) => {
    for (const [sid, user] of activeUsers.entries()) {
      if (user.userId === data.to) {
        io.to(sid).emit("call-accepted", data.signal);
      }
    }
  });

  socket.on("end-call", (data) => {
    for (const [sid, user] of activeUsers.entries()) {
      if (user.userId === data.to) {
        io.to(sid).emit("call-ended");
      }
    }
  });

  socket.on("ice-candidate", (data) => {
    for (const [sid, user] of activeUsers.entries()) {
      if (user.userId === data.to) {
        io.to(sid).emit("ice-candidate", data.candidate);
      }
    }
  });

  socket.on("disconnect", () => {
    activeUsers.delete(socket.id);
    io.emit("active-users-list", Array.from(activeUsers.values()));
  });
});

// Vite or production static asset integration
async function main() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Chatify server is running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start Chatify server:", err);
});
