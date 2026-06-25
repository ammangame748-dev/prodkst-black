const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// --- Configuration & Data Storage ---
const configPath = './config.json';
let config = {
    botToken: process.env.BOT_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    callbackURL: process.env.CALLBACK_URL || '',
    targetGuildId: process.env.TARGET_GUILD_ID || '',
    targetChannelId: process.env.TARGET_CHANNEL_ID || '',
    adminIds: (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(id => id)
};

if (fs.existsSync(configPath)) {
    try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = { ...config, ...fileConfig };
    } catch (e) {
        console.error("Error reading config.json, using defaults.");
    }
}

function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
}

// --- Discord Bot Logic ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

async function checkThreeCharUsers() {
    if (!config.targetGuildId || !config.targetChannelId) return;
    const guild = client.guilds.cache.get(config.targetGuildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(config.targetChannelId);
    if (!channel || !channel.isTextBased()) return;

    try {
        const members = await guild.members.fetch();
        const threeCharUsers = members.filter(m => m.user.username.length <= 3 && !m.user.bot);
        if (threeCharUsers.size > 0) {
            const embed = new EmbedBuilder()
                .setTitle('🎯 تم العثور على يوزرات مميزة!')
                .setColor('#0099ff')
                .setTimestamp();
            let description = 'إليك قائمة باليوزرات الثلاثية أو شبه الثلاثية:\n\n';
            threeCharUsers.forEach(member => {
                description += `• **${member.user.username}** (ID: ${member.user.id})\n`;
            });
            embed.setDescription(description);
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error("Error fetching members:", err);
    }
}

setInterval(checkThreeCharUsers, 30 * 60 * 1000);

if (config.botToken) {
    client.login(config.botToken).catch(err => console.error("Bot login failed."));
}

// --- Dashboard Logic (Express) ---
const app = express();
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Register Strategy (even with dummy if missing to avoid "Unknown strategy" error)
function registerStrategy() {
    passport.use(new DiscordStrategy({
        clientID: config.clientId || '123',
        clientSecret: config.clientSecret || '123',
        callbackURL: config.callbackURL || 'http://localhost:3000/callback',
        scope: ['identify', 'guilds']
    }, (accessToken, refreshToken, profile, done) => {
        process.nextTick(() => done(null, profile));
    }));
}

registerStrategy();
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/', (req, res) => {
    const isConfigured = config.clientId && config.clientSecret && config.callbackURL;
    res.render('index', { user: req.user, isConfigured });
});

app.get('/login', (req, res, next) => {
    if (!config.clientId || !config.clientSecret) {
        return res.send("<h1>خطأ في الإعدادات</h1><p>يرجى ضبط Client ID و Client Secret أولاً في صفحة الإعدادات.</p><a href='/'>العودة للرئيسية</a>");
    }
    passport.authenticate('discord')(req, res, next);
});

app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    
    // Authorization check
    if (config.adminIds.length > 0 && !config.adminIds.includes(req.user.id)) {
        return res.status(403).send("<h1>غير مسموح لك بالدخول</h1><p>ID الخاص بك غير موجود في قائمة الأدمن.</p>");
    }

    const guilds = client.isReady() ? client.guilds.cache.map(g => ({ id: g.id, name: g.name })) : [];
    res.render('dashboard', { user: req.user, config, guilds, botUser: client.user });
});

// Initial Setup Route (No Auth needed if not configured)
app.post('/setup', (req, res) => {
    // Only allow setup if not fully configured OR if user is already admin
    const isConfigured = config.clientId && config.clientSecret;
    if (isConfigured && (!req.isAuthenticated() || !config.adminIds.includes(req.user.id))) {
        return res.status(403).send("Setup locked.");
    }

    config.botToken = req.body.botToken || config.botToken;
    config.clientId = req.body.clientId || config.clientId;
    config.clientSecret = req.body.clientSecret || config.clientSecret;
    config.callbackURL = req.body.callbackURL || config.callbackURL;
    if (req.body.adminIds) {
        config.adminIds = req.body.adminIds.split(',').map(id => id.trim()).filter(id => id);
    }

    saveConfig();
    registerStrategy(); // Re-register with new values
    
    if (config.botToken && !client.isReady()) {
        client.login(config.botToken).catch(console.error);
    }

    res.redirect(isConfigured ? '/dashboard' : '/');
});

app.post('/update-config', (req, res) => {
    if (!req.isAuthenticated() || !config.adminIds.includes(req.user.id)) return res.status(403).send("Unauthorized");
    
    config.targetGuildId = req.body.guildId;
    config.targetChannelId = req.body.channelId;
    config.botToken = req.body.botToken || config.botToken;
    config.clientId = req.body.clientId || config.clientId;
    config.clientSecret = req.body.clientSecret || config.clientSecret;
    config.callbackURL = req.body.callbackURL || config.callbackURL;
    if (req.body.adminIds) {
        config.adminIds = req.body.adminIds.split(',').map(id => id.trim()).filter(id => id);
    }

    saveConfig();
    registerStrategy();
    res.redirect('/dashboard?success=true');
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// --- Views ---
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir);

fs.writeFileSync(path.join(viewsDir, 'index.ejs'), `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><title>نظام اليوزرات - الرئيسية</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Tajawal', sans-serif; }</style>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4">
    <div class="max-w-2xl w-full p-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 text-center">
        <h1 class="text-4xl font-bold mb-6 text-blue-500">نظام اليوزرات</h1>
        
        <% if (!isConfigured) { %>
            <div class="bg-yellow-900/30 border border-yellow-500 text-yellow-200 p-6 rounded-xl mb-8 text-right">
                <h2 class="text-xl font-bold mb-4">إعداد النظام لأول مرة</h2>
                <form action="/setup" method="POST" class="space-y-4">
                    <div>
                        <label class="block text-sm mb-1">Bot Token</label>
                        <input type="password" name="botToken" class="w-full bg-gray-700 p-2 rounded border border-gray-600">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm mb-1">Client ID</label>
                            <input type="text" name="clientId" class="w-full bg-gray-700 p-2 rounded border border-gray-600">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">Client Secret</label>
                            <input type="password" name="clientSecret" class="w-full bg-gray-700 p-2 rounded border border-gray-600">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm mb-1">Callback URL (مثال: https://yourapp.onrender.com/callback)</label>
                        <input type="text" name="callbackURL" class="w-full bg-gray-700 p-2 rounded border border-gray-600">
                    </div>
                    <div>
                        <label class="block text-sm mb-1">ID حسابك في ديسكورد (Admin ID)</label>
                        <input type="text" name="adminIds" class="w-full bg-gray-700 p-2 rounded border border-gray-600">
                    </div>
                    <button type="submit" class="w-full bg-yellow-600 hover:bg-yellow-700 py-3 rounded-lg font-bold transition">حفظ الإعدادات الأولية</button>
                </form>
            </div>
        <% } else { %>
            <p class="text-gray-400 mb-8 text-lg">النظام جاهز للعمل. قم بتسجيل الدخول للإدارة.</p>
            <% if (user) { %>
                <a href="/dashboard" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg">انتقل للوحة التحكم</a>
            <% } else { %>
                <a href="/login" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-lg">تسجيل الدخول عبر ديسكورد</a>
            <% } %>
        <% } %>
    </div>
</body>
</html>
`);

fs.writeFileSync(path.join(viewsDir, 'dashboard.ejs'), `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><title>لوحة التحكم</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Tajawal', sans-serif; }</style>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <nav class="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
        <div class="flex items-center space-x-4 space-x-reverse">
            <img src="https://cdn.discordapp.com/avatars/<%= user.id %>/<%= user.avatar %>.png" class="w-10 h-10 rounded-full">
            <span class="font-bold"><%= user.username %></span>
        </div>
        <a href="/logout" class="text-red-400">خروج</a>
    </nav>
    <div class="container mx-auto py-10 px-4">
        <div class="bg-gray-800 p-8 rounded-2xl border border-gray-700 shadow-xl max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-6 border-b border-gray-700 pb-4">إعدادات البوت واليوزرات</h2>
            <form action="/update-config" method="POST" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
                    <div>
                        <label class="block text-gray-400 mb-2">السيرفر المستهدف</label>
                        <select name="guildId" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                            <option value="">-- اختر سيرفر --</option>
                            <% guilds.forEach(guild => { %>
                                <option value="<%= guild.id %>" <%= config.targetGuildId === guild.id ? 'selected' : '' %>><%= guild.name %></option>
                            <% }) %>
                        </select>
                    </div>
                    <div>
                        <label class="block text-gray-400 mb-2">ID الروم لإرسال اليوزرات</label>
                        <input type="text" name="channelId" value="<%= config.targetChannelId %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                    </div>
                </div>
                <hr class="border-gray-700">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
                    <div>
                        <label class="block text-gray-400 mb-2">Bot Token</label>
                        <input type="password" name="botToken" value="<%= config.botToken %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                    </div>
                    <div>
                        <label class="block text-gray-400 mb-2">Callback URL</label>
                        <input type="text" name="callbackURL" value="<%= config.callbackURL %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                    </div>
                </div>
                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg shadow-lg transition">حفظ التغييرات</button>
            </form>
        </div>
    </div>
</body>
</html>
`);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Dashboard is running on port ${PORT}`);
});
