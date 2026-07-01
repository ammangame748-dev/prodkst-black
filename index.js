/**
 * ==============================================================================
 * 🚀 ديسكورد بوت متكامل (All-in-One) - النسخة المصلحة لـ Render
 * ==============================================================================
 */

const { 
    Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, 
    PermissionFlagsBits, REST, Routes 
} = require('discord.js');

// استيراد node-fetch بشكل متوافق
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 1. إعداد العميل (Client)
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ] 
});

// 2. تعريف الأوامر
const commands = [
    {
        data: new SlashCommandBuilder().setName('ping').setDescription('يرد بـ Pong!'),
        async execute(interaction) { await interaction.reply('Pong! 🏓'); }
    },
    {
        data: new SlashCommandBuilder().setName('help').setDescription('يعرض قائمة بجميع الأوامر المتاحة.'),
        async execute(interaction) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📋 لوحة تحكم الأوامر')
                .setDescription('جميع الأوامر تعمل بنظام السلاش (/)')
                .addFields(
                    { name: '🛠️ عام', value: '`/ping`, `/help`, `/userinfo`, `/serverinfo`, `/avatar`, `/echo`' },
                    { name: '🛡️ إشراف', value: '`/kick`, `/ban`, `/timeout`, `/clear`' },
                    { name: '🎮 ترفيه', value: '`/8ball`, `/say`, `/roll`, `/meme`' },
                    { name: '🔧 أدوات', value: '`/poll`, `/weather`, `/remindme`, `/translate`' }
                );
            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder().setName('userinfo').setDescription('يعرض معلومات المستخدم.').addUserOption(o => o.setName('target').setDescription('المستخدم')),
        async execute(interaction) {
            const user = interaction.options.getUser('target') || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`👤 معلومات: ${user.username}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'المعرف ID', value: user.id, inline: true },
                    { name: 'انضم للديسكورد', value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
                    { name: 'انضم للسيرفر', value: member ? `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` : 'غير متوفر', inline: true }
                );
            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder().setName('serverinfo').setDescription('معلومات السيرفر.'),
        async execute(interaction) {
            const { guild } = interaction;
            const embed = new EmbedBuilder()
                .setColor(0xFFCC00)
                .setTitle(`🏰 ${guild.name}`)
                .addFields(
                    { name: 'المالك', value: `<@${guild.ownerId}>`, inline: true },
                    { name: 'الأعضاء', value: `${guild.memberCount}`, inline: true },
                    { name: 'تاريخ الإنشاء', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:F>` }
                );
            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder().setName('avatar').setDescription('عرض الأفاتار.').addUserOption(o => o.setName('target').setDescription('المستخدم')),
        async execute(interaction) {
            const user = interaction.options.getUser('target') || interaction.user;
            await interaction.reply(user.displayAvatarURL({ dynamic: true, size: 1024 }));
        }
    },
    {
        data: new SlashCommandBuilder().setName('kick').setDescription('طرد عضو.').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason') || 'لا يوجد سبب';
            if (!target.kickable) return interaction.reply({ content: '❌ لا أستطيع طرده!', ephemeral: true });
            await target.kick(reason);
            await interaction.reply(`✅ تم طرد ${target.user.tag}. السبب: ${reason}`);
        }
    },
    {
        data: new SlashCommandBuilder().setName('ban').setDescription('حظر عضو.').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'لا يوجد سبب';
            await interaction.guild.members.ban(target, { reason });
            await interaction.reply(`🚫 تم حظر ${target.tag}. السبب: ${reason}`);
        }
    },
    {
        data: new SlashCommandBuilder().setName('timeout').setDescription('إسكات عضو.').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addIntegerOption(o => o.setName('time').setDescription('الدقائق').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const time = interaction.options.getInteger('time');
            await target.timeout(time * 60 * 1000);
            await interaction.reply(`🤐 تم إسكات ${target.user.tag} لمدة ${time} دقيقة.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName('clear').setDescription('مسح رسائل.').addIntegerOption(o => o.setName('amount').setDescription('العدد').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        async execute(interaction) {
            const amount = interaction.options.getInteger('amount');
            if (amount > 100 || amount < 1) return interaction.reply({ content: 'العدد بين 1-100', ephemeral: true });
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `🗑️ تم مسح ${amount} رسالة.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName('8ball').setDescription('اسأل الكرة السحرية.').addStringOption(o => o.setName('question').setDescription('سؤالك').setRequired(true)),
        async execute(interaction) {
            const answers = ['نعم', 'لا', 'ربما', 'مستحيل', 'بالتأكيد', 'اسأل لاحقاً'];
            const ans = answers[Math.floor(Math.random() * answers.length)];
            await interaction.reply(`🔮 **السؤال:** ${interaction.options.getString('question')}\n✨ **الإجابة:** ${ans}`);
        }
    },
    {
        data: new SlashCommandBuilder().setName('say').setDescription('البوت يتكلم.').addStringOption(o => o.setName('msg').setDescription('الرسالة').setRequired(true)),
        async execute(interaction) { await interaction.reply(interaction.options.getString('msg')); }
    },
    {
        data: new SlashCommandBuilder().setName('roll').setDescription('رمي نرد.'),
        async execute(interaction) { await interaction.reply(`🎲 النتيجة: ${Math.floor(Math.random() * 6) + 1}`); }
    },
    {
        data: new SlashCommandBuilder().setName('echo').setDescription('تكرار الكلام.').addStringOption(o => o.setName('text').setRequired(true).setDescription('النص')).addBooleanOption(o => o.setName('hidden').setDescription('إخفاء؟')),
        async execute(interaction) {
            const text = interaction.options.getString('text');
            const hidden = interaction.options.getBoolean('hidden') || false;
            await interaction.reply({ content: text, ephemeral: hidden });
        }
    },
    {
        data: new SlashCommandBuilder().setName('poll').setDescription('تصويت.').addStringOption(o => o.setName('q').setDescription('السؤال').setRequired(true)).addStringOption(o => o.setName('options').setDescription('الخيارات مفصولة بـ ,').setRequired(true)),
        async execute(interaction) {
            const q = interaction.options.getString('q');
            const opts = interaction.options.getString('options').split(',');
            const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
            let desc = '';
            opts.forEach((opt, i) => { if(i < 5) desc += `${emojis[i]} ${opt.trim()}\n`; });
            const embed = new EmbedBuilder().setTitle(`📊 ${q}`).setDescription(desc).setColor(0x00AAFF);
            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            opts.forEach(async (_, i) => { if(i < 5) await msg.react(emojis[i]); });
        }
    },
    {
        data: new SlashCommandBuilder().setName('weather').setDescription('الطقس.').addStringOption(o => o.setName('city').setDescription('المدينة').setRequired(true)),
        async execute(interaction) {
            const city = interaction.options.getString('city');
            await interaction.reply(`🌦️ جاري البحث عن طقس مدينة ${city}... (تأكد من إعداد API Key في الكود الحقيقي)`);
        }
    },
    {
        data: new SlashCommandBuilder().setName('meme').setDescription('ميم عشوائي.'),
        async execute(interaction) {
            try {
                const res = await fetch('https://meme-api.com/gimme');
                const data = await res.json();
                const embed = new EmbedBuilder().setTitle(data.title).setImage(data.url).setColor('Random');
                await interaction.reply({ embeds: [embed] });
            } catch (e) { await interaction.reply('❌ فشل جلب الميم'); }
        }
    },
    {
        data: new SlashCommandBuilder().setName('remindme').setDescription('تذكير.').addIntegerOption(o => o.setName('time').setDescription('بالدقائق').setRequired(true)).addStringOption(o => o.setName('msg').setDescription('الرسالة').setRequired(true)),
        async execute(interaction) {
            const time = interaction.options.getInteger('time');
            const msg = interaction.options.getString('msg');
            await interaction.reply({ content: `⏰ سأذكرك بعد ${time} دقيقة.`, ephemeral: true });
            setTimeout(() => interaction.user.send(`🔔 تذكير: ${msg}`).catch(() => {}), time * 60000);
        }
    },
    {
        data: new SlashCommandBuilder().setName('translate').setDescription('ترجمة سريعة.').addStringOption(o => o.setName('text').setRequired(true).setDescription('النص')).addStringOption(o => o.setName('to').setRequired(true).setDescription('إلى لغة (en, ar)')),
        async execute(interaction) {
            const text = interaction.options.getString('text');
            const to = interaction.options.getString('to');
            try {
                const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${to}`);
                const data = await res.json();
                await interaction.reply(`🌐 **الترجمة:** ${data.responseData.translatedText}`);
            } catch (e) { await interaction.reply('❌ فشلت الترجمة'); }
        }
    }
];

// 3. تسجيل الأوامر (Deploy)
const deployCommands = async () => {
    if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
        console.error('❌ خطأ: BOT_TOKEN أو CLIENT_ID غير موجود في المتغيرات البيئية!');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        console.log('🔄 جاري تحديث أوامر السلاش...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands.map(c => c.data.toJSON()) },
        );
        console.log('✅ تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر:', error);
    }
};

// 4. معالجة التفاعلات
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.find(c => c.data.name === interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ حدث خطأ أثناء تنفيذ الأمر!', ephemeral: true });
        }
    }
});

client.once('ready', () => {
    console.log(`🤖 تم تشغيل البوت باسم: ${client.user.tag}`);
    console.log('🚀 البوت الآن متصل وجاهز للعمل!');
});

// 5. بدء التشغيل ومعالجة الأخطاء
const startBot = async () => {
    try {
        await deployCommands();
        await client.login(process.env.BOT_TOKEN);
    } catch (error) {
        console.error('❌ فشل بدء تشغيل البوت:', error);
        process.exit(1);
    }
};

// التعامل مع إشارات الإنهاء لضمان إغلاق نظيف على Render
process.on('SIGTERM', () => {
    console.log('👋 تلقى إشارة SIGTERM، إغلاق البوت بشكل نظيف...');
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 تلقى إشارة SIGINT، إغلاق البوت بشكل نظيف...');
    client.destroy();
    process.exit(0);
});

// التعامل مع الأخطاء غير المتوقعة لمنع تعليق العملية
process.on('unhandledRejection', error => {
    console.error('❌ خطأ غير معالج (Unhandled Rejection):', error);
});

process.on('uncaughtException', error => {
    console.error('❌ خطأ غير متوقع (Uncaught Exception):', error);
    process.exit(1);
});

startBot();
// ==================== [ خادم الويب الأساسي لمنصة Render ] ====================
const http = require('http');

// إنشاء سيرفر وهمي للرد على سيرفرات Render وتجنب إغلاق البوت
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('البوت يعمل بكفاءة 24/7 على منصة Render 🚀\n');
});

// Render يقوم بتعيين رقم البورت تلقائياً في متغير البيئة PORT، وإذا لم يجده يختار 3000
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🌐 تم فتح البورت بنجاح! خادم الويب يستمع الآن على المنفذ: ${PORT}`);
});

// ==================== [ تسجيل دخول البوت ] ====================
// تأكد من إضافة متغير البيئة TOKEN في إعدادات Render
client.login(process.env.TOKEN).catch(err => {
    console.error("❌ فشل تسجيل دخول البوت! تأكد من صحة التوكن (TOKEN):", err);
});

