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

            let description = 'إليك قائمة باليوزرات الثلاثية أو شبه الثلاثية في هذا السيرفر:\n\n';
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

client.on('messageCreate', async (message) => {
    if (message.content === '!check' && config.adminIds.includes(message.author.id)) {
        await checkThreeCharUsers();
        message.reply('✅ تم فحص اليوزرات وإرسال النتائج للروم المحدد.');
    }
});

if (config.botToken) {
    client.login(config.botToken).catch(err => console.error("Bot login failed. Check your token."));
} else {
    console.log("Waiting for Bot Token to be configured...");
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

// Passport Setup - Wrapped in a function to handle missing credentials
function setupPassport() {
    if (!config.clientId || !config.clientSecret || !config.callbackURL) {
        console.log("OAuth2 credentials missing. Dashboard login will be disabled until configured.");
        return;
    }
    
    passport.use(new DiscordStrategy({
        clientID: config.clientId,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackURL,
        scope: ['identify', 'guilds']
    }, (accessToken, refreshToken, profile, done) => {
        process.nextTick(() => done(null, profile));
    }));

    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((obj, done) => done(null, obj));
}

setupPassport();

app.use(passport.initialize());
app.use(passport.session());

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) {
        if (config.adminIds.length === 0 || config.adminIds.includes(req.user.id)) {
            return next();
        }
        return res.send('Access Denied: You are not an authorized admin.');
    }
    res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.user, configMissing: !config.clientId });
});

app.get('/login', (req, res, next) => {
    if (!config.clientId) return res.send("Config missing. Please set CLIENT_ID in environment or config.json");
    passport.authenticate('discord')(req, res, next);
});

app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', checkAuth, (req, res) => {
    const guilds = client.isReady() ? client.guilds.cache.map(g => ({ id: g.id, name: g.name })) : [];
    res.render('dashboard', { 
        user: req.user, 
        config, 
        guilds,
        botUser: client.user
    });
});

app.post('/update-config', checkAuth, (req, res) => {
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
    
    // Restart logic or re-init if needed
    if (!client.isReady() && config.botToken) {
        client.login(config.botToken).catch(console.error);
    }
    setupPassport();

    res.redirect('/dashboard?success=true');
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// --- Views Setup ---
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir);

const indexEjs = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نظام جلب اليوزرات - الرئيسية</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Tajawal', sans-serif; }</style>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center">
    <div class="max-w-md w-full p-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 text-center">
        <h1 class="text-4xl font-bold mb-6 text-blue-500">نظام اليوزرات</h1>
        <p class="text-gray-400 mb-8 text-lg">أهلاً بك في أقوى لوحة تحكم لإدارة بوت جلب اليوزرات الثلاثية.</p>
        <% if (configMissing) { %>
            <div class="bg-red-900/30 border border-red-500 text-red-200 p-4 rounded-lg mb-6">
                تنبيه: لم يتم ضبط إعدادات Discord OAuth بعد. يرجى ضبطها في ملف الإعدادات أو البيئة.
            </div>
        <% } %>
        <% if (user) { %>
            <a href="/dashboard" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full transition duration-300 transform hover:scale-105 shadow-lg">
                انتقل للوحة التحكم
            </a>
        <% } else { %>
            <a href="/login" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full transition duration-300 transform hover:scale-105 shadow-lg">
                تسجيل الدخول عبر ديسكورد
            </a>
        <% } %>
    </div>
</body>
</html>
`;

const dashboardEjs = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة التحكم - الإعدادات</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Tajawal', sans-serif; }</style>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <nav class="bg-gray-800 border-b border-gray-700 p-4 shadow-md">
        <div class="container mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-4 space-x-reverse">
                <img src="https://cdn.discordapp.com/avatars/<%= user.id %>/<%= user.avatar %>.png" class="w-10 h-10 rounded-full border-2 border-blue-500">
                <span class="font-bold text-xl"><%= user.username %></span>
            </div>
            <div class="text-blue-500 font-bold">لوحة التحكم الاحترافية</div>
            <a href="/logout" class="text-red-400 hover:text-red-300">خروج</a>
        </div>
    </nav>

    <div class="container mx-auto py-10 px-4">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-1 space-y-6">
                <div class="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl">
                    <h3 class="text-xl font-bold mb-4 text-blue-400">حالة البوت</h3>
                    <div class="flex items-center space-x-3 space-x-reverse">
                        <div class="w-3 h-3 <%= botUser ? 'bg-green-500 animate-pulse' : 'bg-red-500' %> rounded-full"></div>
                        <p class="text-gray-300">البوت: <span class="text-white font-bold"><%= botUser ? botUser.username : 'غير متصل' %></span></p>
                    </div>
                </div>
            </div>

            <div class="lg:col-span-2">
                <div class="bg-gray-800 p-8 rounded-2xl border border-gray-700 shadow-xl">
                    <h2 class="text-2xl font-bold mb-6 border-b border-gray-700 pb-4">إعدادات النظام</h2>
                    <form action="/update-config" method="POST" class="space-y-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-gray-400 mb-2">توكن البوت (Bot Token)</label>
                                <input type="password" name="botToken" value="<%= config.botToken %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:outline-none focus:border-blue-500">
                            </div>
                            <div>
                                <label class="block text-gray-400 mb-2">Client ID</label>
                                <input type="text" name="clientId" value="<%= config.clientId %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:outline-none focus:border-blue-500">
                            </div>
                            <div>
                                <label class="block text-gray-400 mb-2">Client Secret</label>
                                <input type="password" name="clientSecret" value="<%= config.clientSecret %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:outline-none focus:border-blue-500">
                            </div>
                            <div>
                                <label class="block text-gray-400 mb-2">Callback URL</label>
                                <input type="text" name="callbackURL" value="<%= config.callbackURL %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:outline-none focus:border-blue-500">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-gray-400 mb-2">اختر السيرفر المستهدف</label>
                                <select name="guildId" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                                    <option value="">-- اختر سيرفر --</option>
                                    <% guilds.forEach(guild => { %>
                                        <option value="<%= guild.id %>" <%= config.targetGuildId === guild.id ? 'selected' : '' %>><%= guild.name %></option>
                                    <% }) %>
                                </select>
                            </div>
                            <div>
                                <label class="block text-gray-400 mb-2">ID الروم (Channel ID)</label>
                                <input type="text" name="channelId" value="<%= config.targetChannelId %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                            </div>
                        </div>
                        <div>
                            <label class="block text-gray-400 mb-2">الأدمن المسموح لهم (Discord IDs)</label>
                            <input type="text" name="adminIds" value="<%= config.adminIds.join(', ') %>" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3">
                        </div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg shadow-lg">حفظ الإعدادات</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
`;

fs.writeFileSync(path.join(viewsDir, 'index.ejs'), indexEjs);
fs.writeFileSync(path.join(viewsDir, 'dashboard.ejs'), dashboardEjs);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Dashboard is running on http://localhost:${PORT}`);
});
