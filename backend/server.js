const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dns = require('dns');
require('dotenv').config();

// Import routes
const parcelRoutes = require('./routes/parcelRoutes');
const driverRoutes = require('./routes/driverRoutes');
const authRoutes = require('./routes/authRoutes');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for development; restrict in production
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available in routes
app.set('io', io);

// Routes
app.use('/api/parcels', parcelRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/auth', authRoutes);

// Optional: override DNS resolvers for Atlas SRV lookups.
// This can help on networks where the default DNS intermittently refuses SRV queries.
if (process.env.DNS_SERVERS) {
  const servers = process.env.DNS_SERVERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB Atlas');
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Basic route
app.get('/', (req, res) => {
  res.send('Parcel Delivery and Tracking System API');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

console.log("URI:", process.env.MONGODB_URI);