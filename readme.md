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
   npm install
   ```
3. Set up your environment variables:
   - Copy `.env.example` to a new file called `.env`
   - Open `.env` and add your Discord bot token:
     ```
     DISCORD_TOKEN=your_discord_token_here
     ```
   - Optionally change the admin role name if needed:
     ```
     ADMIN_ROLE_NAME=CustomAdminRoleName
     ```

### Step 4: Run the Bot

1. Start the bot:
   ```
   node bot.js
   ```
2. The bot should now be online in your Discord server

## Commands

### User Commands

- `/scoreboardhelp` - Shows the help message with available commands
- `/scoreboardstats [user]` - Shows stats for a user (or yourself if no user is specified)
- `/scoreboardleaderboard [rank]` - Shows leaderboard for all ranks or a specific rank
- `/scoreboardoverview` - Shows a comprehensive overview of all users and their wins across all ranks

### Admin Commands

- `/scoreboardaddwin <user> <rank>` - Adds a win for a user in the specified rank
- `/scoreboardremovewin <user> <rank>` - Removes a win for a user in the specified rank
- `/scoreboardsetwins <user> <rank> <wins>` - Sets the wins for a user in the specified rank to a specific value

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

- `/scoreboardaddwin @User Bronze` - Adds a win for the mentioned user in Bronze rank
- `/scoreboardstats @User` - Shows all stats for the mentioned user
- `/scoreboardleaderboard Diamond` - Shows the leaderboard for Diamond rank
- `/scoreboardoverview` - Shows a comprehensive overview of all users and their ranks

## Troubleshooting

- If the bot doesn't respond, check if it's online and has proper permissions
- If commands don't work, make sure you're using the correct prefix (default is `/scoreboard`)
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
   - `ADMIN_ROLE_NAME` (optional): Name of your admin role if not "Admin"
   - `PORT`: Will be set automatically by Render

The bot includes:
- A 2-minute self-ping mechanism to prevent the bot from sleeping
- An HTTP server that listens on the PORT environment variable as required by Render

### Important Notes for Render.com Deployment

- The free tier of Render spins down web services after periods of inactivity, despite the self-ping
- For more reliable uptime, consider upgrading to a paid plan
- The `scores.json` file will be stored in the container's filesystem, which is ephemeral on Render's free tier. For persistent storage, consider implementing a database solution.

## Security Notes

### Protecting Your Bot Token

- **NEVER commit your bot token to GitHub or any public repository**
- Always use environment variables or a `.env` file that's listed in `.gitignore`
- If you accidentally expose your token, reset it immediately in the Discord Developer Portal
- When sharing code snippets, make sure your token is not included

GitHub automatically scans repositories for leaked tokens and will notify you if it finds any. Discord also monitors for leaked tokens and will invalidate them automatically.

### Setting Up Local Development

1. Use the provided `.env.example` file as a template
2. Create a new file called `.env` with your actual token
3. This file will be ignored by git (thanks to `.gitignore`)
4. Make sure to set up environment variables on your hosting platform