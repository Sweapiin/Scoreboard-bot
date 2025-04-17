// Discord BO7-Scoreboard Bot with Rocket League ranks using slash commands
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const PORT = process.env.PORT || 3000;

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

// Directory for backup files
const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 5;
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`Created backup directory at: ${BACKUP_DIR}`);
    } catch (error) {
        console.error(`Failed to create backup directory: ${error.message}`);
    }
}

// Helper function to get the user's display name
async function getDisplayName(userId, interaction) {
    try {
        // Get the member from the guild
        const member = await interaction.guild.members.fetch(userId);
        // Return the member's display name (nickname if set, otherwise username)
        return member ? member.displayName : 'Unknown User';
    } catch (error) {
        console.error(`Error fetching display name for user ${userId}:`, error);
        // Fallback to username if available, otherwise show 'Unknown User'
        try {
            const user = await client.users.fetch(userId);
            return user ? user.username : 'Unknown User';
        } catch (err) {
            console.error(`Error fetching user ${userId}:`, err);
            return 'Unknown User';
        }
    }
}

// Function to create a backup
async function createBackup() {
    try {
        // Create timestamp for filename
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFilename = path.join(BACKUP_DIR, `scores_backup_${timestamp}.json`);
        
        // Check if original file exists
        if (fs.existsSync(DATA_FILE)) {
            // Copy the file
            fs.copyFileSync(DATA_FILE, backupFilename);
            console.log(`[${new Date().toISOString()}] Created backup: ${backupFilename}`);
            
            // Clean up old backups
            cleanupOldBackups();
            return true;
        } else {
            console.log(`[${new Date().toISOString()}] Backup failed: Data file does not exist`);
            return false;
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Backup failed:`, error);
        return false;
    }
}

// Function to clean up old backups
function cleanupOldBackups() {
    try {
        // List all backup files and sort by creation time
        const backupFiles = fs.readdirSync(BACKUP_DIR)
            .filter(file => file.startsWith('scores_backup_'))
            .map(file => ({
                name: file,
                path: path.join(BACKUP_DIR, file),
                ctime: fs.statSync(path.join(BACKUP_DIR, file)).ctime
            }))
            .sort((a, b) => b.ctime - a.ctime);
        
        // Remove excess backups
        for (const oldFile of backupFiles.slice(MAX_BACKUPS)) {
            fs.unlinkSync(oldFile.path);
            console.log(`Removed old backup: ${oldFile.name}`);
        }
    } catch (error) {
        console.error('Error cleaning up old backups:', error);
    }
}

// Function to list available backups
function listAvailableBackups() {
    try {
        return fs.readdirSync(BACKUP_DIR)
            .filter(file => file.startsWith('scores_backup_'))
            .map(file => ({
                name: file,
                path: path.join(BACKUP_DIR, file),
                ctime: fs.statSync(path.join(BACKUP_DIR, file)).ctime
            }))
            .sort((a, b) => b.ctime - a.ctime);
    } catch (error) {
        console.error('Error listing backups:', error);
        return [];
    }
}

// Function to restore from backup
function restoreFromBackup(backupPath) {
    try {
        if (fs.existsSync(backupPath)) {
            // Create a backup of current data before restoring (if it exists)
            if (fs.existsSync(DATA_FILE)) {
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const preRestoreBackup = path.join(BACKUP_DIR, `pre_restore_${timestamp}.json`);
                fs.copyFileSync(DATA_FILE, preRestoreBackup);
                console.log(`Created pre-restore backup: ${preRestoreBackup}`);
            }
            
            // Copy backup file to main data file
            fs.copyFileSync(backupPath, DATA_FILE);
            console.log(`Restored from backup: ${backupPath}`);
            return true;
        } else {
            console.error(`Backup file not found: ${backupPath}`);
            return false;
        }
    } catch (error) {
        console.error('Error restoring from backup:', error);
        return false;
    }
}

// Function to load data with improved error handling
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        
        // Try to recover from the most recent backup
        const backups = listAvailableBackups();
        
        if (backups.length > 0) {
            try {
                console.log(`Attempting to recover from most recent backup: ${backups[0].name}`);
                const backupData = fs.readFileSync(backups[0].path, 'utf8');
                const parsedData = JSON.parse(backupData);
                
                // Save the recovered data to the main file
                saveData(parsedData);
                
                console.log('Successfully recovered data from backup');
                return parsedData;
            } catch (backupError) {
                console.error('Error recovering from backup:', backupError);
            }
        }
    }
    // Return empty data structure if file doesn't exist or error occurs
    return { scores: {}, matches: [] };
}

// Function to save data with improved error handling
function saveData(data) {
    try {
        // Create a temporary file first
        const tempFile = `${DATA_FILE}.temp`;
        const jsonData = JSON.stringify(data, null, 2);
        
        // Write to temp file
        fs.writeFileSync(tempFile, jsonData, 'utf8');
        
        // Rename temp file to actual file (atomic operation)
        fs.renameSync(tempFile, DATA_FILE);
        
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

// Check if user has admin role
async function isAdmin(member) {
    if (!member) return false;
    try {
        await member.fetch();
        return member.roles.cache.some(role => role.name === config.adminRoleName);
    } catch (error) {
        console.error(`Error checking admin role: ${error.message}`);
        return false;
    }
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
                
    // Match Result Command (now admin-only)
    new SlashCommandBuilder()
        .setName('scoreboard-matchresult')
        .setDescription('Reports a Bo7 match result between two players (Admin only)')
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
        
    // New Backup Commands
    new SlashCommandBuilder()
        .setName('scoreboard-backup')
        .setDescription('Manually create a backup of the scoreboard data (Admin only)'),
    
    new SlashCommandBuilder()
        .setName('scoreboard-listbackups')
        .setDescription('List available backups (Admin only)'),
        
    new SlashCommandBuilder()
        .setName('scoreboard-restore')
        .setDescription('Restore scoreboard data from a backup (Admin only)')
        .addStringOption(option => 
            option.setName('backup')
                .setDescription('Backup number (1-based) or "latest"')
                .setRequired(true)),
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
    const embed = createRankEmbed('Bo7 Match Result', '');
    embed.setDescription(`Match played in ${getRankEmoji(match.rank)} **${match.rank}**`);
    
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

// Active self-pinging to avoid idle timeouts
async function pingOwnServer() {
    try {
        // Get your app URL from environment variable or use a default one
        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        
        console.log(`[${new Date().toISOString()}] Attempting to ping self at ${appUrl}/ping`);
        
        // Using native https/http module for compatibility
        const httpModule = appUrl.startsWith('https') ? require('https') : require('http');
        
        // Create a promise-based request
        const makeRequest = () => {
            return new Promise((resolve, reject) => {
                const req = httpModule.get(`${appUrl}/ping`, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        resolve({ 
                            statusCode: res.statusCode,
                            data: data
                        });
                    });
                });
                
                req.on('error', (err) => {
                    reject(err);
                });
                
                req.end();
            });
        };
        
        const response = await makeRequest();
        
        if (response.statusCode === 200) {
            console.log(`[${new Date().toISOString()}] Successfully pinged own server to keep alive`);
        } else {
            console.log(`[${new Date().toISOString()}] Ping returned status: ${response.statusCode}`);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error pinging self: ${error.message}`);
    }
}

// Add error handling utility function
async function safeReply(interaction, content, options = {}) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(content);
        } else {
            return await interaction.reply({...content, ...options});
        }
    } catch (error) {
        console.error(`Error replying to interaction: ${error.message}`);
        if (error.code === 10062) { // Unknown Interaction error
            console.log('Interaction expired before response was sent');
        }
    }
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
    
    // Create an initial backup when the bot starts
    createBackup().then(success => {
        if (success) {
            console.log('Initial backup created successfully');
        }
    }).catch(error => {
        console.error('Failed to create initial backup:', error);
    });
    
    // Schedule regular backups
    setInterval(() => {
        createBackup().catch(error => {
            console.error('Failed to create scheduled backup:', error);
        });
    }, BACKUP_INTERVAL);
    console.log(`Automatic backup system initialized. Backups will be created every ${BACKUP_INTERVAL/(1000*60*60)} hours.`);
    
    const server = http.createServer((req, res) => {
        if (req.url === '/ping') {
            res.writeHead(200);
            res.end('pong');
        } else {
            res.writeHead(200);
            res.end('BO7-Scoreboard Bot is running!');
        }
    });
    server.listen(PORT, () => {
        console.log(`HTTP server started on port ${PORT}`);
    });

    // More robust keep-alive mechanism
    setInterval(() => {
        try {
            console.log(`[${new Date().toISOString()}] Running keep-alive checks...`);
            
            // 1. Check connection status
            const status = client.ws.status;
            if (status !== 0) {
                console.log(`WebSocket connection is not READY (status: ${status}), attempting to reconnect...`);
                client.destroy().then(() => client.login(process.env.DISCORD_TOKEN))
                    .catch(err => console.error('Error during reconnection:', err));
            } else {
                console.log(`WebSocket connection is healthy (status: ${status})`);
            }
            
            // 2. Ping all guilds (more thorough than just the first one)
            client.guilds.fetch()
                .then(guilds => {
                    console.log(`Successfully fetched ${guilds.size} guilds`);
                    // Fetch the first guild instead of using random() which might not exist
                    if (guilds.size > 0) {
                        const firstGuildId = guilds.first()?.id;
                        if (firstGuildId) {
                            return client.guilds.fetch(firstGuildId);
                        }
                    }
                    return null;
                })
                .then(guild => {
                    if (guild) {
                        console.log(`Successfully fetched guild: ${guild.name}`);
                        // The fetch itself is enough to keep the connection alive
                    }
                })
                .catch(err => console.error("Error in keep-alive process:", err));
        } catch (error) {
            console.error("Error in keep-alive interval:", error);
        }
    }, 30 * 1000); // Every 30 seconds (increased frequency)

    // Add a reconnection mechanism that actively checks
    setInterval(() => {
        try {
            // If websocket is down but client thinks it's connected, force a reconnect
            if (!client.ws.connection || client.ws.connection.readyState !== 1) {
                console.log('WebSocket appears disconnected but client has not reconnected. Forcing reconnection...');
                try {
                    client.destroy().then(() => client.login(process.env.DISCORD_TOKEN))
                        .catch(err => console.error('Error during forced reconnection:', err));
                } catch (err) {
                    console.error('Error during forced reconnection:', err);
                }
            }
        } catch (error) {
            console.error("Error in reconnection check interval:", error);
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    // Set up self-pinging every 2 minutes
    setInterval(() => {
        pingOwnServer().catch(error => {
            console.error('Error during self-ping:', error);
        });
    }, 2 * 60 * 1000);
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
    
    try {
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
            // Defer reply as we're creating an embed (should be fast but let's be safe)
            await interaction.deferReply();
            
            const embed = createRankEmbed('BO7-Scoreboard Bot Help', 'List of available commands:');
            
            embed.addFields(
                { name: '/scoreboard-help', value: 'Shows this help message', inline: false },
                { name: '/scoreboard-stats [user]', value: 'Shows stats for a user (or yourself if no user is specified)', inline: false },
                { name: '/scoreboard-leaderboard [rank]', value: 'Shows leaderboard for all ranks or a specific rank', inline: false },
                { name: '/scoreboard-overview', value: 'Shows a comprehensive overview of all users and their wins across all ranks', inline: false },
                { name: '/scoreboard-matchhistory [user] [limit]', value: 'Show recent match history for all users or a specific user', inline: false },
                { name: '**Admin Commands**', value: 'The following commands require the Admin role:', inline: false },
                { name: '/scoreboard-matchresult', value: 'Record a Bo7 match result between two players (Admin only)', inline: false },
                { name: '/scoreboard-addwin <user> <rank>', value: 'Adds a win for a user in the specified rank', inline: false },
                { name: '/scoreboard-removewin <user> <rank>', value: 'Removes a win for a user in the specified rank', inline: false },
                { name: '/scoreboard-setwins <user> <rank> <wins>', value: 'Sets the wins for a user in the specified rank to a specific value', inline: false },
                { name: '/scoreboard-backup', value: 'Manually create a backup of all data', inline: false },
                { name: '/scoreboard-listbackups', value: 'List all available backups', inline: false },
                { name: '/scoreboard-restore <backup>', value: 'Restore data from a backup', inline: false }
            );
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Stats command
        if (commandName === 'scoreboard-stats') {
            // Defer reply as we're fetching user data
            await interaction.deferReply();
            
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userId = targetUser.id;
            
            // Get display name instead of username
            const displayName = await getDisplayName(userId, interaction);
            
            // Initialize user if not exists
            if (!data.scores[userId]) {
                data.scores[userId] = {};
                RANKS.forEach(rank => data.scores[userId][rank] = 0);
            }
            
            const embed = createRankEmbed(`Stats for ${displayName}`);
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
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Leaderboard command
        if (commandName === 'scoreboard-leaderboard') {
            // Defer reply as we're potentially fetching multiple users
            await interaction.deferReply();
            
            const rank = interaction.options.getString('rank');
            
            const embed = createRankEmbed(rank ? `${rank} Leaderboard` : 'Overall Leaderboard');
            
            if (rank) {
                // Single rank leaderboard
                const userScores = [];
                for (const userId in data.scores) {
                    const wins = data.scores[userId][rank] || 0;
                    if (wins > 0) {
                        try {
                            // Get display name instead of username
                            const displayName = await getDisplayName(userId, interaction);
                            if (displayName) userScores.push({ username: displayName, wins });
                        } catch (error) {
                            console.error(`Error fetching user ${userId}:`, error);
                        }
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
                        try {
                            // Get display name instead of username
                            const displayName = await getDisplayName(userId, interaction);
                            if (displayName) userTotalScores.push({ username: displayName, wins: totalWins });
                        } catch (error) {
                            console.error(`Error fetching user ${userId}:`, error);
                        }
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
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Overview command - shows all users and their wins across all ranks
        if (commandName === 'scoreboard-overview') {
            // Defer reply as we're fetching multiple users (potentially many)
            await interaction.deferReply();
            
            // Get all users who have at least one win
            const userIds = Object.keys(data.scores).filter(userId => {
                return RANKS.some(rank => (data.scores[userId][rank] || 0) > 0);
            });
            
            if (userIds.length === 0) {
                await safeReply(interaction, { content: 'No scores recorded yet.' });
                return;
            }
            
            // Create a fancy overview embed
            const embed = createRankEmbed('Complete Scoreboard Overview', 'All users and their wins across all ranks:');
            
            // Process data for each user
            const userEmbeds = [];
            
            for (const userId of userIds) {
                try {
                    // Get display name instead of username
                    const displayName = await getDisplayName(userId, interaction);
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
                            name: `${displayName}`,
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
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Match result command - NOW ADMIN ONLY
        if (commandName === 'scoreboard-matchresult') {
            // Defer reply as we need to verify permissions and save data
            await interaction.deferReply();
            
            // Check if user has admin role
            if (!(await isAdmin(interaction.member))) {
                await safeReply(interaction, { 
                    content: 'You do not have permission to use this command. Only admins can record match results.',
                    ephemeral: true 
                });
                return;
            }
            
            const player1 = interaction.options.getUser('player1');
            const player2 = interaction.options.getUser('player2');
            const rank = interaction.options.getString('rank');
            const winner = interaction.options.getUser('winner');
            const winnerScore = interaction.options.getInteger('winner_score') || 4; // Default to 4 for Bo7
            const loserScore = interaction.options.getInteger('loser_score');
            
            // Validate the input
            if (winner.id !== player1.id && winner.id !== player2.id) {
                await safeReply(interaction, { 
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
            const player1DisplayName = await getDisplayName(player1.id, interaction);
            const player2DisplayName = await getDisplayName(player2.id, interaction);
            const winnerDisplayName = winner.id === player1.id ? player1DisplayName : player2DisplayName;
            const loserDisplayName = winner.id === player1.id ? player2DisplayName : player1DisplayName;
            
            // Add the match to the history
            const matchData = {
                player1: {
                    id: player1.id,
                    username: player1DisplayName
                },
                player2: {
                    id: player2.id,
                    username: player2DisplayName
                },
                rank: rank,
                winner: {
                    id: winner.id,
                    username: winnerDisplayName
                },
                loser: {
                    id: loser.id,
                    username: loserDisplayName
                },
                winnerScore: winnerScore,
                loserScore: loserScore,
                date: new Date().toISOString()
            };
            
            data.matches.push(matchData);
            
            // Initialize users if not exists
            if (!data.scores[winner.id]) {
                data.scores[winner.id] = {};
                RANKS.forEach(r => data.scores[winner.id][r] = 0);
            }
            
            // Add win to the winner's record
            data.scores[winner.id][rank] = (data.scores[winner.id][rank] || 0) + 1;
            
            // Save data and create a backup
            saveData(data);
            try {
                await createBackup();
            } catch (error) {
                console.error('Failed to create backup after match result:', error);
            }
            
            // Create rich embed for match result
            const embed = createMatchResultEmbed(matchData);
            
            // Add a notice that the win was recorded
            embed.addFields({ name: 'Win Recorded', value: `A win has been automatically added to ${winnerDisplayName}'s record in ${rank}.` });
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Match history command
        if (commandName === 'scoreboard-matchhistory') {
            // Defer reply as we may need to process a lot of match history data
            await interaction.deferReply();
            
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 5;
            
            // Check if we have any match history
            if (!data.matches || data.matches.length === 0) {
                await safeReply(interaction, { content: 'No match history recorded yet.' });
                return;
            }
            
            // Filter matches for the specific user if provided
            let filteredMatches = data.matches;
            if (targetUser) {
                filteredMatches = data.matches.filter(match => 
                    match.player1.id === targetUser.id || match.player2.id === targetUser.id
                );
                
                if (filteredMatches.length === 0) {
                    await safeReply(interaction, { content: `No match history found for ${await getDisplayName(targetUser.id, interaction)}.` });
                    return;
                }
            }
            
            // Sort matches by date (newest first)
            filteredMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Create embed
            const title = targetUser 
            ? `Match History for ${await getDisplayName(targetUser.id, interaction)}`
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
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Backup command (Admin only)
        if (commandName === 'scoreboard-backup') {
            // Defer reply as we need to verify permissions and create backup
            await interaction.deferReply();
            
            // Check if user has admin role
            if (!(await isAdmin(interaction.member))) {
                await safeReply(interaction, { 
                    content: 'You do not have permission to use this command. Only admins can create backups.',
                    ephemeral: true 
                });
                return;
            }
            
            // Create the backup
            try {
                const success = await createBackup();
                
                if (success) {
                    const embed = createRankEmbed('Backup Created', 
                        `A backup of the scoreboard data has been successfully created.\n\nBackups are stored in the '${BACKUP_DIR}' directory and kept for future recovery if needed.`);
                    
                    await safeReply(interaction, { embeds: [embed] });
                } else {
                    await safeReply(interaction, { 
                        content: 'Failed to create backup. Please check the server logs for more information.',
                        ephemeral: true 
                    });
                }
            } catch (error) {
                console.error('Error creating backup from command:', error);
                await safeReply(interaction, { 
                    content: `Failed to create backup: ${error.message}`,
                    ephemeral: true 
                });
            }
            
            return;
        }
        
        // List backups command (Admin only)
        if (commandName === 'scoreboard-listbackups') {
            // Defer reply as we need to verify permissions and list backups
            await interaction.deferReply();
            
            // Check if user has admin role
            if (!(await isAdmin(interaction.member))) {
                await safeReply(interaction, { 
                    content: 'You do not have permission to use this command. Only admins can list backups.',
                    ephemeral: true 
                });
                return;
            }
            
            // Get list of backups
            const backups = listAvailableBackups();
            
            if (backups.length === 0) {
                await safeReply(interaction, { content: 'No backups found.' });
                return;
            }
            
            // Create embed for backup list
            const embed = createRankEmbed('Available Backups', 
                `There are ${backups.length} backups available. Use \`/scoreboard-restore\` to restore from a backup.`);
            
            // Add each backup to the embed
            backups.forEach((backup, index) => {
                const creationDate = new Date(backup.ctime);
                const formattedDate = creationDate.toLocaleString();
                const sizeKB = (fs.statSync(backup.path).size / 1024).toFixed(2);
                
                embed.addFields({
                    name: `Backup #${index + 1}`,
                    value: `**Name**: ${backup.name}\n**Created**: ${formattedDate}\n**Size**: ${sizeKB} KB`,
                    inline: true
                });
            });
            
            await safeReply(interaction, { embeds: [embed] });
            return;
        }
        
        // Restore backup command (Admin only)
        if (commandName === 'scoreboard-restore') {
            // Defer reply as we need to verify permissions and restore backup
            await interaction.deferReply();
            
            // Check if user has admin role
            if (!(await isAdmin(interaction.member))) {
                await safeReply(interaction, { 
                    content: 'You do not have permission to use this command. Only admins can restore backups.',
                    ephemeral: true 
                });
                return;
            }
            
            try {
                // Get list of backups
                const backups = listAvailableBackups();
                
                if (backups.length === 0) {
                    await safeReply(interaction, { content: 'No backups found to restore from.' });
                    return;
                }
                
                // Get the specified backup
                const backupOption = interaction.options.getString('backup');
                let selectedBackup;
                
                if (backupOption === 'latest') {
                    selectedBackup = backups[0]; // First backup is the latest due to sort order
                } else {
                    const backupNumber = parseInt(backupOption);
                    
                    if (isNaN(backupNumber) || backupNumber < 1 || backupNumber > backups.length) {
                        await safeReply(interaction, { 
                            content: `Invalid backup number. Please specify a number between 1 and ${backups.length}, or use "latest".`,
                            ephemeral: true 
                        });
                        return;
                    }
                    
                    selectedBackup = backups[backupNumber - 1]; // Convert to 0-based index
                }
                
                // Just restore without using buttons (simpler approach)
                // Create a backup of current data first
                await createBackup();
                
                // Now restore from the selected backup
                const success = restoreFromBackup(selectedBackup.path);
                
                if (success) {
                    const embed = createRankEmbed('Backup Restored', 
                        `✅ Successfully restored data from backup: **${selectedBackup.name}**\n\n` +
                        `Created on: ${new Date(selectedBackup.ctime).toLocaleString()}\n\n` +
                        `A backup of your previous data was created before restoring.`);
                    
                    await safeReply(interaction, { embeds: [embed] });
                } else {
                    await safeReply(interaction, { 
                        content: `❌ Failed to restore from backup. Please check the server logs for more information.`,
                        ephemeral: true
                    });
                }
            } catch (error) {
                console.error('Error during backup restoration:', error);
                await safeReply(interaction, { 
                    content: `❌ Error during backup restoration: ${error.message}`,
                    ephemeral: true
                });
            }
            
            return;
        }
        
        // Admin commands for wins management
        if (['scoreboard-addwin', 'scoreboard-removewin', 'scoreboard-setwins'].includes(commandName)) {
            // Defer reply as we need to check permissions and save data
            await interaction.deferReply();
            
            // Check if user has admin role
            if (!(await isAdmin(interaction.member))) {
                await safeReply(interaction, { 
                    content: 'You do not have permission to use this command. Only admins can modify wins.',
                    ephemeral: true 
                });
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
                try {
                    await createBackup(); // Create a backup after important changes
                } catch (error) {
                    console.error('Failed to create backup after adding win:', error);
                }
                
                const displayName = await getDisplayName(userId, interaction);
                const embed = createRankEmbed('Win Added', `Added a win for ${displayName} in ${getRankEmoji(rank)} **${rank}**.\n\nThey now have **${data.scores[userId][rank]} wins** in this rank.`);
                
                await safeReply(interaction, { embeds: [embed] });
            } else if (commandName === 'scoreboard-removewin') {
                // Remove a win
                if (data.scores[userId][rank] > 0) {
                    data.scores[userId][rank]--;
                    saveData(data);
                    try {
                        await createBackup(); // Create a backup after important changes
                    } catch (error) {
                        console.error('Failed to create backup after removing win:', error);
                    }
                    
                    const displayName = await getDisplayName(userId, interaction);
                    const embed = createRankEmbed('Win Removed', `Removed a win from ${displayName} in ${getRankEmoji(rank)} **${rank}**.\n\nThey now have **${data.scores[userId][rank]} wins** in this rank.`);
                    
                    await safeReply(interaction, { embeds: [embed] });
                } else {
                    const displayName = await getDisplayName(userId, interaction);
                    await safeReply(interaction, { 
                        content: `${displayName} has no wins to remove in ${rank}.`
                    });
                }
            } else if (commandName === 'scoreboard-setwins') {
                // Set wins to a specific value
                const wins = interaction.options.getInteger('wins');
                
                data.scores[userId][rank] = wins;
                saveData(data);
                try {
                    await createBackup(); // Create a backup after important changes
                } catch (error) {
                    console.error('Failed to create backup after setting wins:', error);
                }
                
                const displayName = await getDisplayName(userId, interaction);
                const embed = createRankEmbed('Wins Updated', `Set ${displayName}'s wins in ${getRankEmoji(rank)} **${rank}** to **${wins}**.`);
                
                await safeReply(interaction, { embeds: [embed] });
            }
            
            return;
        }
    } catch (error) {
        // Global error handler for all command processing
        console.error(`Error processing command ${interaction.commandName}:`, error);
        
        try {
            // Try to inform the user that something went wrong
            const errorMessage = error.code === 10062 
                ? "The response took too long to process. Please try again."
                : "An error occurred while processing your command. Please try again.";
                
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: errorMessage
                });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            }
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
});