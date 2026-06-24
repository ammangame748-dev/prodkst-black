const express = require('express');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const RESULTS_FILE = path.join(__dirname, 'detected_usernames.json');

// ==================== STATE ====================
let activeSearches = {}; // { guildId: { channelId, isSearching, results } }
let userSessions = {}; // { sessionId: { userId, accessToken, createdAt } }
let detectedUsernames = [];

// Load results from file
if (fs.existsSync(RESULTS_FILE)) {
  detectedUsernames = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
}

// ==================== EXPRESS APP ====================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.get('/api/guilds', async (req, res) => {
  const { sessionId } = req.query;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const accessToken = userSessions[sessionId].accessToken;
    const response = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Filter only guilds where user is admin
    const adminGuilds = response.data.filter(guild => {
      const permissions = BigInt(guild.permissions);
      return (permissions & BigInt(8)) === BigInt(8); // ADMINISTRATOR permission
    });

    res.json(adminGuilds);
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

app.get('/api/channels/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const { sessionId } = req.query;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    await client.login(DISCORD_BOT_TOKEN);

    client.on('ready', async () => {
      try {
        const guild = await client.guilds.fetch(guildId);
        const channels = await guild.channels.fetch();

        const textChannels = channels
          .filter(ch => ch.type === ChannelType.GuildText)
          .map(ch => ({ id: ch.id, name: ch.name }));

        res.json(textChannels);
        client.destroy();
      } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
        client.destroy();
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/api/search/start', (req, res) => {
  const { guildId, channelId, sessionId } = req.body;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!guildId || !channelId) {
    return res.status(400).json({ error: 'Missing guildId or channelId' });
  }

  activeSearches[guildId] = {
    channelId,
    isSearching: true,
    results: [],
  };

  // Start search in background
  startUsernameSearch(guildId, channelId);

  res.json({ success: true, message: 'Search started' });
});

app.post('/api/search/stop', (req, res) => {
  const { guildId, sessionId } = req.body;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (activeSearches[guildId]) {
    activeSearches[guildId].isSearching = false;
  }

  res.json({ success: true, message: 'Search stopped' });
});

app.get('/api/search/status/:guildId', (req, res) => {
  const { guildId } = req.params;
  const { sessionId } = req.query;

  if (!userSessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const search = activeSearches[guildId];
  res.json({
    isSearching: search?.isSearching || false,
    results: search?.results || [],
    total: detectedUsernames.length,
  });
});

// ==================== DISCORD BOT SEARCH ====================
async function startUsernameSearch(guildId, channelId) {
  try {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    await client.login(DISCORD_BOT_TOKEN);

    client.on('ready', async () => {
      try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);

        if (!channel || channel.type !== ChannelType.GuildText) {
          console.error('Invalid channel');
          client.destroy();
          return;
        }

        // Generate usernames
        const usernames = generateThreeCharUsernames(50);

        for (const username of usernames) {
          if (!activeSearches[guildId]?.isSearching) break;

          detectedUsernames.push(username);
          if (activeSearches[guildId]) {
            activeSearches[guildId].results.push(username);
          }
          saveResults();

          // Send to Discord channel
          try {
            await channel.send(`✅ **Found:** \`${username}\``);
          } catch (err) {
            console.error('Failed to send message:', err);
          }

          // Delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (activeSearches[guildId]) {
          activeSearches[guildId].isSearching = false;
        }

        try {
          await channel.send('🏁 **Search completed!**');
        } catch (err) {
          console.error('Failed to send completion message:', err);
        }

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

  for (let i = 0; i < count * 0.6; i++) {
    let username = '';
    for (let j = 0; j < 3; j++) {
      username += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!usernames.includes(username) && !detectedUsernames.includes(username)) {
      usernames.push(username);
    }
  }

  for (let i = 0; i < count * 0.3; i++) {
    let username = '';
    for (let j = 0; j < 2; j++) {
      username += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!usernames.includes(username) && !detectedUsernames.includes(username)) {
      usernames.push(username);
    }
  }

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
      max-width: 1400px;
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

    /* GUILDS GRID */
    .guilds-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .guild-card {
      border: 2px solid #ffffff;
      padding: 20px;
      cursor: pointer;
      transition: all 0.3s;
      background-color: #0a0a0a;
    }

    .guild-card:hover {
      background-color: #1a1a1a;
      border-color: #ff0000;
    }

    .guild-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .guild-id {
      font-size: 11px;
      color: #888888;
      margin-bottom: 15px;
    }

    /* SEARCH CARD */
    .search-card {
      border: 2px solid #ffffff;
      padding: 30px;
      background-color: #0a0a0a;
      margin-bottom: 40px;
    }

    .search-card-title {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 3px;
      margin-bottom: 20px;
      text-transform: uppercase;
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

    select {
      width: 100%;
      padding: 12px;
      background-color: #1a1a1a;
      border: 2px solid #ffffff;
      color: #ffffff;
      font-family: 'Space Mono', monospace;
      font-size: 14px;
      letter-spacing: 1px;
    }

    select:focus {
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
      background-color: #00aa00;
      color: #000000;
    }

    button.stop.active {
      background-color: #ff0000;
      color: #ffffff;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* STATUS */
    .status {
      font-size: 12px;
      margin-top: 15px;
      padding: 10px;
      background-color: #1a1a1a;
      border-left: 3px solid #ff0000;
    }

    .status.active {
      border-left-color: #00ff00;
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

    .hidden {
      display: none;
    }

    .message {
      padding: 15px;
      margin-bottom: 20px;
      border: 2px solid #ffffff;
      font-weight: bold;
    }

    .message.error {
      background-color: #ff0000;
      color: #000000;
    }

    .message.success {
      background-color: #00ff00;
      color: #000000;
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
      <div id="message"></div>

      <div class="search-card" id="searchCard" style="display: none;">
        <div class="search-card-title" id="selectedGuildName"></div>
        
        <div class="form-group">
          <label>SELECT CHANNEL</label>
          <select id="channelSelect">
            <option value="">-- اختر روم --</option>
          </select>
        </div>

        <div class="button-group">
          <button id="startBtn" onclick="startSearch()">▶ START SEARCH</button>
          <button id="stopBtn" class="stop" onclick="stopSearch()" disabled>⏹ STOP SEARCH</button>
        </div>

        <div class="status" id="status">
          <span id="statusText">جاهز للبحث</span>
        </div>
      </div>

      <div class="guilds-grid" id="guildsGrid">
        <div class="loading">
          <div class="spinner"></div>
          <p>جاري تحميل السيرفرات...</p>
        </div>
      </div>
    `}
  </div>

  <script>
    const sessionId = new URLSearchParams(window.location.search).get('session');
    let currentGuild = null;

    async function loadGuilds() {
      try {
        const response = await fetch(\`/api/guilds?sessionId=\${sessionId}\`);
        const guilds = await response.json();

        let html = '';
        guilds.forEach(guild => {
          html += \`
            <div class="guild-card" onclick="selectGuild('\${guild.id}', '\${guild.name}')">
              <div class="guild-name">\${guild.name}</div>
              <div class="guild-id">ID: \${guild.id}</div>
              <div style="font-size: 11px; color: #666;">اضغط للتحديد</div>
            </div>
          \`;
        });

        document.getElementById('guildsGrid').innerHTML = html;
      } catch (error) {
        console.error('Error loading guilds:', error);
        showMessage('خطأ في تحميل السيرفرات', 'error');
      }
    }

    async function selectGuild(guildId, guildName) {
      currentGuild = { id: guildId, name: guildName };
      document.getElementById('selectedGuildName').textContent = guildName;
      document.getElementById('searchCard').style.display = 'block';
      document.getElementById('guildsGrid').style.display = 'none';

      // Load channels
      try {
        const response = await fetch(\`/api/channels/\${guildId}?sessionId=\${sessionId}\`);
        const channels = await response.json();

        let html = '<option value="">-- اختر روم --</option>';
        channels.forEach(ch => {
          html += \`<option value="\${ch.id}">\${ch.name}</option>\`;
        });

        document.getElementById('channelSelect').innerHTML = html;
      } catch (error) {
        console.error('Error loading channels:', error);
        showMessage('خطأ في تحميل الرومات', 'error');
      }
    }

    async function startSearch() {
      const channelId = document.getElementById('channelSelect').value;

      if (!channelId) {
        showMessage('الرجاء اختيار روم', 'error');
        return;
      }

      try {
        const response = await fetch('/api/search/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guildId: currentGuild.id,
            channelId,
            sessionId,
          }),
        });

        if (response.ok) {
          showMessage('✅ تم بدء البحث', 'success');
          document.getElementById('startBtn').disabled = true;
          document.getElementById('stopBtn').disabled = false;
          document.getElementById('status').classList.add('active');
          document.getElementById('statusText').textContent = '🔴 البحث جاري...';

          // Update status every 2 seconds
          const interval = setInterval(async () => {
            const statusResponse = await fetch(\`/api/search/status/\${currentGuild.id}?sessionId=\${sessionId}\`);
            const status = await statusResponse.json();

            if (!status.isSearching) {
              clearInterval(interval);
              document.getElementById('startBtn').disabled = false;
              document.getElementById('stopBtn').disabled = true;
              document.getElementById('status').classList.remove('active');
              document.getElementById('statusText').textContent = '✅ البحث انتهى';
            } else {
              document.getElementById('statusText').textContent = \`🔴 البحث جاري... (\${status.results.length} يوزرنيم)\`;
            }
          }, 2000);
        }
      } catch (error) {
        showMessage('❌ خطأ: ' + error.message, 'error');
      }
    }

    async function stopSearch() {
      try {
        const response = await fetch('/api/search/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guildId: currentGuild.id,
            sessionId,
          }),
        });

        if (response.ok) {
          showMessage('✅ تم إيقاف البحث', 'success');
          document.getElementById('startBtn').disabled = false;
          document.getElementById('stopBtn').disabled = true;
          document.getElementById('status').classList.remove('active');
          document.getElementById('statusText').textContent = '⏹️ البحث موقوف';
        }
      } catch (error) {
        showMessage('❌ خطأ: ' + error.message, 'error');
      }
    }

    function showMessage(text, type) {
      const msgDiv = document.getElementById('message');
      msgDiv.innerHTML = \`<div class="message \${type}">\${text}</div>\`;
      setTimeout(() => { msgDiv.innerHTML = ''; }, 5000);
    }

    // Load guilds on page load
    if (sessionId) {
      loadGuilds();
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
