const express = require('express');
const cors = require('cors');
if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '服务正常运行' });
});

// Routes
const chatRoutes = require('./routes/chat');
const sessionRoutes = require('./routes/sessions');
const settingsRoutes = require('./routes/settings');
const screenRoutes = require('./routes/screen');

app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/screen', screenRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
