require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== Discord Bot Setup ==========
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'],
});

bot.once('ready', () => {
  console.log(`✅ Bot is online as ${bot.user.tag}`);
});

if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your_bot_token_here') {
  bot.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Bot login failed:', err.message);
  });
}

// ========== Express Setup ==========
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'blacklist_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24, secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

// ========== Passport Discord Strategy ==========
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify', 'guilds'],
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ========== Middleware ==========
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ========== HTML Templates ==========
const loginHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLACKLIST — تسجيل الدخول</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #050a1a;
      --blue-primary: #1a3aff;
      --blue-bright: #4d6fff;
      --text-primary: #e8eeff;
      --text-secondary: #8899cc;
      --border-color: rgba(30, 60, 180, 0.35);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at 50% 0%, rgba(26, 58, 255, 0.18) 0%, var(--bg-primary) 70%);
    }
    .grid-overlay {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(26, 58, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(26, 58, 255, 0.04) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }
    .login-container {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 460px;
      padding: 1.5rem;
    }
    .login-card {
      background: rgba(10, 20, 50, 0.85);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      overflow: hidden;
      backdrop-filter: blur(20px);
      box-shadow: 0 0 60px rgba(26, 58, 255, 0.15);
    }
    .logo-section {
      padding: 2.5rem 2rem 1.5rem;
      text-align: center;
      background: linear-gradient(180deg, rgba(26, 58, 255, 0.12) 0%, transparent 100%);
      border-bottom: 1px solid var(--border-color);
    }
    .logo-text {
      font-size: 2.8rem;
      font-weight: 900;
      letter-spacing: 4px;
      margin-bottom: 0.5rem;
    }
    .logo-bl { color: var(--text-primary); text-shadow: 0 0 20px rgba(77, 111, 255, 0.8); }
    .logo-list { color: var(--blue-bright); text-shadow: 0 0 20px rgba(77, 111, 255, 1); }
    .logo-subtitle {
      font-size: 0.75rem;
      letter-spacing: 6px;
      color: var(--text-secondary);
      margin-top: 0.3rem;
    }
    .login-body { padding: 2rem; }
    .login-desc {
      color: var(--text-secondary);
      text-align: center;
      margin-bottom: 1.8rem;
      line-height: 1.7;
    }
    .discord-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      width: 100%;
      padding: 1rem 1.5rem;
      background: linear-gradient(135deg, #5865F2, #4752c4);
      color: white;
      border: none;
      border-radius: 12px;
      font-family: 'Cairo', sans-serif;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(88, 101, 242, 0.4);
    }
    .discord-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(88, 101, 242, 0.6);
    }
    .login-features {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      margin-top: 1.8rem;
    }
    .feature-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      color: var(--text-secondary);
      font-size: 0.8rem;
    }
    .feature-icon { font-size: 1.3rem; }
    .login-footer {
      padding: 1rem 2rem;
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.78rem;
      border-top: 1px solid var(--border-color);
    }
  </style>
</head>
<body>
  <div class="grid-overlay"></div>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-section">
        <div class="logo-text"><span class="logo-bl">𝙱𝙻𝙰𝙲𝙺</span> <span class="logo-list">𝙻𝙸𝚂𝚃</span></div>
        <div class="logo-subtitle">BROADCAST DASHBOARD</div>
      </div>
      <div class="login-body">
        <p class="login-desc">سجّل دخولك عبر حساب ديسكورد للوصول إلى لوحة التحكم</p>
        <a href="/auth/discord" class="discord-btn">📡 تسجيل الدخول عبر Discord</a>
        <div class="login-features">
          <div class="feature-item"><span class="feature-icon">🔐</span><span>تسجيل آمن</span></div>
          <div class="feature-item"><span class="feature-icon">📡</span><span>بث الرسائل</span></div>
          <div class="feature-item"><span class="feature-icon">🎯</span><span>استهداف الرتب</span></div>
        </div>
      </div>
      <div class="login-footer">BLACKLIST © 2024</div>
    </div>
  </div>
</body>
</html>`;

const dashboardHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLACKLIST — لوحة التحكم</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #050a1a;
      --bg-card: rgba(10, 20, 50, 0.85);
      --blue-primary: #1a3aff;
      --blue-bright: #4d6fff;
      --text-primary: #e8eeff;
      --text-secondary: #8899cc;
      --text-muted: #445577;
      --border-color: rgba(30, 60, 180, 0.35);
      --success: #00e676;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      background: radial-gradient(ellipse at 20% 20%, rgba(26, 58, 255, 0.1) 0%, var(--bg-primary) 60%);
    }
    .grid-overlay {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(26, 58, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(26, 58, 255, 0.04) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }
    .container {
      position: relative;
      z-index: 10;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header h1 {
      font-size: 1.8rem;
      font-weight: 900;
    }
    .user-section {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid var(--blue-primary);
    }
    .user-info {
      text-align: right;
    }
    .user-name {
      font-weight: 700;
      font-size: 0.9rem;
    }
    .user-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .logout-btn {
      background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
      border: none;
      color: white;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      cursor: pointer;
      font-family: 'Cairo', sans-serif;
      font-weight: 700;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(26, 58, 255, 0.4);
    }
    .guilds-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.2rem;
    }
    .guild-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      text-decoration: none;
      color: var(--text-primary);
      transition: all 0.3s ease;
      cursor: pointer;
    }
    .guild-card:hover {
      border-color: rgba(77, 111, 255, 0.6);
      transform: translateY(-3px);
      box-shadow: 0 8px 30px rgba(26, 58, 255, 0.2);
    }
    .guild-icon {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 2px solid var(--border-color);
      object-fit: cover;
      flex-shrink: 0;
    }
    .guild-icon-fallback {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 900;
      color: white;
      border: 2px solid var(--border-color);
      flex-shrink: 0;
    }
    .guild-info {
      flex: 1;
      min-width: 0;
    }
    .guild-name {
      font-size: 1.05rem;
      font-weight: 700;
      margin-bottom: 0.2rem;
    }
    .guild-id {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      font-family: monospace;
    }
    .guild-badge {
      background: rgba(26, 58, 255, 0.2);
      border: 1px solid rgba(77, 111, 255, 0.3);
      color: var(--blue-bright);
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      border-radius: 20px;
      display: inline-block;
    }
    .guild-arrow {
      color: var(--text-muted);
      font-size: 1.2rem;
      transition: all 0.3s;
      flex-shrink: 0;
    }
    .guild-card:hover .guild-arrow {
      color: var(--blue-bright);
      transform: translateX(-4px);
    }
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-secondary);
    }
    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .empty-state h2 {
      font-size: 1.5rem;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }
  </style>
</head>
<body>
  <div class="grid-overlay"></div>
  <div class="container">
    <div class="header">
      <h1>🖥️ السيرفرات</h1>
      <div class="user-section">
        <div class="user-info">
          <div class="user-name">{USER_NAME}</div>
          <div class="user-tag">#{USER_TAG}</div>
        </div>
        <img src="{USER_AVATAR}" onerror="this.style.display='none'" alt="Avatar" class="user-avatar">
        <a href="/logout" class="logout-btn">تسجيل الخروج</a>
      </div>
    </div>
    <div id="guildsContainer"></div>
  </div>
  <script>
    const guilds = {GUILDS_JSON};
    const container = document.getElementById('guildsContainer');
    
    if (guilds.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🤖</div><h2>لا توجد سيرفرات</h2><p>لا توجد سيرفرات أنت مدير فيها والبوت موجود بها</p></div>';
    } else {
      container.innerHTML = '<div class="guilds-grid">' + guilds.map(g => \`
        <a href="/dashboard/guild/\${g.id}" class="guild-card">
          \${g.icon ? \`<img src="\${g.icon}" alt="\${g.name}" class="guild-icon">\` : \`<div class="guild-icon-fallback">\${g.name.charAt(0)}</div>\`}
          <div class="guild-info">
            <div class="guild-name">\${g.name}</div>
            <div class="guild-id">ID: \${g.id}</div>
            <div class="guild-badge">\${g.isAdmin ? '👑 مدير كامل' : '⚙️ مدير السيرفر'}</div>
          </div>
          <div class="guild-arrow">←</div>
        </a>
      \`).join('') + '</div>';
    }
  </script>
</body>
</html>`;

const guildHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLACKLIST — {GUILD_NAME}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #050a1a;
      --bg-card: rgba(10, 20, 50, 0.85);
      --blue-primary: #1a3aff;
      --blue-bright: #4d6fff;
      --text-primary: #e8eeff;
      --text-secondary: #8899cc;
      --text-muted: #445577;
      --border-color: rgba(30, 60, 180, 0.35);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      background: radial-gradient(ellipse at 20% 20%, rgba(26, 58, 255, 0.1) 0%, var(--bg-primary) 60%);
    }
    .grid-overlay {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(26, 58, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(26, 58, 255, 0.04) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }
    .container {
      position: relative;
      z-index: 10;
      max-width: 1000px;
      margin: 0 auto;
      padding: 2rem;
    }
    .back-btn {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      display: inline-block;
      transition: color 0.2s;
    }
    .back-btn:hover { color: var(--blue-bright); }
    .header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .guild-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 2px solid var(--border-color);
    }
    .guild-icon-fallback {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      font-weight: 900;
      color: white;
    }
    .header h1 { font-size: 1.6rem; font-weight: 900; }
    .broadcast-layout {
      display: grid;
      grid-template-columns: 1fr 350px;
      gap: 1.5rem;
    }
    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.2rem;
      padding-bottom: 0.8rem;
      border-bottom: 1px solid var(--border-color);
    }
    .section-header h2 {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-primary);
      flex: 1;
    }
    .form-group {
      margin-bottom: 1.2rem;
    }
    .form-label {
      display: block;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 0.6rem;
    }
    .role-select {
      width: 100%;
      padding: 0.85rem 1rem;
      background: rgba(5, 10, 30, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      color: var(--text-primary);
      font-family: 'Cairo', sans-serif;
      font-size: 0.95rem;
      cursor: pointer;
    }
    .role-select:focus {
      outline: none;
      border-color: var(--blue-bright);
      box-shadow: 0 0 0 3px rgba(77, 111, 255, 0.15);
    }
    .role-preview {
      background: rgba(26, 58, 255, 0.08);
      border: 1px solid rgba(77, 111, 255, 0.2);
      border-radius: 8px;
      padding: 0.6rem 1rem;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .role-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .message-textarea {
      width: 100%;
      padding: 1rem;
      background: rgba(5, 10, 30, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      color: var(--text-primary);
      font-family: 'Cairo', sans-serif;
      font-size: 0.95rem;
      resize: vertical;
      min-height: 160px;
      line-height: 1.6;
    }
    .message-textarea:focus {
      outline: none;
      border-color: var(--blue-bright);
      box-shadow: 0 0 0 3px rgba(77, 111, 255, 0.15);
    }
    .char-counter {
      text-align: left;
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
    }
    .send-btn {
      width: 100%;
      padding: 1.1rem;
      background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
      border: none;
      border-radius: 12px;
      color: white;
      font-family: 'Cairo', sans-serif;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(26, 58, 255, 0.4);
      margin-top: 0.5rem;
    }
    .send-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(26, 58, 255, 0.6);
    }
    .send-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .roles-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      max-height: 300px;
      overflow-y: auto;
    }
    .role-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.8rem;
      border-radius: 8px;
      font-size: 0.88rem;
      color: var(--text-secondary);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
    }
    .role-item:hover {
      background: rgba(26, 58, 255, 0.1);
      border-color: var(--border-color);
      color: var(--text-primary);
    }
    .role-color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .role-item-name {
      flex: 1;
    }
    .role-item-count {
      font-size: 0.75rem;
      color: var(--text-muted);
      background: rgba(255,255,255,0.05);
      padding: 0.1rem 0.4rem;
      border-radius: 10px;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(8px);
    }
    .modal-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 2.5rem;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .modal-icon {
      font-size: 3.5rem;
      margin-bottom: 1rem;
    }
    .modal-title {
      font-size: 1.4rem;
      font-weight: 900;
      margin-bottom: 0.75rem;
    }
    .modal-msg {
      color: var(--text-secondary);
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .modal-stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: rgba(26, 58, 255, 0.08);
      border-radius: 12px;
      border: 1px solid var(--border-color);
    }
    .mstat-num {
      font-size: 2rem;
      font-weight: 900;
      color: var(--blue-bright);
    }
    .mstat-label {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }
    .modal-close-btn {
      background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
      border: none;
      border-radius: 10px;
      color: white;
      padding: 0.8rem 2rem;
      font-family: 'Cairo', sans-serif;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .modal-close-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(26, 58, 255, 0.4);
    }
    .loading-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(8px);
    }
    .loading-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 2.5rem 3rem;
      text-align: center;
    }
    .loading-spinner {
      width: 60px;
      height: 60px;
      border: 3px solid var(--border-color);
      border-top-color: var(--blue-bright);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1.2rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
    }
    .loading-sub {
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    @media (max-width: 768px) {
      .broadcast-layout { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="grid-overlay"></div>
  <div class="container">
    <a href="/dashboard" class="back-btn">← العودة للسيرفرات</a>
    <div class="header">
      {GUILD_ICON}
      <h1>{GUILD_NAME}</h1>
    </div>
    
    <div class="broadcast-layout">
      <div class="section-card">
        <div class="section-header">
          <span style="font-size:1.2rem">📝</span>
          <h2>رسالة البث</h2>
        </div>
        
        <div class="form-group">
          <label class="form-label">🎯 اختر الرتبة المستهدفة</label>
          <select id="roleSelect" class="role-select">
            <option value="all">👥 جميع الأعضاء</option>
            {ROLES_OPTIONS}
          </select>
        </div>
        
        <div class="role-preview">
          <span class="role-dot" id="roleDot" style="background:#5865F2"></span>
          <span id="rolePreviewName">جميع الأعضاء</span>
          <span id="rolePreviewCount" style="margin-right: auto; font-size: 0.8rem; color: var(--text-muted);"></span>
        </div>
        
        <div class="form-group">
          <label class="form-label">✍️ نص الرسالة</label>
          <textarea id="messageText" class="message-textarea" placeholder="اكتب رسالتك هنا..." rows="8" maxlength="2000"></textarea>
          <div class="char-counter"><span id="charCount">0</span> / 2000</div>
        </div>
        
        <button class="send-btn" id="sendBtn" onclick="sendBroadcast('{GUILD_ID}')">📡 إرسال الرسالة</button>
      </div>
      
      <div class="section-card">
        <div class="section-header">
          <span style="font-size:1.2rem">🏷️</span>
          <h2>الرتب</h2>
        </div>
        <div class="roles-list">
          <div class="role-item" onclick="selectRole('all', 'جميع الأعضاء', '#5865F2', '')">
            <span class="role-color-dot" style="background:#5865F2"></span>
            <span class="role-item-name">👥 جميع الأعضاء</span>
          </div>
          {ROLES_LIST}
        </div>
      </div>
    </div>
  </div>
  
  <div class="modal-overlay" id="resultModal">
    <div class="modal-card">
      <div class="modal-icon" id="modalIcon">✅</div>
      <h2 class="modal-title" id="modalTitle">تم الإرسال!</h2>
      <p class="modal-msg" id="modalMsg"></p>
      <div class="modal-stats" id="modalStats" style="display:none">
        <div><div class="mstat-num" id="mstatSent">0</div><div class="mstat-label">وصل</div></div>
        <div><div class="mstat-num" id="mstatFailed">0</div><div class="mstat-label">فشل</div></div>
        <div><div class="mstat-num" id="mstatTotal">0</div><div class="mstat-label">إجمالي</div></div>
      </div>
      <button class="modal-close-btn" onclick="closeModal()">إغلاق</button>
    </div>
  </div>
  
  <div class="loading-overlay" id="loadingOverlay">
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <div class="loading-text">جاري إرسال الرسائل...</div>
      <div class="loading-sub">قد يستغرق هذا بعض الوقت</div>
    </div>
  </div>
  
  <script>
    const messageTextarea = document.getElementById('messageText');
    const charCount = document.getElementById('charCount');
    const roleSelect = document.getElementById('roleSelect');
    
    messageTextarea.addEventListener('input', () => {
      charCount.textContent = messageTextarea.value.length;
    });
    
    roleSelect.addEventListener('change', () => {
      const opt = roleSelect.options[roleSelect.selectedIndex];
      updateRolePreview(opt.value, opt.text, opt.dataset.color || '#5865F2', opt.dataset.count || '');
    });
    
    function updateRolePreview(id, name, color, count) {
      document.getElementById('roleDot').style.background = color === '#000000' ? '#99aab5' : color;
      document.getElementById('rolePreviewName').textContent = name.replace(/\\s*\\(\\d+\\s*عضو\\)/, '');
      document.getElementById('rolePreviewCount').textContent = count ? count + ' عضو' : '';
    }
    
    function selectRole(id, name, color, count) {
      for (let i = 0; i < roleSelect.options.length; i++) {
        if (roleSelect.options[i].value === id) {
          roleSelect.selectedIndex = i;
          break;
        }
      }
      updateRolePreview(id, name, color, count);
    }
    
    async function sendBroadcast(guildId) {
      const message = messageTextarea.value.trim();
      const roleId = roleSelect.value;
      
      if (!message) {
        showModal('⚠️', 'تنبيه', 'يرجى كتابة رسالة قبل الإرسال!', false);
        return;
      }
      
      document.getElementById('loadingOverlay').style.display = 'flex';
      document.getElementById('sendBtn').disabled = true;
      
      try {
        const response = await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId, roleId, message }),
        });
        
        const data = await response.json();
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('sendBtn').disabled = false;
        
        if (data.success) {
          showModal('✅', 'تم الإرسال بنجاح!', data.message, true, data.sent, data.failed, data.total);
        } else {
          showModal('❌', 'حدث خطأ', data.error || 'فشل الإرسال', false);
        }
      } catch (err) {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('sendBtn').disabled = false;
        showModal('❌', 'خطأ', 'تعذر الاتصال بالسيرفر', false);
      }
    }
    
    function showModal(icon, title, msg, showStats, sent = 0, failed = 0, total = 0) {
      document.getElementById('modalIcon').textContent = icon;
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalMsg').textContent = msg;
      
      const statsEl = document.getElementById('modalStats');
      if (showStats) {
        statsEl.style.display = 'flex';
        document.getElementById('mstatSent').textContent = sent;
        document.getElementById('mstatFailed').textContent = failed;
        document.getElementById('mstatTotal').textContent = total;
      } else {
        statsEl.style.display = 'none';
      }
      
      document.getElementById('resultModal').style.display = 'flex';
    }
    
    function closeModal() {
      document.getElementById('resultModal').style.display = 'none';
    }
    
    document.getElementById('resultModal').addEventListener('click', (e) => {
      if (e.target.id === 'resultModal') closeModal();
    });
  </script>
</body>
</html>`;

// ========== Routes ==========

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.send(loginHTML);
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const userGuilds = req.user.guilds || [];
    const adminGuilds = userGuilds.filter(g => {
      const perms = BigInt(g.permissions);
      return (perms & BigInt(0x8)) !== BigInt(0) || (perms & BigInt(0x20)) !== BigInt(0);
    });
    
    const botGuildIds = new Set(bot.guilds.cache.map(g => g.id));
    const availableGuilds = adminGuilds.filter(g => botGuildIds.has(g.id));
    
    const guildsData = availableGuilds.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
      isAdmin: (BigInt(g.permissions) & BigInt(0x8)) !== BigInt(0)
    }));
    
    const userAvatar = `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png?size=64`;
    
    let html = dashboardHTML
      .replace('{USER_NAME}', req.user.username)
      .replace('{USER_TAG}', req.user.discriminator || '0000')
      .replace('{USER_AVATAR}', userAvatar)
      .replace('{GUILDS_JSON}', JSON.stringify(guildsData));
    
    res.send(html);
  } catch (err) {
    console.error(err);
    res.send('<h1>خطأ</h1><p>' + err.message + '</p>');
  }
});

app.get('/dashboard/guild/:guildId', isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const userGuilds = req.user.guilds || [];
    const userGuild = userGuilds.find(g => g.id === guildId);
    
    if (!userGuild) return res.redirect('/dashboard');
    
    const perms = BigInt(userGuild.permissions);
    const isAdmin = (perms & BigInt(0x8)) !== BigInt(0) || (perms & BigInt(0x20)) !== BigInt(0);
    if (!isAdmin) return res.redirect('/dashboard');
    
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) {
      return res.send('<h1>البوت غير موجود في هذا السيرفر</h1><a href="/dashboard">العودة</a>');
    }
    
    await guild.roles.fetch();
    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone' && !r.managed)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor, memberCount: r.members.size }))
      .sort((a, b) => b.memberCount - a.memberCount);
    
    const rolesOptions = roles.map(r => 
      `<option value="${r.id}" data-color="${r.color}" data-count="${r.memberCount}">${r.name} (${r.memberCount} عضو)</option>`
    ).join('');
    
    const rolesList = roles.map(r =>
      `<div class="role-item" onclick="selectRole('${r.id}', '${r.name.replace(/'/g, "\\'")}', '${r.color}', '${r.memberCount}')">
        <span class="role-color-dot" style="background:${r.color === '#000000' ? '#99aab5' : r.color}"></span>
        <span class="role-item-name">${r.name}</span>
        <span class="role-item-count">${r.memberCount}</span>
      </div>`
    ).join('');
    
    const guildIcon = guild.iconURL({ size: 128 })
      ? `<img src="${guild.iconURL({ size: 128 })}" alt="${guild.name}" class="guild-icon">`
      : `<div class="guild-icon-fallback">${guild.name.charAt(0)}</div>`;
    
    let html = guildHTML
      .replace('{GUILD_ID}', guildId)
      .replace('{GUILD_NAME}', guild.name)
      .replace('{GUILD_ICON}', guildIcon)
      .replace('{ROLES_OPTIONS}', rolesOptions)
      .replace('{ROLES_LIST}', rolesList);
    
    res.send(html);
  } catch (err) {
    console.error(err);
    res.send('<h1>خطأ</h1><p>' + err.message + '</p>');
  }
});

app.post('/api/broadcast', isAuthenticated, async (req, res) => {
  try {
    const { guildId, roleId, message } = req.body;
    
    if (!guildId || !message || message.trim() === '') {
      return res.json({ success: false, error: 'يرجى ملء جميع الحقول' });
    }
    
    const userGuilds = req.user.guilds || [];
    const userGuild = userGuilds.find(g => g.id === guildId);
    if (!userGuild) return res.json({ success: false, error: 'غير مصرح' });
    
    const perms = BigInt(userGuild.permissions);
    const isAdmin = (perms & BigInt(0x8)) !== BigInt(0) || (perms & BigInt(0x20)) !== BigInt(0);
    if (!isAdmin) return res.json({ success: false, error: 'غير مصرح' });
    
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.json({ success: false, error: 'البوت غير موجود في السيرفر' });
    
    await guild.members.fetch();
    
    let targetMembers;
    if (roleId && roleId !== 'all') {
      const role = guild.roles.cache.get(roleId);
      if (!role) return res.json({ success: false, error: 'الرتبة غير موجودة' });
      targetMembers = role.members.filter(m => !m.user.bot);
    } else {
      targetMembers = guild.members.cache.filter(m => !m.user.bot);
    }
    
    let sent = 0, failed = 0;
    
    for (const [, member] of targetMembers) {
      try {
        await member.send({
          embeds: [{
            title: '📢 رسالة من الإدارة',
            description: message,
            color: 0x1a3aff,
            footer: { text: `${guild.name} • BLACKLIST Dashboard` },
            timestamp: new Date().toISOString(),
          }]
        });
        sent++;
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        failed++;
      }
    }
    
    res.json({
      success: true,
      sent,
      failed,
      total: targetMembers.size,
      message: `تم الإرسال بنجاح! ✅ وصل لـ ${sent} عضو، ❌ فشل ${failed} عضو`,
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'حدث خطأ: ' + err.message });
  }
});

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`🚀 BLACKLIST Dashboard running on http://localhost:${PORT}`);
});