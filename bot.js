// Discord BO7-Scoreboard Bot with Rocket League ranks using slash commands
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
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
    ],
    // Add better reconnection options
    restRequestTimeout: 60000,
    restGlobalRateLimit: 50,
    // Don't give up on reconnecting
    retryLimit: Infinity,
    // Better heartbeat settings
    ws: {
        large_threshold: 50
    }
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
    return { scores: {}, matches: [] };
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
                
    // New Match Result Command
    new SlashCommandBuilder()
    .setName('scoreboard-matchresult')
    .setDescription('Reports a Bo7 match result between two players')
    .addUserOption(option => 
        option.setName('player1')
            .setDescription('First player in the match')
            .setRequired(true))
    .addUserOption(option => 
        option.setName('player2')
            .setDescription('Second player in the match')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('rank')
            .setDescription('The rank the match was played at')
            .setRequired(true)
            .addChoices(
                ...RANKS.map(rank => ({ name: rank, value: rank }))
            ))
    .addUserOption(option => 
        option.setName('winner')
            .setDescription('The player who won the match')
            .setRequired(true))
    .addIntegerOption(option => 
        option.setName('winner_score')
            .setDescription('Number of games won by the winner (default: 4 in a Bo7)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(7))
    .addIntegerOption(option => 
        option.setName('loser_score')
            .setDescription('Number of games won by the loser')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(6)),
    
    // Match History Command
    new SlashCommandBuilder()
        .setName('scoreboard-matchhistory')
        .setDescription('Shows recent match history')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('Filter history to a specific user')
                .setRequired(false))
        .addIntegerOption(option => 
            option.setName('limit')
                .setDescription('Number of matches to show (default: 5)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)),
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

// Function to create a match result embed
function createMatchResultEmbed(match) {
    const embed = createRankEmbed('Bo7 Match Result', `Match played in ${getRankEmoji(match.rank)} **${match.rank}**`);
    
    // Format the result prominently
    embed.addFields(
        { 
            name: 'Players', 
            value: `**${match.player1.username}** vs **${match.player2.username}**`, 
            inline: false 
        },
        { 
            name: 'Result', 
            value: `**${match.winner.username}** defeated **${match.loser.username}**\n**${match.winnerScore}-${match.loserScore}**`, 
            inline: false 
        }
    );
    
    // Add visual winner indicator with trophy emoji
    embed.addFields({ 
        name: 'Winner', 
        value: `🏆 **${match.winner.username}** 🏆`, 
        inline: false 
    });
    
    // Add match date
    const matchDate = new Date(match.date);
    embed.setTimestamp(matchDate);
    
    return embed;
}

// Function to get rank emoji - uses custom server emoji
function getRankEmoji(rank) {
    // Replace these IDs with the actual emoji IDs from your server
    // To get an emoji ID, type \:your_emoji: in Discord chat
    const emojiMap = {
        'Bronze': '<:bronze:1361354230920909101>',
        'Silver': '<:silver:1361353806125994135>',
        'Gold': '<:gold:1361352717515227288>',
        'Platinum': '<:platinum:1361353305254531096>',
        'Diamond': '<:diamond:1361353672180764786>',
        'Champion': '<:champ:1361352751669313566>',
        'Grand Champion': '<:grandchamp:1361354065295966378>',
        'Super Sonic Legend': '<:ssl:1361353029240094923>'
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
    
    // Set up a more effective keep-alive mechanism
    // Ping Discord API every minute to keep connection alive
    setInterval(() => {
        console.log(`[${new Date().toISOString()}] Keeping bot connection alive with API ping`);
        
        // Perform a lightweight API request to keep the connection fresh
        client.guilds.fetch(client.guilds.cache.first()?.id || '0')
            .then(() => console.log("Successfully pinged Discord API"))
            .catch(err => console.error("Error pinging Discord API:", err));
            
    }, 60 * 1000); // Every minute
});

// Add reconnection handlers
client.on('disconnect', (event) => {
    console.error(`Bot disconnected with code ${event.code}. Reason: ${event.reason}`);
});

client.on('reconnecting', () => {
    console.log('Bot is reconnecting...');
});

client.on('resumed', (replayed) => {
    console.log(`Bot connection resumed. ${replayed} events replayed.`);
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
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
    
    // Initialize matches array if it doesn't exist
    if (!data.matches) {
        data.matches = [];
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
            { name: '/scoreboard-matchresult', value: 'Record a Bo7 match result between two players', inline: false },
            { name: '/scoreboard-matchhistory [user] [limit]', value: 'Show recent match history for all users or a specific user', inline: false },
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
    
    // Match result command
    if (commandName === 'scoreboard-matchresult') {
        const player1 = interaction.options.getUser('player1');
        const player2 = interaction.options.getUser('player2');
        const rank = interaction.options.getString('rank');
        const winner = interaction.options.getUser('winner');
        const winnerScore = interaction.options.getInteger('winner_score') || 4; // Default to 4 for Bo7
        const loserScore = interaction.options.getInteger('loser_score');
        
        // Validate the input
        if (winner.id !== player1.id && winner.id !== player2.id) {
            await interaction.reply({ 
                content: 'The winner must be one of the two players in the match.',
                ephemeral: true
            });
            return;
        }
        
        // Determine the loser
        const loser = winner.id === player1.id ? player2 : player1;
        
        // Create a match record in the data object
        if (!data.matches) {
            data.matches = [];
        }
        
        // Add the match to the history
        const matchData = {
            player1: {
                id: player1.id,
                username: player1.username
            },
            player2: {
                id: player2.id,
                username: player2.username
            },
            rank: rank,
            winner: {
                id: winner.id,
                username: winner.username
            },
            loser: {
                id: loser.id,
                username: loser.username
            },
            winnerScore: winnerScore,
            loserScore: loserScore,
            date: new Date().toISOString()
        };
        
        data.matches.push(matchData);
        
        // If user has admin permissions, automatically update the win count
        if (await isAdmin(interaction.member)) {
            // Initialize users if not exists
            if (!data.scores[winner.id]) {
                data.scores[winner.id] = {};
                RANKS.forEach(r => data.scores[winner.id][r] = 0);
            }
            
            // Add win to the winner's record
            data.scores[winner.id][rank] = (data.scores[winner.id][rank] || 0) + 1;
            
            saveData(data);
            
            // Create rich embed for match result
            const embed = createMatchResultEmbed(matchData);
            
            // Add a notice that the win was automatically recorded
            embed.addFields({ name: 'Win Recorded', value: `A win has been automatically added to ${winner.username}'s record in ${rank}.` });
            
            await interaction.reply({ embeds: [embed] });
        } else {
            // User doesn't have admin rights - just report the match result without adding wins
            saveData(data);
            
            // Create rich embed for match result
            const embed = createMatchResultEmbed(matchData);
            
            // Add a note that an admin needs to record the win
            embed.addFields({ name: 'Note', value: 'This match result has been saved, but an admin needs to use `/scoreboard-addwin` to update the win record.' });
            
            await interaction.reply({ embeds: [embed] });
        }
        
        return;
    }
    
    // Match history command
    if (commandName === 'scoreboard-matchhistory') {
        const targetUser = interaction.options.getUser('user');
        const limit = interaction.options.getInteger('limit') || 5;
        
        // Check if we have any match history
        if (!data.matches || data.matches.length === 0) {
            await interaction.reply('No match history recorded yet.');
            return;
        }
        
        // Filter matches for the specific user if provided
        let filteredMatches = data.matches;
        if (targetUser) {
            filteredMatches = data.matches.filter(match => 
                match.player1.id === targetUser.id || match.player2.id === targetUser.id
            );
            
            if (filteredMatches.length === 0) {
                await interaction.reply(`No match history found for ${targetUser.username}.`);
                return;
            }
        }
        
        // Sort matches by date (newest first)
        filteredMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Create embed
        const title = targetUser 
            ? `Match History for ${targetUser.username}`
            : 'Recent Match History';
            
        const embed = createRankEmbed(title);
        
        // Add the most recent matches
        const matchesToShow = filteredMatches.slice(0, limit);
        
        let description = '';
        matchesToShow.forEach((match, index) => {
            const matchDate = new Date(match.date);
            const formattedDate = `${matchDate.toLocaleDateString()} ${matchDate.toLocaleTimeString()}`;
            
            description += `**Match ${index + 1}** - ${formattedDate}\n`;
            description += `${getRankEmoji(match.rank)} **${match.rank}**\n`;
            description += `${match.player1.username} vs ${match.player2.username}\n`;
            description += `Winner: **${match.winner.username}** (${match.winnerScore}-${match.loserScore})\n\n`;
        });
        
        embed.setDescription(description);
        
        if (filteredMatches.length > limit) {
            embed.setFooter({ 
                text: `Showing ${limit} of ${filteredMatches.length} matches. Use /scoreboard-matchhistory with a higher limit to see more.`,
                iconURL: 'https://i.imgur.com/6cY7QT7.png' 
            });
        }
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    // Admin commands from here
    if (['scoreboard-addwin', 'scoreboard-removewin', 'scoreboard-setwins'].includes(commandName)) {
        // Check if user has admin role
        if (!(await isAdmin(interaction.member))) {
            await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
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
                await interaction.reply({ content: `${mentionedUser.username} has no wins to remove in ${rank}.`, flags: MessageFlags.Ephemeral });
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

// Create a more robust HTTP server for Render.com
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        // Health check endpoint
        const healthStatus = {
            status: 'up',
            timestamp: new Date().toISOString(),
            discordConnection: client.ws.status === 0 ? 'connected' : 'disconnected',
            uptime: process.uptime(),
            readyAt: client.readyAt ? client.readyAt.toISOString() : null,
            ping: client.ws.ping
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthStatus, null, 2));
    } else {
        // Standard response
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('BO7-Scoreboard Bot is running!\n');
    }
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