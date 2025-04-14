# BO7-Scoreboard Discord Bot

A Discord bot for tracking Best of 7 (BO7) scores with Rocket League ranking system.

## Features

- Track wins for users across different ranks (Bronze, Silver, Gold, Platinum, Diamond, Champion, Grand Champion, Super Sonic Legend)
- Admin commands to add/remove/set wins for users
- View user stats and leaderboards
- Persistent storage of score data

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.9.0 or higher)
- A Discord account and a server where you have admin permissions

### Step 1: Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Navigate to the "Bot" tab
4. Click "Add Bot"
5. Under the "Privileged Gateway Intents" section, enable:
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
6. Save changes
7. Click "Reset Token" and copy your bot token (keep this secret!)

### Step 2: Invite the Bot to Your Server

1. Go to the "OAuth2" tab, then "URL Generator"
2. Under "Scopes", select "bot"
3. Under "Bot Permissions", select:
   - Read Messages/View Channels
   - Send Messages
   - Embed Links
   - Read Message History
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### Step 3: Set Up the Bot

1. Clone or download this repository
2. Install dependencies:
   ```
   npm install discord.js
   ```
3. Open `bot.js` and update:
   - `YOUR_DISCORD_BOT_TOKEN` with your bot token
   - (Optional) Change `adminRoleName` if your admin role is called something other than "Admin"

### Step 4: Run the Bot

1. Start the bot:
   ```
   node bot.js
   ```
2. The bot should now be online in your Discord server

## Commands

### User Commands

- `!help` - Shows the help message with available commands
- `!stats [user]` - Shows stats for a user (or yourself if no user is specified)
- `!leaderboard [rank]` - Shows leaderboard for all ranks or a specific rank

### Admin Commands

- `!addwin <user> <rank>` - Adds a win for a user in the specified rank
- `!removewin <user> <rank>` - Removes a win for a user in the specified rank
- `!setwins <user> <rank> <wins>` - Sets the wins for a user in the specified rank to a specific value

## Ranks

The bot supports these ranks (case insensitive in commands):
- Bronze
- Silver
- Gold
- Platinum
- Diamond
- Champion
- Grand Champion
- Super Sonic Legend

## Examples

- `!addwin @User Bronze` - Adds a win for the mentioned user in Bronze rank
- `!stats @User` - Shows all stats for the mentioned user
- `!leaderboard Diamond` - Shows the leaderboard for Diamond rank

## Troubleshooting

- If the bot doesn't respond, check if it's online and has proper permissions
- If commands don't work, make sure you're using the correct prefix (default is `!`)
- For admin commands, make sure you have a role named exactly "Admin" (or update the `adminRoleName` in the config)

## Data Storage

All score data is stored in a `scores.json` file. This file is created automatically when the bot runs.

## Deploying to Render.com

To deploy this bot on Render.com and prevent it from sleeping:

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Use the following settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add the following environment variables:
   - `DISCORD_TOKEN`: Your Discord bot token
   - `PORT`: Will be set automatically by Render
5. For the admin role name, you can either:
   - Use the default "Admin" role name already configured in the code
   - Change the `adminRoleName` in the `bot.js` file
   - Set an environment variable `ADMIN_ROLE_NAME` on Render.com

The bot includes:
- A 2-minute self-ping mechanism to prevent the bot from sleeping
- An HTTP server that listens on the PORT environment variable as required by Render
