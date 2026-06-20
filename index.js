import { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Store active games and server settings
const activeGames = new Map();
const serverSettings = new Map();

// Default settings
const DEFAULT_SETTINGS = {
  rouletteColor: '#FF0000',
  maxPlayers: 10,
  minPlayers: 2,
  allowedRoleId: null,
  allowedChannelId: null,
};

// ==================== EVENT LISTENERS ====================

client.on('ready', () => {
  console.log(`[X-GAMER] Bot logged in as ${client.user.tag}`);
  console.log(`[X-GAMER] Ready to spin the wheel!`);
  client.user.setActivity('X-GAMER Roulette', { type: 'PLAYING' });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  const settings = serverSettings.get(guildId) || DEFAULT_SETTINGS;

  // Check role permission
  if (settings.allowedRoleId && !interaction.member.roles.cache.has(settings.allowedRoleId)) {
    return interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true,
    });
  }

  // Check channel permission
  if (settings.allowedChannelId && interaction.channelId !== settings.allowedChannelId) {
    return interaction.reply({
      content: `This command can only be used in <#${settings.allowedChannelId}>`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === 'roulette') {
    await handleRouletteCommand(interaction, settings);
  } else if (interaction.commandName === 'settings') {
    await handleSettingsCommand(interaction);
  } else if (interaction.commandName === 'join') {
    await handleJoinCommand(interaction);
  } else if (interaction.commandName === 'spin') {
    await handleSpinCommand(interaction);
  }
});

// ==================== COMMAND HANDLERS ====================

async function handleRouletteCommand(interaction, settings) {
  const guildId = interaction.guildId;

  if (activeGames.has(guildId)) {
    return interaction.reply({
      content: 'A roulette game is already active in this server!',
      ephemeral: true,
    });
  }

  // Create new game
  const gameId = `game_${guildId}_${Date.now()}`;
  const game = {
    gameId,
    guildId,
    channelId: interaction.channelId,
    players: new Map(),
    status: 'waiting',
    createdAt: Date.now(),
    settings,
  };

  activeGames.set(guildId, game);

  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('X-GAMER ROULETTE')
    .setDescription('Click the button below to join the roulette game!')
    .setColor(settings.rouletteColor)
    .addFields(
      { name: 'Players', value: '0', inline: true },
      { name: 'Min Players', value: String(settings.minPlayers), inline: true },
      { name: 'Max Players', value: String(settings.maxPlayers), inline: true },
      { name: 'Status', value: 'Waiting for players...', inline: false }
    )
    .setFooter({ text: 'X-GAMER | Click Join to participate' });

  const joinButton = new ButtonBuilder()
    .setCustomId(`join_${gameId}`)
    .setLabel('Join Game')
    .setStyle(ButtonStyle.Danger);

  const spinButton = new ButtonBuilder()
    .setCustomId(`spin_${gameId}`)
    .setLabel('Spin The Wheel')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const row = new ActionRowBuilder().addComponents(joinButton, spinButton);

  const message = await interaction.reply({
    embeds: [embed],
    components: [row],
    fetchReply: true,
  });

  game.messageId = message.id;

  // Store button interaction handlers
  const filter = (i) => i.customId.startsWith(`join_${gameId}`) || i.customId.startsWith(`spin_${gameId}`);
  const collector = message.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId.startsWith('join_')) {
      await handlePlayerJoin(buttonInteraction, game, message);
    } else if (buttonInteraction.customId.startsWith('spin_')) {
      await handleGameSpin(buttonInteraction, game, message, collector);
    }
  });

  collector.on('end', () => {
    activeGames.delete(guildId);
  });
}

async function handlePlayerJoin(interaction, game, message) {
  const userId = interaction.user.id;
  const userName = interaction.user.username;

  if (game.players.has(userId)) {
    return interaction.reply({
      content: 'You are already in this game!',
      ephemeral: true,
    });
  }

  if (game.players.size >= game.settings.maxPlayers) {
    return interaction.reply({
      content: 'The game is full!',
      ephemeral: true,
    });
  }

  game.players.set(userId, {
    id: userId,
    name: userName,
    avatar: interaction.user.displayAvatarURL({ size: 256 }),
  });

  await interaction.reply({
    content: `${userName} joined the game! (${game.players.size}/${game.settings.maxPlayers})`,
    ephemeral: true,
  });

  // Update message
  await updateGameMessage(message, game);

  // Enable spin button if minimum players reached
  if (game.players.size >= game.settings.minPlayers) {
    const spinButton = message.components[0].components[1];
    spinButton.setDisabled(false);
    await message.edit({ components: message.components });
  }
}

async function handleGameSpin(interaction, game, message, collector) {
  if (game.players.size < game.settings.minPlayers) {
    return interaction.reply({
      content: `Need at least ${game.settings.minPlayers} players to spin!`,
      ephemeral: true,
    });
  }

  if (game.status === 'spinning') {
    return interaction.reply({
      content: 'The wheel is already spinning!',
      ephemeral: true,
    });
  }

  game.status = 'spinning';

  // Disable buttons
  const buttons = message.components[0].components;
  buttons.forEach((btn) => btn.setDisabled(true));
  await message.edit({ components: message.components });

  await interaction.reply({
    content: 'The wheel is spinning...',
    ephemeral: true,
  });

  // Simulate spinning
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Select winner
  const playersArray = Array.from(game.players.values());
  const winner = playersArray[Math.floor(Math.random() * playersArray.length)];

  // Create winner embed
  const winnerEmbed = new EmbedBuilder()
    .setTitle('WINNER')
    .setDescription(`${winner.name} won the roulette!`)
    .setColor(game.settings.rouletteColor)
    .setThumbnail(winner.avatar)
    .setFooter({ text: 'X-GAMER | Congratulations!' });

  await message.reply({
    embeds: [winnerEmbed],
  });

  // End game
  game.status = 'finished';
  collector.stop();
}

async function handleSettingsCommand(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'color') {
    const color = interaction.options.getString('color');
    if (!serverSettings.has(guildId)) {
      serverSettings.set(guildId, { ...DEFAULT_SETTINGS });
    }
    serverSettings.get(guildId).rouletteColor = color;

    return interaction.reply({
      content: `Roulette color set to ${color}`,
      ephemeral: true,
    });
  } else if (subcommand === 'maxplayers') {
    const maxPlayers = interaction.options.getInteger('count');
    if (!serverSettings.has(guildId)) {
      serverSettings.set(guildId, { ...DEFAULT_SETTINGS });
    }
    serverSettings.get(guildId).maxPlayers = maxPlayers;

    return interaction.reply({
      content: `Max players set to ${maxPlayers}`,
      ephemeral: true,
    });
  } else if (subcommand === 'role') {
    const role = interaction.options.getRole('role');
    if (!serverSettings.has(guildId)) {
      serverSettings.set(guildId, { ...DEFAULT_SETTINGS });
    }
    serverSettings.get(guildId).allowedRoleId = role.id;

    return interaction.reply({
      content: `Only users with ${role.name} role can use roulette commands`,
      ephemeral: true,
    });
  } else if (subcommand === 'channel') {
    const channel = interaction.options.getChannel('channel');
    if (!serverSettings.has(guildId)) {
      serverSettings.set(guildId, { ...DEFAULT_SETTINGS });
    }
    serverSettings.get(guildId).allowedChannelId = channel.id;

    return interaction.reply({
      content: `Roulette commands can only be used in ${channel.name}`,
      ephemeral: true,
    });
  }
}

async function handleJoinCommand(interaction) {
  const guildId = interaction.guildId;
  const game = activeGames.get(guildId);

  if (!game) {
    return interaction.reply({
      content: 'No active roulette game in this server!',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  if (game.players.has(userId)) {
    return interaction.reply({
      content: 'You are already in this game!',
      ephemeral: true,
    });
  }

  if (game.players.size >= game.settings.maxPlayers) {
    return interaction.reply({
      content: 'The game is full!',
      ephemeral: true,
    });
  }

  game.players.set(userId, {
    id: userId,
    name: interaction.user.username,
    avatar: interaction.user.displayAvatarURL({ size: 256 }),
  });

  await interaction.reply({
    content: `You joined the game! (${game.players.size}/${game.settings.maxPlayers})`,
    ephemeral: true,
  });
}

async function handleSpinCommand(interaction) {
  const guildId = interaction.guildId;
  const game = activeGames.get(guildId);

  if (!game) {
    return interaction.reply({
      content: 'No active roulette game in this server!',
      ephemeral: true,
    });
  }

  if (game.players.size < game.settings.minPlayers) {
    return interaction.reply({
      content: `Need at least ${game.settings.minPlayers} players to spin!`,
      ephemeral: true,
    });
  }

  if (game.status === 'spinning') {
    return interaction.reply({
      content: 'The wheel is already spinning!',
      ephemeral: true,
    });
  }

  game.status = 'spinning';
  await interaction.reply({
    content: 'The wheel is spinning...',
    ephemeral: true,
  });

  // Simulate spinning
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Select winner
  const playersArray = Array.from(game.players.values());
  const winner = playersArray[Math.floor(Math.random() * playersArray.length)];

  const winnerEmbed = new EmbedBuilder()
    .setTitle('WINNER')
    .setDescription(`${winner.name} won the roulette!`)
    .setColor(game.settings.rouletteColor)
    .setThumbnail(winner.avatar)
    .setFooter({ text: 'X-GAMER | Congratulations!' });

  await interaction.followUp({
    embeds: [winnerEmbed],
  });

  game.status = 'finished';
  activeGames.delete(guildId);
}

async function updateGameMessage(message, game) {
  const embed = new EmbedBuilder()
    .setTitle('X-GAMER ROULETTE')
    .setDescription('Click the button below to join the roulette game!')
    .setColor(game.settings.rouletteColor)
    .addFields(
      { name: 'Players', value: String(game.players.size), inline: true },
      { name: 'Min Players', value: String(game.settings.minPlayers), inline: true },
      { name: 'Max Players', value: String(game.settings.maxPlayers), inline: true },
      {
        name: 'Participants',
        value: Array.from(game.players.values())
          .map((p) => p.name)
          .join(', ') || 'None yet',
        inline: false,
      }
    )
    .setFooter({ text: 'X-GAMER | Click Join to participate' });

  await message.edit({ embeds: [embed] });
}

// ==================== REGISTER COMMANDS ====================

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('roulette')
      .setDescription('Start a new X-Gamer roulette game'),

    new SlashCommandBuilder()
      .setName('join')
      .setDescription('Join the active roulette game'),

    new SlashCommandBuilder()
      .setName('spin')
      .setDescription('Spin the roulette wheel'),

    new SlashCommandBuilder()
      .setName('settings')
      .setDescription('Configure X-Gamer settings')
      .addSubcommand((sub) =>
        sub
          .setName('color')
          .setDescription('Set roulette color')
          .addStringOption((opt) =>
            opt
              .setName('color')
              .setDescription('Hex color code (e.g., #FF0000)')
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('maxplayers')
          .setDescription('Set maximum players')
          .addIntegerOption((opt) =>
            opt
              .setName('count')
              .setDescription('Maximum number of players (2-100)')
              .setRequired(true)
              .setMinValue(2)
              .setMaxValue(100)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('role')
          .setDescription('Set required role')
          .addRoleOption((opt) =>
            opt
              .setName('role')
              .setDescription('Role that can use roulette')
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('channel')
          .setDescription('Set allowed channel')
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Channel where roulette can be used')
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      ),
  ];

  try {
    console.log('[X-GAMER] Registering slash commands...');
    await client.application.commands.set(commands);
    console.log('[X-GAMER] Slash commands registered successfully!');
  } catch (error) {
    console.error('[X-GAMER] Error registering commands:', error);
  }
}

// ==================== LOGIN ====================

client.once('ready', registerCommands);

client.login(process.env.DISCORD_TOKEN);
