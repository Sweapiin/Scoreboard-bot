// Discord BO7-Scoreboard Bot with Rocket League ranks
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
    prefix: '!', // Command prefix
    adminRoleName: process.env.ADMIN_ROLE_NAME || 'Admin', // Admin role name, can be set via environment variable
};

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
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
function isAdmin(member) {
    return member.roles.cache.some(role => role.name === config.adminRoleName);
}

// Bot ready event
client.once('ready', () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);
    
    // Set up a self-ping every 2 minutes to prevent the bot from sleeping on Render
    setInterval(() => {
        console.log(`[${new Date().toISOString()}] Keeping bot awake with ping`);
        // You can also add additional health check logic here if needed
    }, 2 * 60 * 1000); // 2 minutes in milliseconds
});

// Message handler
client.on('messageCreate', async (message) => {
    // Ignore bot messages and messages that don't start with prefix
    if (message.author.bot || !message.content.startsWith(config.prefix)) return;

    // Parse command and arguments
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Load current data
    const data = loadData();

    // Initialize scores object if it doesn't exist
    if (!data.scores) {
        data.scores = {};
    }

    // Help command
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('BO7-Scoreboard Bot Help')
            .setDescription('List of available commands:')
            .addFields(
                { name: `${config.prefix}help`, value: 'Shows this help message' },
                { name: `${config.prefix}stats [user]`, value: 'Shows stats for a user (or yourself if no user is specified)' },
                { name: `${config.prefix}leaderboard [rank]`, value: 'Shows leaderboard for all ranks or a specific rank' },
                { name: '**Admin Commands**', value: 'The following commands require admin privileges:' },
                { name: `${config.prefix}addwin <user> <rank>`, value: 'Adds a win for a user in the specified rank' },
                { name: `${config.prefix}removewin <user> <rank>`, value: 'Removes a win for a user in the specified rank' },
                { name: `${config.prefix}setwins <user> <rank> <wins>`, value: 'Sets the wins for a user in the specified rank to a specific value' }
            )
            .setFooter({ text: 'BO7-Scoreboard Bot' });

        message.reply({ embeds: [embed] });
        return;
    }

    // Stats command
    if (command === 'stats') {
        let targetUser = message.mentions.users.first() || message.author;
        const userId = targetUser.id;
        
        // Initialize user if not exists
        if (!data.scores[userId]) {
            data.scores[userId] = {};
            RANKS.forEach(rank => data.scores[userId][rank] = 0);
        }
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Stats for ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL());
        
        RANKS.forEach(rank => {
            const wins = data.scores[userId][rank] || 0;
            embed.addFields({ name: rank, value: `${wins} wins`, inline: true });
        });
        
        message.reply({ embeds: [embed] });
        return;
    }

    // Leaderboard command
    if (command === 'leaderboard') {
        const rank = args[0] ? args[0].charAt(0).toUpperCase() + args[0].slice(1).toLowerCase() : null;
        
        if (rank && !RANKS.includes(rank)) {
            message.reply(`Invalid rank. Available ranks: ${RANKS.join(', ')}`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(rank ? `Leaderboard for ${rank}` : 'Overall Leaderboard');

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
                const topTen = userScores.slice(0, 10);
                let description = '';
                topTen.forEach((score, index) => {
                    description += `**${index + 1}.** ${score.username}: ${score.wins} wins\n`;
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
                const topTen = userTotalScores.slice(0, 10);
                let description = '';
                topTen.forEach((score, index) => {
                    description += `**${index + 1}.** ${score.username}: ${score.wins} total wins\n`;
                });
                embed.setDescription(description);
            }
        }

        message.reply({ embeds: [embed] });
        return;
    }

    // Admin commands from here
    if (['addwin', 'removewin', 'setwins'].includes(command)) {
        // Check if user has admin role
        if (!isAdmin(message.member)) {
            message.reply('You do not have permission to use this command.');
            return;
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            message.reply('Please mention a user.');
            return;
        }

        const userId = mentionedUser.id;
        const rankArg = args[1];
        
        if (!rankArg) {
            message.reply('Please specify a rank.');
            return;
        }
        
        const rank = rankArg.charAt(0).toUpperCase() + rankArg.slice(1).toLowerCase();
        
        if (!RANKS.includes(rank)) {
            message.reply(`Invalid rank. Available ranks: ${RANKS.join(', ')}`);
            return;
        }

        // Initialize user if not exists
        if (!data.scores[userId]) {
            data.scores[userId] = {};
            RANKS.forEach(r => data.scores[userId][r] = 0);
        }

        if (command === 'addwin') {
            // Add a win
            data.scores[userId][rank] = (data.scores[userId][rank] || 0) + 1;
            saveData(data);
            message.reply(`Added a win for ${mentionedUser.username} in ${rank}. They now have ${data.scores[userId][rank]} wins.`);
        } else if (command === 'removewin') {
            // Remove a win
            if (data.scores[userId][rank] > 0) {
                data.scores[userId][rank]--;
                saveData(data);
                message.reply(`Removed a win from ${mentionedUser.username} in ${rank}. They now have ${data.scores[userId][rank]} wins.`);
            } else {
                message.reply(`${mentionedUser.username} has no wins to remove in ${rank}.`);
            }
        } else if (command === 'setwins') {
            // Set wins to a specific value
            const wins = parseInt(args[2]);
            if (isNaN(wins) || wins < 0) {
                message.reply('Please provide a valid number of wins (0 or higher).');
                return;
            }
            
            data.scores[userId][rank] = wins;
            saveData(data);
            message.reply(`Set ${mentionedUser.username}'s wins in ${rank} to ${wins}.`);
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