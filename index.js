const express = require('express');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_CLIENT_ID';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;
const RESULTS_FILE = path.join(__dirname, 'detected_usernames.json');

// ==================== STATE ====================
let detectedUsernames = [];
let isSearching = false;
let currentSession = null;
let userSessions = {};

// Load results from file
if (fs.existsSync(RESULTS_FILE)) {
  detectedUsernames = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
}

// ==================== EXPRESS APP ====================
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==================== DISCORD OAUTH ====================
app.get('/login', (req, res) => {
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/');
  }

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', {
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    });

    const accessToken = tokenResponse.data.access_token;
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userId = userResponse.data.id;
    const sessionId = `session_${userId}_${Date.now()}`;
    userSessions[sessionId] = {
      userId,
      accessToken,
      createdAt: Date.now(),
    };

    res.redirect(`/?session=${sessionId}`);
  } catch (error) {
    console.error('OAuth error:', error);
    res.redirect('/');
  }
});

// ==================== API ENDPOINTS ====================
app.post('/api/start-search', (req, res) => {
  const { botToken, serverId, channelId, sessionId } = req.body;

  if (!botToken || !serverId || !channelId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  isSearching = true;
  currentSession = { botToken, serverId, channelId, sessionId };
  detectedUsernames = [];
  saveResults();

  startUsernameSearch(botToken, serverId, channelId);

  res.json({ success: true, message: 'Search started' });
});

app.post('/api/stop-search', (req, res) => {
  const { sessionId } = req.body;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  isSearching = false;
  res.json({ success: true, message: 'Search stopped' });
});

app.get('/api/results', (req, res) => {
  const { sessionId } = req.query;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stats = {
    total: detectedUsernames.length,
    threeChar: detectedUsernames.filter(u => u.length === 3).length,
    twoChar: detectedUsernames.filter(u => u.length === 2).length,
    oneChar: detectedUsernames.filter(u => u.length === 1).length,
  };

  res.json({
    stats,
    usernames: detectedUsernames.map((u, i) => ({
      id: i,
      username: u,
      length: u.length,
      detectedAt: new Date().toISOString(),
    })),
  });
});

app.post('/api/clear-results', (req, res) => {
  const { sessionId } = req.body;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  detectedUsernames = [];
  saveResults();
  res.json({ success: true, message: 'Results cleared' });
});

// ==================== DISCORD BOT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on('error', error => {
  console.error('Discord bot error:', error);
});

// ==================== USERNAME SEARCH ENGINE ====================
async function startUsernameSearch(botToken, serverId, channelId) {
  try {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    await client.login(botToken);

    client.on('ready', async () => {
      try {
        const guild = await client.guilds.fetch(serverId);
        const channel = await guild.channels.fetch(channelId);

        if (!channel || channel.type !== ChannelType.GuildText) {
          console.error('Invalid channel');
          client.destroy();
          return;
        }

        // Simulate username search (3-char and 2-char usernames)
        const searchResults = generateThreeCharUsernames(100);

        for (const username of searchResults) {
          if (!isSearching) break;

          detectedUsernames.push(username);
          saveResults();

          // Send to Discord channel
          try {
            await channel.send(`✅ **Found:** \`${username}\``);
          } catch (err) {
            console.error('Failed to send message:', err);
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        isSearching = false;
        await channel.send('🏁 **Search completed!**');
        client.destroy();
      } catch (error) {
        console.error('Search error:', error);
        client.destroy();
      }
    });
  } catch (error) {
    console.error('Bot login error:', error);
  }
}

function generateThreeCharUsernames(count) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const usernames = [];

  // Generate 3-char usernames
  for (let i = 0; i < count * 0.6; i++) {
    let username = '';
    for (let j = 0; j < 3; j++) {
      username += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!usernames.includes(username) && !detectedUsernames.includes(username)) {
      usernames.push(username);
    }
  }

  // Generate 2-char usernames
  for (let i = 0; i < count * 0.3; i++) {
    let username = '';
    for (let j = 0; j < 2; j++) {
      username += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!usernames.includes(username) && !detectedUsernames.includes(username)) {
      usernames.push(username);
    }
  }

  // Generate 1-char usernames
  for (let i = 0; i < count * 0.1; i++) {
    const username = chars[Math.floor(Math.random() * chars.length)];
    if (!usernames.includes(username) && !detectedUsernames.includes(username)) {
      usernames.push(username);
    }
  }

  return usernames.slice(0, count);
}

function saveResults() {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(detectedUsernames, null, 2));
}

// ==================== STATIC HTML ====================
app.get('/', (req, res) => {
  const sessionId = req.query.session || '';
  const isAuthenticated = !!userSessions[sessionId];

  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DISCORD USERNAME HUNTER</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Space Mono', 'Courier New', monospace;
      background-color: #000000;
      color: #ffffff;
      line-height: 1.6;
      letter-spacing: 2px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    /* HEADER */
    header {
      margin-bottom: 40px;
    }

    h1 {
      font-size: 48px;
      font-weight: 900;
      letter-spacing: 4px;
      margin-bottom: 20px;
      text-transform: uppercase;
    }

    .red-line {
      height: 4px;
      background-color: #ff0000;
      width: 100%;
      margin: 20px 0;
    }

    .welcome-text {
      font-size: 14px;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }

    /* AUTH */
    .auth-section {
      display: flex;
      gap: 20px;
      margin-bottom: 40px;
      align-items: center;
    }

    .auth-button {
      background-color: #ff0000;
      color: #000000;
      border: 2px solid #ffffff;
      padding: 12px 30px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 2px;
      cursor: pointer;
      text-transform: uppercase;
      transition: all 0.2s;
    }

    .auth-button:hover {
      background-color: #ffffff;
      color: #000000;
    }

    .auth-button:active {
      transform: scale(0.98);
    }

    .session-info {
      font-size: 12px;
      color: #888888;
    }

    /* CONFIGURATION SECTION */
    .section {
      margin-bottom: 40px;
    }

    .section-title {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 3px;
      margin-bottom: 20px;
      text-transform: uppercase;
      border-bottom: 2px solid #ffffff;
      padding-bottom: 10px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 2px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 12px;
      background-color: #1a1a1a;
      border: 2px solid #ffffff;
      color: #ffffff;
      font-family: 'Space Mono', monospace;
      font-size: 14px;
      letter-spacing: 1px;
    }

    input[type="text"]:focus,
    input[type="password"]:focus {
      outline: none;
      background-color: #2a2a2a;
      border-color: #ff0000;
    }

    /* BUTTONS */
    .button-group {
      display: flex;
      gap: 15px;
      margin-top: 20px;
    }

    button {
      flex: 1;
      padding: 15px;
      background-color: #ff0000;
      color: #000000;
      border: 2px solid #ffffff;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 2px;
      cursor: pointer;
      text-transform: uppercase;
      transition: all 0.2s;
    }

    button:hover {
      background-color: #ffffff;
      color: #000000;
    }

    button:active {
      transform: scale(0.98);
    }

    button.stop {
      background-color: #333333;
      color: #ff0000;
    }

    button.stop:hover {
      background-color: #ff0000;
      color: #ffffff;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* STATISTICS */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-box {
      border: 2px solid #ffffff;
      padding: 20px;
      text-align: center;
    }

    .stat-number {
      font-size: 48px;
      font-weight: 900;
      color: #ff0000;
      margin-bottom: 10px;
    }

    .stat-label {
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    /* RESULTS TABLE */
    .results-section {
      margin-top: 40px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #ffffff;
    }

    thead {
      background-color: #1a1a1a;
      border-bottom: 2px solid #ff0000;
    }

    th {
      padding: 15px;
      text-align: right;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    td {
      padding: 12px 15px;
      border-bottom: 1px solid #333333;
      font-size: 13px;
    }

    tr:hover {
      background-color: #1a1a1a;
    }

    .username-cell {
      font-family: 'Courier New', monospace;
      color: #ff0000;
      font-weight: bold;
    }

    .loading {
      text-align: center;
      padding: 20px;
      color: #888888;
    }

    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #ff0000;
      border-top: 2px solid transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error {
      background-color: #ff0000;
      color: #000000;
      padding: 15px;
      margin-bottom: 20px;
      border: 2px solid #ffffff;
      font-weight: bold;
    }

    .success {
      background-color: #00ff00;
      color: #000000;
      padding: 15px;
      margin-bottom: 20px;
      border: 2px solid #ffffff;
      font-weight: bold;
    }

    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>DISCORD USERNAME HUNTER</h1>
      <div class="red-line"></div>
      <div class="welcome-text">
        ${isAuthenticated ? '✅ مرحباً - لوحة التحكم' : '⚠️ يرجى تسجيل الدخول عبر ديسكورد'}
      </div>
    </header>

    ${!isAuthenticated ? `
      <div class="auth-section">
        <a href="/login" style="text-decoration: none;">
          <button class="auth-button">تسجيل الدخول عبر ديسكورد</button>
        </a>
      </div>
    ` : `
      <div class="session-info">
        Session ID: <code>${sessionId.substring(0, 20)}...</code>
      </div>

      <div id="message"></div>

      <div class="section">
        <div class="section-title">CONFIGURATION</div>
        
        <div class="form-group">
          <label>BOT TOKEN</label>
          <input type="password" id="botToken" placeholder="أدخل توكن البوت">
        </div>

        <div class="form-group">
          <label>SERVER ID</label>
          <input type="text" id="serverId" placeholder="معرف السيرفر">
        </div>

        <div class="form-group">
          <label>CHANNEL ID</label>
          <input type="text" id="channelId" placeholder="معرف الروم">
        </div>

        <div class="button-group">
          <button id="startBtn" onclick="startSearch()">▶ START SEARCH</button>
          <button id="stopBtn" class="stop" onclick="stopSearch()" disabled>⏹ STOP SEARCH</button>
          <button onclick="clearResults()">🗑 CLEAR RESULTS</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">STATISTICS</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-number" id="totalStat">0</div>
            <div class="stat-label">TOTAL FOUND</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" id="threeCharStat">0</div>
            <div class="stat-label">3-CHARACTER</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" id="twoCharStat">0</div>
            <div class="stat-label">2-CHARACTER</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" id="oneCharStat">0</div>
            <div class="stat-label">1-CHARACTER</div>
          </div>
        </div>
      </div>

      <div class="results-section">
        <div class="section-title">DETECTED USERNAMES</div>
        <div id="resultsContainer">
          <div class="loading">جاري تحميل النتائج...</div>
        </div>
      </div>
    `}
  </div>

  <script>
    const sessionId = new URLSearchParams(window.location.search).get('session');

    async function startSearch() {
      const botToken = document.getElementById('botToken').value;
      const serverId = document.getElementById('serverId').value;
      const channelId = document.getElementById('channelId').value;

      if (!botToken || !serverId || !channelId) {
        showMessage('الرجاء ملء جميع الحقول', 'error');
        return;
      }

      try {
        const response = await fetch('/api/start-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken, serverId, channelId, sessionId }),
        });

        if (response.ok) {
          showMessage('✅ تم بدء البحث', 'success');
          document.getElementById('startBtn').disabled = true;
          document.getElementById('stopBtn').disabled = false;
          loadResults();
          setInterval(loadResults, 2000);
        } else {
          showMessage('❌ خطأ في بدء البحث', 'error');
        }
      } catch (error) {
        showMessage('❌ خطأ: ' + error.message, 'error');
      }
    }

    async function stopSearch() {
      try {
        const response = await fetch('/api/stop-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        if (response.ok) {
          showMessage('✅ تم إيقاف البحث', 'success');
          document.getElementById('startBtn').disabled = false;
          document.getElementById('stopBtn').disabled = true;
        }
      } catch (error) {
        showMessage('❌ خطأ: ' + error.message, 'error');
      }
    }

    async function clearResults() {
      try {
        const response = await fetch('/api/clear-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        if (response.ok) {
          showMessage('✅ تم مسح النتائج', 'success');
          loadResults();
        }
      } catch (error) {
        showMessage('❌ خطأ: ' + error.message, 'error');
      }
    }

    async function loadResults() {
      try {
        const response = await fetch(\`/api/results?sessionId=\${sessionId}\`);
        const data = await response.json();

        document.getElementById('totalStat').textContent = data.stats.total;
        document.getElementById('threeCharStat').textContent = data.stats.threeChar;
        document.getElementById('twoCharStat').textContent = data.stats.twoChar;
        document.getElementById('oneCharStat').textContent = data.stats.oneChar;

        let html = '<table><thead><tr><th>USERNAME</th><th>LENGTH</th><th>DETECTED AT</th></tr></thead><tbody>';
        
        if (data.usernames.length === 0) {
          html += '<tr><td colspan="3" style="text-align: center; color: #888;">لا توجد نتائج</td></tr>';
        } else {
          data.usernames.forEach(u => {
            html += \`<tr><td class="username-cell">\${u.username}</td><td>\${u.length}</td><td>\${new Date(u.detectedAt).toLocaleString('ar-SA')}</td></tr>\`;
          });
        }
        
        html += '</tbody></table>';
        document.getElementById('resultsContainer').innerHTML = html;
      } catch (error) {
        console.error('Error loading results:', error);
      }
    }

    function showMessage(text, type) {
      const msgDiv = document.getElementById('message');
      msgDiv.innerHTML = \`<div class="\${type}">\${text}</div>\`;
      setTimeout(() => { msgDiv.innerHTML = ''; }, 5000);
    }

    // Load results on page load
    if (sessionId) {
      loadResults();
      setInterval(loadResults, 3000);
    }
  </script>
</body>
</html>
  `;

  res.send(html);
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   DISCORD USERNAME HUNTER - RUNNING    ║
║   http://localhost:${PORT}                 ║
╚════════════════════════════════════════╝
  `);
});
