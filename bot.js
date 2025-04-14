// Discord BO7-Scoreboard Bot with Rocket League ranks using slash commands
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Try to load environment variables from .env file if dotenv is available
try {
    require('dotenv').config();
} catch (error) {
    console.log('dotenv module not found, skipping .env file loading');
}

// Bot configuration
const config = {
    adminRoleName: process.env.ADMIN_ROLE_NAME || 'Admin', // Admin role name, can be set via environment variable
};

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Define the ranks
const RANKS = [
    'Bronze',
    'Silver',
    'Gold',
    'Platinum',
    'Diamond',
    'Champion',
    'Grand Champion',
    'Super Sonic Legend'
];

// Path to the data file
const DATA_FILE = path.join(__dirname, 'scores.json');

// Function to load data
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
    // Return empty data structure if file doesn't exist or error occurs
    return { scores: {} };
}

// Function to save data
function saveData(data) {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(DATA_FILE, jsonData, 'utf8');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Check if user has admin role
async function isAdmin(member) {
    if (!member) return false;
    await member.fetch();
    return member.roles.cache.some(role => role.name === config.adminRoleName);
}

// Define slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('scoreboard-help')
        .setDescription('Shows help information for the BO7-Scoreboard Bot'),
    
    new SlashCommandBuilder()
        .setName('scoreboard-stats')
        .setDescription('Shows stats for a user')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to check stats for (defaults to yourself)')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('scoreboard-leaderboard')
        .setDescription('Shows leaderboard for all ranks or a specific rank')
        .addStringOption(option => 
            option.setName('rank')
                .setDescription('Specific rank to check (optional)')
                .setRequired(false)
                .addChoices(
                    ...RANKS.map(rank => ({ name: rank, value: rank }))
                )),
    
    new SlashCommandBuilder()
        .setName('scoreboard-overview')
        .setDescription('Shows an overview of all users and their wins across all ranks'),
    
    new SlashCommandBuilder()
        .setName('scoreboard-addwin')
        .setDescription('Adds a win for a user in a specific rank')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to add a win for')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('rank')
                .setDescription('The rank to add a win for')
                .setRequired(true)
                .addChoices(
                    ...RANKS.map(rank => ({ name: rank, value: rank }))
                )),
    
    new SlashCommandBuilder()
        .setName('scoreboard-removewin')
        .setDescription('Removes a win from a user in a specific rank')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to remove a win from')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('rank')
                .setDescription('The rank to remove a win from')
                .setRequired(true)
                .addChoices(
                    ...RANKS.map(rank => ({ name: rank, value: rank }))
                )),
    
    new SlashCommandBuilder()
        .setName('scoreboard-setwins')
        .setDescription('Sets the wins for a user in a specific rank')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to set wins for')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('rank')
                .setDescription('The rank to set wins for')
                .setRequired(true)
                .addChoices(
                    ...RANKS.map(rank => ({ name: rank, value: rank }))
                ))
        .addIntegerOption(option => 
            option.setName('wins')
                .setDescription('The number of wins to set')
                .setRequired(true)
                .setMinValue(0)),
];

// Helper to create fancy embed designs
function createRankEmbed(title, description = null) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🏆 ${title} 🏆`)
        .setTimestamp();
    
    if (description) {
        embed.setDescription(description);
    }
    
    // Add rocket league theme
    embed.setFooter({ 
        text: 'BO7-Scoreboard Bot | Rocket League Ranks', 
        iconURL: 'https://i.imgur.com/6cY7QT7.png' // Rocket League logo icon
    });
    
    return embed;
}

// Function to get rank emoji
function getRankEmoji(rank) {
    const emojiMap = {
        'Bronze': '🥉',
        'Silver': '⚪',
        'Gold': '🥇',
        'Platinum': '💠',
        'Diamond': '💎',
        'Champion': '👑',
        'Grand Champion': '🏆',
        'Super Sonic Legend': '⭐'
    };
    
    return emojiMap[rank] || '🎮';
}

// Bot ready event
client.once('ready', () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    (async () => {
        try {
            console.log('Started refreshing application (/) commands.');
            
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands.map(command => command.toJSON()) },
            );
            
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Failed to reload application (/) commands:', error);
        }
    })();
    
    // Set up a self-ping every 2 minutes to prevent the bot from sleeping on Render
    setInterval(() => {
        console.log(`[${new Date().toISOString()}] Keeping bot awake with ping`);
        // You can also add additional health check logic here if needed
    }, 2 * 60 * 1000); // 2 minutes in milliseconds
});

// Interaction handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    // Load current data
    const data = loadData();
    
    // Initialize scores object if it doesn't exist
    if (!data.scores) {
        data.scores = {};
    }
    
    const commandName = interaction.commandName;
    
    // Help command
    if (commandName === 'scoreboard-help') {
        const embed = createRankEmbed('BO7-Scoreboard Bot Help', 'List of available commands:');
        
        embed.addFields(
            { name: '/scoreboard-help', value: 'Shows this help message', inline: false },
            { name: '/scoreboard-stats [user]', value: 'Shows stats for a user (or yourself if no user is specified)', inline: false },
            { name: '/scoreboard-leaderboard [rank]', value: 'Shows leaderboard for all ranks or a specific rank', inline: false },
            { name: '/scoreboard-overview', value: 'Shows a comprehensive overview of all users and their wins across all ranks', inline: false },
            { name: '**Admin Commands**', value: 'The following commands require the Admin role:', inline: false },
            { name: '/scoreboard-addwin <user> <rank>', value: 'Adds a win for a user in the specified rank', inline: false },
            { name: '/scoreboard-removewin <user> <rank>', value: 'Removes a win for a user in the specified rank', inline: false },
            { name: '/scoreboard-setwins <user> <rank> <wins>', value: 'Sets the wins for a user in the specified rank to a specific value', inline: false }
        );
        
        await interaction.reply({ embeds: [embed], ephemeral: false });
        return;
    }
    
    // Stats command
    if (commandName === 'scoreboard-stats') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        
        // Initialize user if not exists
        if (!data.scores[userId]) {
            data.scores[userId] = {};
            RANKS.forEach(rank => data.scores[userId][rank] = 0);
        }
        
        const embed = createRankEmbed(`Stats for ${targetUser.username}`);
        embed.setThumbnail(targetUser.displayAvatarURL());
        
        let description = '';
        let totalWins = 0;
        
        RANKS.forEach(rank => {
            const wins = data.scores[userId][rank] || 0;
            totalWins += wins;
            description += `${getRankEmoji(rank)} **${rank}**: ${wins} wins\n`;
        });
        
        description += `\n🔥 **Total Wins**: ${totalWins}`;
        embed.setDescription(description);
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    // Leaderboard command
    if (commandName === 'scoreboard-leaderboard') {
        const rank = interaction.options.getString('rank');
        
        const embed = createRankEmbed(rank ? `${rank} Leaderboard` : 'Overall Leaderboard');
        
        if (rank) {
            // Single rank leaderboard
            const userScores = [];
            for (const userId in data.scores) {
                const wins = data.scores[userId][rank] || 0;
                if (wins > 0) {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) userScores.push({ username: user.username, wins });
                }
            }
            
            userScores.sort((a, b) => b.wins - a.wins);
            
            if (userScores.length === 0) {
                embed.setDescription('No scores for this rank yet.');
            } else {
                let description = `${getRankEmoji(rank)} **${rank} Rank**\n\n`;
                
                userScores.slice(0, 10).forEach((score, index) => {
                    // Add medals for top 3
                    let prefix = `${index + 1}.`;
                    if (index === 0) prefix = '🥇';
                    else if (index === 1) prefix = '🥈';
                    else if (index === 2) prefix = '🥉';
                    
                    description += `**${prefix}** ${score.username}: ${score.wins} wins\n`;
                });
                
                embed.setDescription(description);
            }
        } else {
            // Overall leaderboard across all ranks
            const userTotalScores = [];
            for (const userId in data.scores) {
                let totalWins = 0;
                RANKS.forEach(r => {
                    totalWins += data.scores[userId][r] || 0;
                });
                
                if (totalWins > 0) {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) userTotalScores.push({ username: user.username, wins: totalWins });
                }
            }
            
            userTotalScores.sort((a, b) => b.wins - a.wins);
            
            if (userTotalScores.length === 0) {
                embed.setDescription('No scores recorded yet.');
            } else {
                let description = '**Overall Standings**\n\n';
                
                userTotalScores.slice(0, 10).forEach((score, index) => {
                    // Add medals for top 3
                    let prefix = `${index + 1}.`;
                    if (index === 0) prefix = '🥇';
                    else if (index === 1) prefix = '🥈';
                    else if (index === 2) prefix = '🥉';
                    
                    description += `**${prefix}** ${score.username}: ${score.wins} total wins\n`;
                });
                
                embed.setDescription(description);
            }
        }
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    // Overview command - shows all users and their wins across all ranks in a table format
    if (commandName === 'scoreboard-overview') {
        // Get all users who have at least one win
        const userIds = Object.keys(data.scores).filter(userId => {
            return RANKS.some(rank => (data.scores[userId][rank] || 0) > 0);
        });
        
        if (userIds.length === 0) {
            await interaction.reply('No scores recorded yet.');
            return;
        }
        
        // Create a fancy overview embed
        const embed = createRankEmbed('Complete Scoreboard Overview', 'All users and their wins across all ranks:');
        
        // Process data for each user
        const userEmbeds = [];
        
        for (const userId of userIds) {
            try {
                const user = await client.users.fetch(userId);
                let fieldValue = '';
                let totalWins = 0;
                
                // Format each rank
                RANKS.forEach(rank => {
                    const wins = data.scores[userId][rank] || 0;
                    if (wins > 0) {
                        fieldValue += `${getRankEmoji(rank)} **${rank}**: ${wins} wins\n`;
                        totalWins += wins;
                    }
                });
                
                // Add total wins at the end
                fieldValue += `\n🔥 **Total**: ${totalWins} wins`;
                
                // Add to embed if there are any wins
                if (totalWins > 0) {
                    userEmbeds.push({
                        name: `${user.username}`,
                        value: fieldValue,
                        inline: true,
                        totalWins: totalWins // Used for sorting
                    });
                }
            } catch (error) {
                console.error(`Error fetching user ${userId}:`, error);
            }
        }
        
        // Sort users by total wins (highest first)
        userEmbeds.sort((a, b) => b.totalWins - a.totalWins);
        
        // Add fields to the embed (removing the totalWins property)
        userEmbeds.forEach(userEmbed => {
            const { totalWins, ...fieldData } = userEmbed;
            embed.addFields(fieldData);
        });
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    // Admin commands from here
    if (['scoreboard-addwin', 'scoreboard-removewin', 'scoreboard-setwins'].includes(commandName)) {
        // Check if user has admin role
        if (!(await isAdmin(interaction.member))) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        
        const mentionedUser = interaction.options.getUser('user');
        const userId = mentionedUser.id;
        const rank = interaction.options.getString('rank');
        
        // Initialize user if not exists
        if (!data.scores[userId]) {
            data.scores[userId] = {};
            RANKS.forEach(r => data.scores[userId][r] = 0);
        }
        
        if (commandName === 'scoreboard-addwin') {
            // Add a win
            data.scores[userId][rank] = (data.scores[userId][rank] || 0) + 1;
            saveData(data);
            
            const embed = createRankEmbed('Win Added', `Added a win for ${mentionedUser.username} in ${getRankEmoji(rank)} **${rank}**.\n\nThey now have **${data.scores[userId][rank]} wins** in this rank.`);
            
            await interaction.reply({ embeds: [embed] });
        } else if (commandName === 'scoreboard-removewin') {
            // Remove a win
            if (data.scores[userId][rank] > 0) {
                data.scores[userId][rank]--;
                saveData(data);
                
                const embed = createRankEmbed('Win Removed', `Removed a win from ${mentionedUser.username} in ${getRankEmoji(rank)} **${rank}**.\n\nThey now have **${data.scores[userId][rank]} wins** in this rank.`);
                
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply({ content: `${mentionedUser.username} has no wins to remove in ${rank}.`, ephemeral: true });
            }
        } else if (commandName === 'scoreboard-setwins') {
            // Set wins to a specific value
            const wins = interaction.options.getInteger('wins');
            
            data.scores[userId][rank] = wins;
            saveData(data);
            
            const embed = createRankEmbed('Wins Updated', `Set ${mentionedUser.username}'s wins in ${getRankEmoji(rank)} **${rank}** to **${wins}**.`);
            
            await interaction.reply({ embeds: [embed] });
        }
        
        return;
    }
});

// Create a simple HTTP server for Render.com
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('BO7-Scoreboard Bot is running!\n');
});

// Use the PORT environment variable provided by Render.com or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});

// Login to Discord
if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN environment variable is not set!');
    console.error('Please set your discord token as an environment variable or in a .env file');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

// Log a message about admin role configuration
console.log(`Bot is configured to recognize users with the "${config.adminRoleName}" role as admins`);