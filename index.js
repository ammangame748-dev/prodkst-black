
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
require('dotenv').config();

// ============================================
// 📊 نظام البيانات والإعدادات
// ============================================

// بنية البيانات الرئيسية
let gameData = {
    users: {}, // { userID: { points: 0, properties: [] } }
    guilds: {}, // { guildID: { settings, roulette } }
    activeGames: new Map() // { messageID: { players, winner, status } }
};

// الخصائص المتاحة في المتجر
const PROPERTIES = {
    'extra_life': {
        name: '🛡️ روح إضافية',
        description: 'حماية من الطرد مرة واحدة',
        price: 70,
        emoji: '🛡️'
    },
    'protection': {
        name: '🔒 حماية من الطرد',
        description: 'لا تُطرد في هذه الجولة',
        price: 80,
        emoji: '🔒'
    },
    'double_kick': {
        name: '⚡ طرد مزدوج',
        description: 'اطرد شخصين بدلاً من واحد',
        price: 90,
        emoji: '⚡'
    }
};

// --- إعداد بوت ديسكورد ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.on('ready', (c) => {
    console.log(`✅ Logged in as ${c.user.tag}!`);
    client.user.setActivity('X-Gamer Roulette 🎰', { type: 'PLAYING' });
});

// ============================================
// 🎮 محرك اللعبة داخل ديسكورد
// ============================================

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    // تهيئة بيانات المستخدم
    if (!gameData.users[userId]) {
        gameData.users[userId] = { points: 0, properties: [] };
    }

    // --- زر الدخول للعبة (Join) ---
    if (interaction.customId === 'btn_join') {
        const embed = interaction.message.embeds[0];
        const description = embed.description || '';

        if (description.includes(userId)) {
            return interaction.reply({ content: '❌ أنت بالفعل في اللعبة!', ephemeral: true });
        }

        const newDescription = description + `\n✅ <@${userId}>`;
        const updatedEmbed = EmbedBuilder.from(embed).setDescription(newDescription);

        await interaction.message.edit({ embeds: [updatedEmbed] });
        await interaction.reply({ content: '✅ تم إضافتك للعبة!', ephemeral: true });
    }

    // --- زر الخروج من العبة (Leave) ---
    if (interaction.customId === 'btn_leave') {
        const embed = interaction.message.embeds[0];
        let description = embed.description || '';

        if (!description.includes(userId)) {
            return interaction.reply({ content: '❌ أنت لست في اللعبة!', ephemeral: true });
        }

        description = description.replace(`\n✅ <@${userId}>`, '').replace(`✅ <@${userId}>`, '');
        const updatedEmbed = EmbedBuilder.from(embed).setDescription(description);

        await interaction.message.edit({ embeds: [updatedEmbed] });
        await interaction.reply({ content: '❌ تم إزالتك من اللعبة!', ephemeral: true });
    }

    // --- زر المتجر (Store) ---
    if (interaction.customId === 'btn_store') {
        const userPoints = gameData.users[userId]?.points || 0;
        const userProperties = gameData.users[userId]?.properties || [];

        let storeEmbed = new EmbedBuilder()
            .setTitle('🛍️ متجر الخصائص')
            .setColor('#FFD700')
            .setDescription(`💰 **نقاطك الحالية:** ${userPoints}\n\n**الخصائص المتاحة:**`);

        Object.entries(PROPERTIES).forEach(([key, prop]) => {
            const owned = userProperties.includes(key) ? '✅' : '❌';
            storeEmbed.addFields({
                name: `${prop.emoji} ${prop.name}`,
                value: `${prop.description}\n💵 السعر: ${prop.price} نقطة ${owned}`,
                inline: false
            });
        });

        const storeRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('store_select')
                    .setPlaceholder('اختر خاصية لشرائها')
                    .addOptions(
                        Object.entries(PROPERTIES).map(([key, prop]) => ({
                            label: prop.name,
                            value: key,
                            emoji: prop.emoji
                        }))
                    )
            );

        await interaction.reply({ embeds: [storeEmbed], components: [storeRow], ephemeral: true });
    }

    // --- قائمة المتجر (Store Select Menu) ---
    if (interaction.customId === 'store_select') {
        const propertyKey = interaction.values[0];
        const property = PROPERTIES[propertyKey];
        const userPoints = gameData.users[userId]?.points || 0;

        if (userPoints < property.price) {
            const needed = property.price - userPoints;
            return interaction.reply({
                content: `❌ ليس لديك نقاط كافية!\n💰 تحتاج ${needed} نقطة إضافية (لديك ${userPoints} من ${property.price})`,
                ephemeral: true
            });
        }

        gameData.users[userId].points -= property.price;
        if (!gameData.users[userId].properties.includes(propertyKey)) {
            gameData.users[userId].properties.push(propertyKey);
        }

        await interaction.reply({
            content: `✅ تم شراء ${property.emoji} ${property.name} بنجاح!\n💰 نقاطك المتبقية: ${gameData.users[userId].points}`,
            ephemeral: true
        });
    }

    // --- زر بدء اللعبة (Start Game) ---
    if (interaction.customId === 'btn_start_game') {
        const embed = interaction.message.embeds[0];
        const description = embed.description || '';

        // استخراج اللاعبين من الوصف
        const playerMatches = description.match(/<@(\d+)>/g) || [];
        if (playerMatches.length < 2) {
            return interaction.reply({ content: '❌ يجب أن يكون هناك لاعبين على الأقل!', ephemeral: true });
        }

        const players = playerMatches.map(m => m.match(/\d+/)[0]);
        const winner = players[Math.floor(Math.random() * players.length)];

        // حفظ اللعبة
        gameData.activeGames.set(interaction.message.id, {
            players,
            winner,
            kicked: [],
            status: 'running'
        });

        // إنشء Embed النتيجة
        const resultEmbed = new EmbedBuilder()
            .setTitle('🎰 نتيجة الروليت!')
            .setColor('#00FF00')
            .setDescription(`🏆 **الفائز:** <@${winner}>\n\n**اللاعبون:**\n${players.map(p => `• <@${p}>`).join('\n')}`)
            .setTimestamp();

        // إضافة النقاط للفائز
        gameData.users[winner].points += 15;

        // إنشاء أزرار الطرد
        const kickRow = new ActionRowBuilder();
        players.forEach(player => {
            if (player !== winner) {
                kickRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_kick_${player}`)
                        .setLabel(`اطرد ${player.substring(0, 4)}...`)
                        .setStyle(ButtonStyle.Danger)
                );
            }
        });

        await interaction.message.edit({ embeds: [resultEmbed], components: [kickRow] });
        await interaction.reply({ content: '✅ بدأت اللعبة!', ephemeral: true });
    }

    // --- أزرار الطرد ---
    if (interaction.customId.startsWith('btn_kick_')) {
        const kickedUserId = interaction.customId.replace('btn_kick_', '');
        const game = gameData.activeGames.get(interaction.message.id);

        if (!game) {
            return interaction.reply({ content: '❌ اللعبة انتهت!', ephemeral: true });
        }

        // التحقق من الحماية
        if (gameData.users[kickedUserId]?.properties.includes('protection')) {
            gameData.users[kickedUserId].properties = gameData.users[kickedUserId].properties.filter(p => p !== 'protection');
            return interaction.reply({ content: `🛡️ <@${kickedUserId}> محمي من الطرد!`, ephemeral: true });
        }

        // الطرد المزدوج
        let kickCount = 1;
        if (gameData.users[interaction.user.id]?.properties.includes('double_kick')) {
            kickCount = 2;
            gameData.users[interaction.user.id].properties = gameData.users[interaction.user.id].properties.filter(p => p !== 'double_kick');
        }

        // إضافة النقاط للاعب الذي طرد
        gameData.users[interaction.user.id].points += 7 * kickCount;
        game.kicked.push(kickedUserId);

        await interaction.reply({
            content: `⚡ تم طرد <@${kickedUserId}>! حصلت على ${7 * kickCount} نقطة!`,
            ephemeral: true
        });
    }
});

// ============================================
// 💬 أوامر الدردشة
// ============================================

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guildId;
    const userId = message.author.id;

    // تهيئة بيانات السيرفر
    if (!gameData.guilds[guildId]) {
        gameData.guilds[guildId] = {
            settings: {
                color: '#ff0000',
                maxPlayers: 10,
                command: '!roulette',
                allowedRole: '',
                targetChannel: ''
            },
            roulette: {}
        };
    }

    const guildSettings = gameData.guilds[guildId].settings;
    const commandPrefix = guildSettings.command || '!roulette';

    // --- أمر بدء اللعبة ---
    if (message.content.trim() === commandPrefix) {
        // التحقق من الصلاحيات
        if (guildSettings.allowedRole && !message.member.roles.cache.has(guildSettings.allowedRole)) {
            return message.reply('❌ ليس لديك صلاحية لتشغيل هذا الأمر!');
        }

        if (guildSettings.targetChannel && message.channel.id !== guildSettings.targetChannel) {
            return message.reply(`❌ هذا الأمر يعمل فقط في <#${guildSettings.targetChannel}>`);
        }

        // إنشاء Embed اللعبة
        const gameEmbed = new EmbedBuilder()
            .setTitle('🎰 X-Gamer Roulette')
            .setDescription('✅ اضغط على الأزرار للدخول أو الخروج من اللعبة')
            .setColor(guildSettings.color)
            .addFields(
                { name: '👥 اللاعبون:', value: 'لم يدخل أحد بعد', inline: false },
                { name: '💰 الجائزة:', value: '15 نقطة للفائز + 7 نقاط لكل طرد', inline: false }
            )
            .setTimestamp();

        // إنشاء الأزرار
        const gameRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_join')
                    .setLabel('دخول 🟢')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('btn_leave')
                    .setLabel('خروج 🔴')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('btn_store')
                    .setLabel('متجر 🛍️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('btn_start_game')
                    .setLabel('بدء اللعبة ▶️')
                    .setStyle(ButtonStyle.Secondary)
            );

        await message.channel.send({ embeds: [gameEmbed], components: [gameRow] });
    }

    // --- أمر عرض النقاط ---
    if (message.content.trim() === '!points' || message.content.trim() === '!نقاطي') {
        const userPoints = gameData.users[userId]?.points || 0;
        const userProperties = gameData.users[userId]?.properties || [];

        let pointsEmbed = new EmbedBuilder()
            .setTitle('📊 إحصائياتك')
            .setColor('#FFD700')
            .setDescription(`💰 **نقاطك:** ${userPoints}\n\n**خصائصك:**`);

        if (userProperties.length === 0) {
            pointsEmbed.addFields({ name: 'لا توجد خصائص', value: 'اشتري خصائص من المتجر!' });
        } else {
            userProperties.forEach(prop => {
                const property = PROPERTIES[prop];
                if (property) {
                    pointsEmbed.addFields({ name: property.emoji + ' ' + property.name, value: property.description });
                }
            });
        }

        await message.reply({ embeds: [pointsEmbed] });
    }
});

// ============================================
// 🌐 لوحة التحكم (Express)
// ============================================

const app = express();
const port = process.env.PORT || 3000;
const domain = process.env.DOMAIN || `http://localhost:${port}`;

// Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'x-gamer-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

// Passport Configuration
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${domain}/auth/discord/callback`,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

// دالة مساعدة لرسم الصفحات
function renderPage(title, content) {
    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - X-GAMER</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            body { background-color: #050505; color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        </style>
    </head>
    <body>
        ${content}
    </body>
    </html>`;
}

// --- الصفحة الرئيسية ---
app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.send(renderPage('Home', `
        <div class="min-h-screen bg-gradient-to-b from-red-900 to-black flex items-center justify-center">
            <div class="text-center">
                <h1 class="text-7xl font-bold mb-6 text-red-500 animate-pulse">🎰 X-GAMER</h1>
                <p class="text-2xl mb-10 text-gray-300">نظام الروليت الأكثر قوة واحترافية في ديسكورد</p>
                <a href="/auth/discord" class="bg-red-600 hover:bg-red-700 text-white px-12 py-4 rounded-full font-bold text-xl transition-all transform hover:scale-110 inline-block">
                    تسجيل الدخول عبر ديسكورد
                </a>
            </div>
        </div>
    `));
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

// --- لوحة التحكم الرئيسية ---
app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');

    const userGuilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8);

    let guildListHtml = userGuilds.map(g => `
        <div class="guild-card bg-zinc-900 p-4 rounded-xl mb-4 flex items-center justify-between border-l-4 border-transparent hover:border-red-600 transition-all cursor-pointer" onclick="window.location='/dashboard/${g.id}'">
            <div class="flex items-center">
                <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-12 h-12 rounded-full mr-4">
                <span class="text-lg font-semibold">${g.name}</span>
            </div>
            <i class="fas fa-chevron-left text-gray-600"></i>
        </div>
    `).join('');

    res.send(renderPage('Dashboard', `
        <div class="flex h-screen overflow-hidden">
            <div class="w-80 bg-black border-l border-zinc-800 p-6 overflow-y-auto">
                <h2 class="text-2xl font-bold mb-8 text-red-600">X-GAMER</h2>
                <div class="space-y-2">
                    <p class="text-xs text-gray-500 uppercase tracking-widest mb-4">السيرفرات الخاصة بك</p>
                    ${guildListHtml}
                </div>
            </div>
            <div class="flex-1 bg-zinc-950 p-10 overflow-y-auto">
                <div class="flex justify-between items-center mb-10">
                    <h1 class="text-3xl font-bold">مرحباً بك، ${req.user.username}</h1>
                    <a href="/logout" class="text-gray-400 hover:text-white">تسجيل الخروج</a>
                </div>
                <div class="bg-zinc-900 p-8 rounded-2xl border border-zinc-800">
                    <h3 class="text-xl font-bold mb-4">👋 أهلاً وسهلاً</h3>
                    <p class="text-gray-400">اختر سيرفر من القائمة الجانبية لتخصيص إعدادات الروليت والمتجر.</p>
                </div>
            </div>
        </div>
    `));
});

// --- إعدادات السيرفر ---
app.get('/dashboard/:guildID', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');

    const guildID = req.params.guildID;
    const guild = req.user.guilds.find(g => g.id === guildID);
    if (!guild || (guild.permissions & 0x8) !== 0x8) return res.redirect('/dashboard');

    const settings = gameData.guilds[guildID]?.settings || gameData.guilds[guildID]?.settings || {
        color: '#ff0000',
        maxPlayers: 10,
        command: '!roulette',
        allowedRole: '',
        targetChannel: ''
    };

    res.send(renderPage('Server Settings', `
        <div class="flex h-screen overflow-hidden">
            <div class="w-80 bg-black border-l border-zinc-800 p-6 overflow-y-auto">
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
            <div class="flex-1 bg-zinc-950 p-10 overflow-y-auto">
                <div class="flex items-center mb-10">
                    <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-16 h-16 rounded-full mr-6 border-2 border-red-600">
                    <div>
                        <h1 class="text-3xl font-bold">${guild.name}</h1>
                        <p class="text-gray-400">تخصيص إعدادات الروليت</p>
                    </div>
                </div>

                <div class="max-w-4xl space-y-8">
                    <!-- الألوان والمظهر -->
                    <div class="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
                        <h3 class="text-xl font-bold mb-6 text-red-500">🎨 الألوان والمظهر</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">لون اللعبة الأساسي</label>
                                <input type="color" id="gameColor" value="${settings.color}" class="w-full h-12 bg-zinc-800 border-none rounded-lg cursor-pointer">
                            </div>
                        </div>
                    </div>

                    <!-- إعدادات اللعبة -->
                    <div class="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
                        <h3 class="text-xl font-bold mb-6 text-red-500">⚙️ إعدادات اللعبة</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">أمر بدء اللعبة</label>
                                <input type="text" id="command" value="${settings.command}" placeholder="مثال: !roulette" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">عدد اللاعبين الأقصى</label>
                                <input type="number" id="maxPlayers" value="${settings.maxPlayers}" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">روم اللعبة</label>
                                <select id="targetChannel" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                                    <option value="">اختر روم (اختياري)</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">رتبة التحكم</label>
                                <select id="allowedRole" class="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg focus:outline-none focus:border-red-600 transition-all">
                                    <option value="">اختر رتبة (اختياري)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <button onclick="saveSettings('${guildID}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-red-900/20">
                        💾 حفظ الإعدادات
                    </button>
                </div>
            </div>
        </div>

        <script>
            // تحميل القنوات والرتب
            async function loadChannelsAndRoles() {
                try {
                    const response = await fetch('/api/guild/${guildID}/info');
                    const data = await response.json();

                    const channelSelect = document.getElementById('targetChannel');
                    const roleSelect = document.getElementById('allowedRole');

                    data.channels.forEach(channel => {
                        const option = document.createElement('option');
                        option.value = channel.id;
                        option.textContent = '#' + channel.name;
                        if (channel.id === '${settings.targetChannel}') option.selected = true;
                        channelSelect.appendChild(option);
                    });

                    data.roles.forEach(role => {
                        const option = document.createElement('option');
                        option.value = role.id;
                        option.textContent = '@' + role.name;
                        if (role.id === '${settings.allowedRole}') option.selected = true;
                        roleSelect.appendChild(option);
                    });
                } catch (error) {
                    console.error('خطأ في تحميل البيانات:', error);
                }
            }

            async function saveSettings(guildID) {
                const data = {
                    color: document.getElementById('gameColor').value,
                    maxPlayers: parseInt(document.getElementById('maxPlayers').value),
                    command: document.getElementById('command').value || '!roulette',
                    targetChannel: document.getElementById('targetChannel').value,
                    allowedRole: document.getElementById('allowedRole').value
                };

                try {
                    const res = await fetch('/api/settings/' + guildID, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (res.ok) {
                        alert('✅ تم الحفظ بنجاح!');
                    } else {
                        alert('❌ حدث خطأ أثناء الحفظ.');
                    }
                } catch (error) {
                    alert('❌ خطأ في الاتصال: ' + error.message);
                }
            }

            loadChannelsAndRoles();
        </script>
    `));
});

// --- API لحفظ الإعدادات ---
app.post('/api/settings/:guildID', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');

    const guildID = req.params.guildID;
    if (!gameData.guilds[guildID]) {
        gameData.guilds[guildID] = { settings: {}, roulette: {} };
    }

    gameData.guilds[guildID].settings = {
        color: req.body.color || '#ff0000',
        maxPlayers: req.body.maxPlayers || 10,
        command: req.body.command || '!roulette',
        targetChannel: req.body.targetChannel || '',
        allowedRole: req.body.allowedRole || ''
    };

    res.sendStatus(200);
});

// --- API لجلب معلومات السيرفر ---
app.get('/api/guild/:guildID/info', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');

    const guildID = req.params.guildID;
    const guild = client.guilds.cache.get(guildID);

    if (!guild) return res.status(404).send('Guild not found');

    const channels = guild.channels.cache
        .filter(ch => ch.isTextBased())
        .map(ch => ({ id: ch.id, name: ch.name }));

    const roles = guild.roles.cache
        .filter(role => !role.managed && role.id !== guildID)
        .map(role => ({ id: role.id, name: role.name }));

    res.json({ channels, roles });
});

// ============================================
// 🚀 بدء التطبيق
// ============================================

app.listen(port, () => {
    console.log(`🌐 Server running on ${domain}`);
});

client.login(process.env.TOKEN);
