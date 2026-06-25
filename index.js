const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// --- Data Storage (Using JSON to persist selection) ---
const dbPath = './db.json';
let db = { targetGuildId: '', targetChannelId: '', adminIds: [] };
if (fs.existsSync(dbPath)) db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 4));

// --- Discord Bot ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

client.on('ready', () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    startScanner();
});

// Simulation of a global scanner (Discord doesn't allow searching "all discord" directly, 
// so we scan all guilds the bot is in)
async function startScanner() {
    setInterval(async () => {
        if (!db.targetGuildId || !db.targetChannelId) return;
        
        const targetGuild = client.guilds.cache.get(db.targetGuildId);
        const targetChannel = targetGuild?.channels.cache.get(db.targetChannelId);
        if (!targetChannel) return;

        // Logic: Scan all guilds the bot is in for 3-char users
        let foundUsers = [];
        for (const [id, guild] of client.guilds.cache) {
            try {
                const members = await guild.members.fetch();
                const rare = members.filter(m => m.user.username.length <= 3 && !m.user.bot);
                rare.forEach(m => foundUsers.push({ name: m.user.username, guild: guild.name, id: m.user.id }));
            } catch (e) {}
        }

        if (foundUsers.length > 0) {
            // Remove duplicates and send unique ones
            const unique = [...new Map(foundUsers.map(item => [item.name, item])).values()].slice(0, 10);
            
            const embed = new EmbedBuilder()
                .setTitle('💎 تم اصطياد يوزرات نادرة!')
                .setDescription(`تم فحص جميع السيرفرات المتصلة والعثور على اليوزرات التالية:`)
                .setColor('#00ffcc')
                .setThumbnail(client.user.displayAvatarURL())
                .setTimestamp();

            unique.forEach(u => {
                embed.addFields({ name: `👤 ${u.name}`, value: `ID: \`${u.id}\` | سيرفر: \`${u.guild}\``, inline: false });
            });

            await targetChannel.send({ embeds: [embed] });
        }
    }, 15 * 60 * 1000); // Every 15 mins
}

client.login(process.env.BOT_TOKEN).catch(e => console.error("Bot Login Failed"));

// --- Express App ---
const app = express();
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'ultra-secret', resave: false, saveUninitialized: false }));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL,
    scope: ['identify', 'guilds']
}, (at, rt, profile, done) => done(null, profile)));

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));
app.use(passport.initialize());
app.use(passport.session());

// Middleware
const isAuth = (req, res, next) => req.isAuthenticated() ? next() : res.redirect('/');

// Routes
app.get('/', (req, res) => res.render('login'));
app.get('/auth', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', isAuth, (req, res) => {
    const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
    res.render('dashboard', { user: req.user, guilds, db });
});

// API to get channels for a guild
app.get('/api/channels/:guildId', isAuth, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.json([]);
    const channels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ id: c.id, name: c.name }));
    res.json(channels);
});

app.post('/save', isAuth, (req, res) => {
    db.targetGuildId = req.body.guildId;
    db.targetChannelId = req.body.channelId;
    saveDB();
    res.redirect('/dashboard?success=1');
});

app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// --- Views ---
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir);

fs.writeFileSync(path.join(viewsDir, 'login.ejs'), `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8"><title>تسجيل الدخول</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Cairo', sans-serif; background: radial-gradient(circle at top right, #1e1b4b, #0f172a); }</style>
</head>
<body class="text-white min-h-screen flex items-center justify-center">
    <div class="bg-white/5 backdrop-blur-xl p-10 rounded-3xl border border-white/10 shadow-2xl text-center max-w-sm w-full">
        <div class="w-20 h-20 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/50">
            <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        </div>
        <h1 class="text-3xl font-bold mb-2">نظام اليوزرات</h1>
        <p class="text-gray-400 mb-8">أهلاً بك، سجل دخولك للبدء في صيد اليوزرات النادرة.</p>
        <a href="/auth" class="block w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl font-bold transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-indigo-600/20">تسجيل الدخول عبر ديسكورد</a>
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
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Cairo', sans-serif; background: #0f172a; }</style>
</head>
<body class="text-white">
    <nav class="bg-white/5 border-b border-white/10 p-6">
        <div class="container mx-auto flex justify-between items-center">
            <div class="flex items-center gap-4">
                <img src="https://cdn.discordapp.com/avatars/<%= user.id %>/<%= user.avatar %>.png" class="w-12 h-12 rounded-full ring-2 ring-indigo-500">
                <div>
                    <p class="font-bold text-lg"><%= user.username %></p>
                    <p class="text-xs text-gray-400">مسؤول النظام</p>
                </div>
            </div>
            <a href="/logout" class="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg hover:bg-red-500 hover:text-white transition">خروج</a>
        </div>
    </nav>

    <main class="container mx-auto py-12 px-4">
        <div class="max-w-3xl mx-auto">
            <div class="bg-white/5 border border-white/10 p-8 rounded-3xl shadow-2xl">
                <h2 class="text-2xl font-bold mb-8 flex items-center gap-3">
                    <span class="w-2 h-8 bg-indigo-500 rounded-full"></span>
                    إعدادات الصيد المستهدف
                </h2>
                
                <form action="/save" method="POST" class="space-y-8">
                    <div class="space-y-4">
                        <label class="block text-gray-400 font-medium">اختر السيرفر</label>
                        <select name="guildId" id="guildSelect" class="w-full bg-white/5 border border-white/10 p-4 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500 transition cursor-pointer">
                            <option value="">-- اختر السيرفر المستهدف --</option>
                            <% guilds.forEach(g => { %>
                                <option value="<%= g.id %>" <%= db.targetGuildId === g.id ? 'selected' : '' %>><%= g.name %></option>
                            <% }) %>
                        </select>
                    </div>

                    <div class="space-y-4">
                        <label class="block text-gray-400 font-medium">اختر الروم (قناة النتائج)</label>
                        <select name="channelId" id="channelSelect" class="w-full bg-white/5 border border-white/10 p-4 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500 transition cursor-pointer">
                            <option value="">-- اختر القناة أولاً --</option>
                        </select>
                    </div>

                    <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 py-5 rounded-2xl font-bold text-xl transition-all shadow-xl shadow-indigo-600/20">حفظ الإعدادات وبدء الفحص</button>
                </form>
            </div>
        </div>
    </main>

    <script>
        const guildSelect = document.getElementById('guildSelect');
        const channelSelect = document.getElementById('channelSelect');
        const savedChannelId = "<%= db.targetChannelId %>";

        async function loadChannels(guildId) {
            if(!guildId) return;
            const res = await fetch('/api/channels/' + guildId);
            const channels = await res.json();
            channelSelect.innerHTML = '<option value="">-- اختر القناة --</option>';
            channels.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = '#' + c.name;
                if(c.id === savedChannelId) opt.selected = true;
                channelSelect.appendChild(opt);
            });
        }

        guildSelect.addEventListener('change', (e) => loadChannels(e.target.value));
        if(guildSelect.value) loadChannels(guildSelect.value);
    </script>
</body>
</html>
`);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 System running on port ${PORT}`));
