const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// CORRECT PATH - going up one level to PROJECTS folder, then into frontend
const frontendPath = path.join(__dirname, '..', 'business-tracker-frontend');
console.log(`📁 Serving frontend from: ${frontendPath}`);

app.use(express.static(frontendPath));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Business Tracker API is running! 🚀' });
});

app.get('/api/test-firebase', async (req, res) => {
  try {
    await db.collection('test').add({
      message: 'Hello from backend!',
      timestamp: new Date()
    });
    res.json({ success: true, message: 'Firebase is connected! ✅' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});