const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// --- الإعدادات الأولية ---
const app = express();
const port = process.env.PORT || 3000;

// تخزين الإعدادات (في الواقع يفضل استخدام قاعدة بيانات، لكن للتبسيط سنستخدم كائن في الذاكرة)
let botSettings = {
    color: '#ff0000',
    maxPlayers: 10,
    allowedRole: '',
    targetChannel: '',
    guilds: {}
};

// --- إعداد بوت ديسكورد ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// أمر تشغيل الروليت
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // التحقق من الرتبة المسموح لها (إذا كانت محددة)
    const guildSettings = botSettings.guilds[message.guild.id] || botSettings;
    if (guildSettings.allowedRole && !message.member.roles.cache.has(guildSettings.allowedRole)) return;

    if (message.content === '!roulette') {
        if (guildSettings.targetChannel && message.channel.id !== guildSettings.targetChannel) {
            return message.reply(`هذا الأمر يعمل فقط في الروم المحدد: <#${guildSettings.targetChannel}>`);
        }

        const members = await message.guild.members.fetch();
        const humanMembers = members.filter(m => !m.user.bot).first(guildSettings.maxPlayers || 10);
        
        if (humanMembers.length < 2) {
            return message.reply('لا يوجد عدد كافٍ من الأعضاء لبدء اللعبة.');
        }

        const players = humanMembers.map(m => ({
            id: m.id,
            username: m.user.username,
            avatar: m.user.displayAvatarURL({ extension: 'png' })
        }));

        const embed = new EmbedBuilder()
            .setTitle('X-Gamer Roulette')
            .setDescription('اضغط على الزر أدناه لمشاهدة السحب المباشر!')
            .setColor(guildSettings.color || '#ff0000')
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('مشاهدة الروليت')
                    .setURL(`${process.env.DOMAIN || 'http://localhost:3000'}/view/${message.guild.id}?p=${encodeURIComponent(JSON.stringify(players))}`)
                    .setStyle(ButtonStyle.Link)
            );

        message.channel.send({ embeds: [embed], components: [row] });
    }
});

// --- إعداد Passport و Discord OAuth2 ---
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${process.env.DOMAIN || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

app.use(session({
    secret: 'x-gamer-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

// --- مسارات الويب (Frontend) ---

// الصفحة الرئيسية وتسجيل الدخول
app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.send(renderPage('Home', `
        <div class="hero-section text-center py-20">
            <h1 class="text-6xl font-bold mb-6 animate-pulse text-red-600">X-GAMER</h1>
            <p class="text-xl mb-10 text-gray-400">نظام الروليت الأكثر قوة واحترافية في ديسكورد</p>
            <a href="/auth/discord" class="bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-full font-bold transition-all transform hover:scale-110">
                تسجيل الدخول عبر ديسكورد
            </a>
        </div>
    `));
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

// لوحة التحكم
app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    
    const userGuilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8); // السيرفرات التي يملك فيها صلاحية Admin
    
    let guildListHtml = userGuilds.map(g => `
        <div class="guild-card bg-zinc-900 p-4 rounded-xl mb-4 flex items-center justify-between border-l-4 border-transparent hover:border-red-600 transition-all cursor-pointer" onclick="window.location='/dashboard/${g.id}'">
            <div class="flex items-center">
                <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-12 h-12 rounded-full mr-4">
                <span class="text-lg font-semibold">${g.name}</span>
            </div>
            <i class="fas fa-chevron-right text-gray-600"></i>
        </div>
    `).join('');

    res.send(renderPage('Dashboard', `
        <div class="flex h-screen overflow-hidden">
            <!-- Sidebar -->
            <div class="w-80 bg-black border-r border-zinc-800 p-6 overflow-y-auto">
                <h2 class="text-2xl font-bold mb-8 text-red-600">X-GAMER</h2>
                <div class="space-y-2">
                    <p class="text-xs text-gray-500 uppercase tracking-widest mb-4">السيرفرات الخاصة بك</p>
                    ${guildListHtml}
                </div>
            </div>
            <!-- Main Content -->
            <div class="flex-1 bg-zinc-950 p-10 overflow-y-auto">
                <div class="flex justify-between items-center mb-10">
                    <h1 class="text-3xl font-bold">مرحباً بك، ${req.user.username}</h1>
                    <a href="/logout" class="text-gray-400 hover:text-white">تسجيل الخروج</a>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="bg-zinc-900 p-8 rounded-2xl border border-zinc-800">
                        <h3 class="text-xl font-bold mb-4">إحصائيات سريعة</h3>
                        <p class="text-gray-400">اختر سيرفر من القائمة الجانبية للبدء في تخصيص إعدادات الروليت.</p>
                    </div>
                </div>
            </div>
        </div>
    `, true));
});

// إعدادات سيرفر محدد
app.get('/dashboard/:guildID', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    const guildID = req.params.guildID;
    const guild = req.user.guilds.find(g => g.id === guildID);
    if (!guild || (guild.permissions & 0x8) !== 0x8) return res.redirect('/dashboard');

    const settings = botSettings.guilds[guildID] || { ...botSettings };

    res.send(renderPage('Server Settings', `
        <div class="flex h-screen overflow-hidden">
            <!-- Sidebar (Same as dashboard) -->
            <div class="w-80 bg-black border-r border-zinc-800 p-6 overflow-y-auto">
                <h2 class="text-2xl font-bold mb-8 text-red-600 cursor-pointer" onclick="window.location='/dashboard'">X-GAMER</h2>
                <div class="space-y-2">
                    <p class="text-xs text-gray-500 uppercase tracking-widest mb-4">السيرفرات الخاصة بك</p>
                    ${req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8).map(g => `
                        <div class="guild-card bg-zinc-900 p-4 rounded-xl mb-4 flex items-center justify-between border-l-4 ${g.id === guildID ? 'border-red-600 bg-zinc-800' : 'border-transparent'} hover:border-red-600 transition-all cursor-pointer" onclick="window.location='/dashboard/${g.id}'">
                            <div class="flex items-center">
                                <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-10 h-10 rounded-full mr-3">
                                <span class="text-sm font-semibold truncate w-32">${g.name}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <!-- Settings Form -->
            <div class="flex-1 bg-zinc-950 p-10 overflow-y-auto">
                <div class="flex items-center mb-10">
                    <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-16 h-16 rounded-full mr-6 border-2 border-red-600">
                    <div>
                        <h1 class="text-3xl font-bold">${guild.name}</h1>
                        <p class="text-gray-400">تخصيص إعدادات الروليت</p>
                    </div>
                </div>

                <div class="max-w-4xl space-y-8">
                    <div class="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
                        <h3 class="text-xl font-bold mb-6 text-red-500">الألوان والمظهر</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">لون اللعبة الأساسي</label>
                                <input type="color" id="gameColor" value="${settings.color}" class="w-full h-12 bg-zinc-800 border-none rounded-lg cursor-pointer">
                            </div>
                        </div>
                    </div>

                    <div class="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
                        <h3 class="text-xl font-bold mb-6 text-red-500">إعدادات اللعبة</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">عدد اللاعبين الكامل</label>
                                <input type="number" id="maxPlayers" value="${settings.maxPlayers}" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">روم اللعبة (ID)</label>
                                <input type="text" id="targetChannel" value="${settings.targetChannel}" placeholder="أدخل ID الروم هنا" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">رتبة التحكم (ID)</label>
                                <input type="text" id="allowedRole" value="${settings.allowedRole}" placeholder="أدخل ID الرتبة هنا" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                            </div>
                        </div>
                    </div>

                    <button onclick="saveSettings('${guildID}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-red-900/20">
                        حفظ الإعدادات النارية
                    </button>
                </div>
            </div>
        </div>
        <script>
            async function saveSettings(guildID) {
                const data = {
                    color: document.getElementById('gameColor').value,
                    maxPlayers: document.getElementById('maxPlayers').value,
                    targetChannel: document.getElementById('targetChannel').value,
                    allowedRole: document.getElementById('allowedRole').value
                };
                const res = await fetch('/api/settings/' + guildID, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if(res.ok) alert('تم الحفظ بنجاح يوحش!');
                else alert('حدث خطأ أثناء الحفظ.');
            }
        </script>
    `, true));
});

// API لحفظ الإعدادات
app.post('/api/settings/:guildID', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
    const guildID = req.params.guildID;
    botSettings.guilds[guildID] = {
        color: req.body.color,
        maxPlayers: parseInt(req.body.maxPlayers),
        targetChannel: req.body.targetChannel,
        allowedRole: req.body.allowedRole
    };
    res.sendStatus(200);
});

// عرض الروليت (Slider)
app.get('/view/:guildID', (req, res) => {
    const players = JSON.parse(decodeURIComponent(req.query.p || '[]'));
    const guildID = req.params.guildID;
    const settings = botSettings.guilds[guildID] || botSettings;
    const color = settings.color || '#ff0000';

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>X-Gamer Roulette</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body { background: #000; color: white; font-family: sans-serif; overflow: hidden; }
                .roulette-container { position: relative; width: 100%; height: 300px; margin-top: 100px; overflow: hidden; border-top: 2px solid ${color}; border-bottom: 2px solid ${color}; background: rgba(0,0,0,0.5); }
                .slider { display: flex; position: absolute; left: 0; transition: transform 8s cubic-bezier(0.1, 0, 0.1, 1); }
                .card { min-width: 200px; height: 250px; margin: 25px 10px; background: #111; border: 2px solid #222; border-radius: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.3s; }
                .card.active { border-color: ${color}; box-shadow: 0 0 20px ${color}; transform: scale(1.1); }
                .pointer { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 4px; height: 100%; background: ${color}; z-index: 10; box-shadow: 0 0 15px ${color}; }
                .pointer::after { content: ''; position: absolute; top: -10px; left: -8px; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 15px solid ${color}; }
                .avatar { width: 100px; height: 100px; border-radius: 50%; border: 3px solid ${color}; margin-bottom: 15px; }
                .fire-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: radial-gradient(circle at center, ${color}33 0%, #000 70%); }
            </style>
        </head>
        <body>
            <div class="fire-bg"></div>
            <div class="text-center mt-10">
                <h1 class="text-5xl font-bold" style="color: ${color}; text-shadow: 0 0 10px ${color}">X-GAMER ROULETTE</h1>
            </div>

            <div class="roulette-container">
                <div class="pointer"></div>
                <div class="slider" id="slider"></div>
            </div>

            <div class="text-center mt-10">
                <button id="spinBtn" class="bg-red-600 text-white px-12 py-4 rounded-full text-2xl font-bold hover:scale-110 transition-all shadow-xl">ابدأ السحب يوحش</button>
                <h2 id="winner" class="text-4xl font-bold mt-10 hidden animate-bounce"></h2>
            </div>

            <script>
                const players = ${JSON.stringify(players)};
                const slider = document.getElementById('slider');
                const spinBtn = document.getElementById('spinBtn');
                const winnerText = document.getElementById('winner');
                
                // تكرار اللاعبين لجعل السلايدر يبدو طويلاً
                const items = [];
                for(let i=0; i<10; i++) items.push(...players);
                
                items.forEach((p, index) => {
                    const div = document.createElement('div');
                    div.className = 'card';
                    div.innerHTML = \`
                        <img src="\${p.avatar}" class="avatar">
                        <span class="text-xl font-bold">\${p.username}</span>
                    \`;
                    slider.appendChild(div);
                });

                spinBtn.onclick = () => {
                    spinBtn.disabled = true;
                    spinBtn.style.opacity = '0.5';
                    const cardWidth = 220;
                    const totalItems = items.length;
                    const winningIndex = Math.floor(Math.random() * players.length) + (totalItems - players.length * 2);
                    const offset = (winningIndex * cardWidth) - (window.innerWidth / 2) + (cardWidth / 2);
                    
                    slider.style.transform = \`translateX(\${offset}px)\`;
                    
                    setTimeout(() => {
                        const winner = items[winningIndex];
                        winnerText.innerText = 'الفائز هو: ' + winner.username;
                        winnerText.classList.remove('hidden');
                        winnerText.style.color = '${color}';
                        
                        // تأثيرات نارية عند الفوز
                        confetti(); 
                    }, 8500);
                };
                
                function confetti() {
                    // هنا يمكن إضافة تأثيرات بصرية إضافية
                }
            </script>
        </body>
        </html>
    `);
});

// دالة مساعدة لرندرة الصفحات
function renderPage(title, content, noNav = false) {
    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} | X-Gamer</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
                body { background-color: #050505; color: #fff; font-family: 'Cairo', sans-serif; }
                .animate-fire { animation: fire 2s infinite alternate; }
                @keyframes fire { from { text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000; } to { text-shadow: 0 0 20px #ff4500, 0 0 40px #ff4500; } }
                .guild-card:hover { transform: translateX(-5px); }
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-track { background: #000; }
                ::-webkit-scrollbar-thumb { background: #ff0000; border-radius: 10px; }
            </style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `;
}

// تشغيل السيرفر والبوت
client.login(process.env.TOKEN).catch(err => console.error('Discord Login Failed:', err));
app.listen(port, () => console.log(`Dashboard running at http://localhost:${port}`));
