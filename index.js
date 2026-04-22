import express from "express";
import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";
import axios from "axios";
dotenv.config();

const app = express();
app.use(express.json());
const server = http.createServer(app);
const port = process.env.PORT || 5000;

const io = new Server(server, {
  cors: {
    origin: process.env.NEXT_BASE_URL,
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
});

io.on("connection", (socket) => {
  console.log("user connected", socket.id);

  socket.on("identify", async (userId) => {
    console.log("identify received from", userId);
    try {
      await axios.post(`${process.env.NEXT_BASE_URL}/api/socket/connect`, {
        userId,
        socketId: socket.id,
      });
      console.log("socketId saved for", userId);
    } catch (err) {
      console.error("failed to save socketId", err.message);
    }
  });

  // ✅ NEW: User joins their personal room
  socket.on("join-user-room", (userId) => {
    const room = `user_${userId}`;
    socket.join(room);
    console.log(`User ${userId} joined room: ${room}`);
  });

  socket.on("update-location", async ({ userId, latitude, longitude }) => {
    const location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
    await axios.post(
      `${process.env.NEXT_BASE_URL}/api/socket/update-location`,
      { userId, location },
    );
    io.emit("update-deliveryBoy-location", { userId, location });
  });

  socket.on("join-room", (roomId) => {
    const roomIdStr = roomId?.toString();
    console.log("join room with", roomIdStr);
    socket.join(roomIdStr);
  });

  socket.on("send-message", async (message) => {
    console.log(message);
    await axios.post(`${process.env.NEXT_BASE_URL}/api/chat/save`, message);
    const roomIdStr = message.roomId?.toString();
    io.to(roomIdStr).emit("send-message", {
      ...message,
      roomId: roomIdStr,
      senderId: message.senderId?.toString(),
    });
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
  });
});

// ✅ UPDATED: Handle room-based emit
app.post("/notify", (req, res) => {
  const { event, data, socketId, room } = req.body;

  if (room) {
    io.to(room).emit(event, data);
  } else if (socketId) {
    io.to(socketId).emit(event, data);
  } else {
    io.emit(event, data);
  }

  return res.status(200).json({ success: true });
});

server.listen(port, () => {
  console.log("server started at", port);
});