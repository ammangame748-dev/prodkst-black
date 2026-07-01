/**
 * ==============================================================================
 * 🚀 ديسكورد بوت متكامل (All-in-One) - Slash Commands
 * ==============================================================================
 * 
 * 🛠️ ما هو Slash Command؟
 * أوامر السلاش هي الطريقة الحديثة للتفاعل مع البوتات في ديسكورد. بدلاً من البادئات (مثل !)، 
 * تستخدم "/" لتظهر لك قائمة الأوامر مع شرح لكل منها، مما يسهل الاستخدام ويقلل الأخطاء.
 * 
 * 📋 قائمة الأوامر المبرمجة (18 أمر):
 * 1.  /ping        - فحص استجابة البوت.
 * 2.  /help        - عرض قائمة الأوامر والشرح.
 * 3.  /userinfo    - معلومات عن مستخدم معين.
 * 4.  /serverinfo  - معلومات عن السيرفر.
 * 5.  /avatar      - عرض صورة الملف الشخصي.
 * 6.  /kick        - طرد عضو (إدارة).
 * 7.  /ban         - حظر عضو (إدارة).
 * 8.  /timeout     - إسكات عضو مؤقتاً (إدارة).
 * 9.  /clear       - مسح الرسائل (إدارة).
 * 10. /8ball       - كرة الحظ للإجابة على الأسئلة.
 * 11. /say         - جعل البوت يكرر كلامك.
 * 12. /roll        - رمي النرد.
 * 13. /echo        - تكرار رسالة (مع خيار الإخفاء).
 * 14. /poll        - إنشاء استطلاع رأي.
 * 15. /weather     - حالة الطقس لمدينة معينة.
 * 16. /meme        - جلب ميمز عشوائية.
 * 17. /remindme    - تعيين تذكير شخصي.
 * 18. /translate   - ترجمة النصوص بين اللغات.
 * 
 * ⚙️ المتغيرات المستخدمة (من Render/Environment):
 * - BOT_TOKEN
 * - CLIENT_ID
 * - CLIENT_SECRET
 * - CALLBACK_URL
 * ==============================================================================
 */

const { 
    Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, 
    PermissionFlagsBits, REST, Routes 
} = require('discord.js');
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
    // 1. Ping
    {
        data: new SlashCommandBuilder().setName('ping').setDescription('يرد بـ Pong!'),
        async execute(interaction) { await interaction.reply('Pong! 🏓'); }
    },
    // 2. Help
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
    // 3. UserInfo
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
                    { name: 'انضم للسيرفر', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true }
                );
            await interaction.reply({ embeds: [embed] });
        }
    },
    // 4. ServerInfo
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
    // 5. Avatar
    {
        data: new SlashCommandBuilder().setName('avatar').setDescription('عرض الأفاتار.').addUserOption(o => o.setName('target').setDescription('المستخدم')),
        async execute(interaction) {
            const user = interaction.options.getUser('target') || interaction.user;
            await interaction.reply(user.displayAvatarURL({ dynamic: true, size: 1024 }));
        }
    },
    // 6. Kick
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
    // 7. Ban
    {
        data: new SlashCommandBuilder().setName('ban').setDescription('حظر عضو.').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'لا يوجد سبب';
            await interaction.guild.members.ban(target, { reason });
            await interaction.reply(`🚫 تم حظر ${target.tag}. السبب: ${reason}`);
        }
    },
    // 8. Timeout
    {
        data: new SlashCommandBuilder().setName('timeout').setDescription('إسكات عضو.').addUserOption(o => o.setName('target').setDescription('العضو').setRequired(true)).addIntegerOption(o => o.setName('time').setDescription('الدقائق').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        async execute(interaction) {
            const target = interaction.options.getMember('target');
            const time = interaction.options.getInteger('time');
            await target.timeout(time * 60 * 1000);
            await interaction.reply(`🤐 تم إسكات ${target.user.tag} لمدة ${time} دقيقة.`);
        }
    },
    // 9. Clear
    {
        data: new SlashCommandBuilder().setName('clear').setDescription('مسح رسائل.').addIntegerOption(o => o.setName('amount').setDescription('العدد').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        async execute(interaction) {
            const amount = interaction.options.getInteger('amount');
            if (amount > 100 || amount < 1) return interaction.reply({ content: 'العدد بين 1-100', ephemeral: true });
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `🗑️ تم مسح ${amount} رسالة.`, ephemeral: true });
        }
    },
    // 10. 8ball
    {
        data: new SlashCommandBuilder().setName('8ball').setDescription('اسأل الكرة السحرية.').addStringOption(o => o.setName('question').setDescription('سؤالك').setRequired(true)),
        async execute(interaction) {
            const answers = ['نعم', 'لا', 'ربما', 'مستحيل', 'بالتأكيد', 'اسأل لاحقاً'];
            const ans = answers[Math.floor(Math.random() * answers.length)];
            await interaction.reply(`🔮 **السؤال:** ${interaction.options.getString('question')}\n✨ **الإجابة:** ${ans}`);
        }
    },
    // 11. Say
    {
        data: new SlashCommandBuilder().setName('say').setDescription('البوت يتكلم.').addStringOption(o => o.setName('msg').setDescription('الرسالة').setRequired(true)),
        async execute(interaction) { await interaction.reply(interaction.options.getString('msg')); }
    },
    // 12. Roll
    {
        data: new SlashCommandBuilder().setName('roll').setDescription('رمي نرد.'),
        async execute(interaction) { await interaction.reply(`🎲 النتيجة: ${Math.floor(Math.random() * 6) + 1}`); }
    },
    // 13. Echo
    {
        data: new SlashCommandBuilder().setName('echo').setDescription('تكرار الكلام.').addStringOption(o => o.setName('text').setRequired(true).setDescription('النص')).addBooleanOption(o => o.setName('hidden').setDescription('إخفاء؟')),
        async execute(interaction) {
            const text = interaction.options.getString('text');
            const hidden = interaction.options.getBoolean('hidden') || false;
            await interaction.reply({ content: text, ephemeral: hidden });
        }
    },
    // 14. Poll
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
    // 15. Weather
    {
        data: new SlashCommandBuilder().setName('weather').setDescription('الطقس.').addStringOption(o => o.setName('city').setDescription('المدينة').setRequired(true)),
        async execute(interaction) {
            const city = interaction.options.getString('city');
            // ملاحظة: يتطلب API Key حقيقي، هنا مثال بسيط
            await interaction.reply(`🌦️ جاري البحث عن طقس مدينة ${city}... (تأكد من إعداد API Key في الكود الحقيقي)`);
        }
    },
    // 16. Meme
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
    // 17. RemindMe
    {
        data: new SlashCommandBuilder().setName('remindme').setDescription('تذكير.').addIntegerOption(o => o.setName('time').setDescription('بالدقائق').setRequired(true)).addStringOption(o => o.setName('msg').setDescription('الرسالة').setRequired(true)),
        async execute(interaction) {
            const time = interaction.options.getInteger('time');
            const msg = interaction.options.getString('msg');
            await interaction.reply({ content: `⏰ سأذكرك بعد ${time} دقيقة.`, ephemeral: true });
            setTimeout(() => interaction.user.send(`🔔 تذكير: ${msg}`).catch(() => {}), time * 60000);
        }
    },
    // 18. Translate
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
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
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
})();

// 4. معالجة التفاعلات
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.find(c => c.data.name === interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ حدث خطأ أثناء تنفيذ الأمر!', ephemeral: true });
    }
});

client.once('ready', () => console.log(`🤖 تم تشغيل البوت باسم: ${client.user.tag}`));
client.login(process.env.BOT_TOKEN);
