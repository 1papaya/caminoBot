# caminoBot
Telegram bot to record waypoints and stitch together GPS tracks in realtime, built for long-distance travellers to use in resource constrained environments.

## Installation
1.  Create an account at the following services (all free):
   
    * [FaunaDB](https://fauna.com): To store database of waypoints, updates & tracks
    * [GitHub](https://github.com): To fork this repository and host source code
    * [Telegram](https://telegram.com): To create and interact with Telegram bot
    * [OpenRouteService](https://openrouteservice.org): To calculate walking routes
    * [Netlify](https://netlify.com): To host caminoBot Lambda Function
    * [Cloudinary](https://cloudinary.com): To store update photos

2. On FaunaDB, create a new database with name "caminoBot" and three collections "waypoints", "tracks", "updates", and generate an API key with full access to the collections.

3. On Cloudinary, create a folder with your chosen name to store all the update pictures
   
4. Click the button below to fork this repository and deploy to GitHub:

   [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/geoDavey/caminoBot)
   
   When the repo is successfully deployed, Netlify will provide you a site URL that looks like this: http://[your-site].netlify.app

5.  Create a Telegram bot by messaging @botFather ([more info](https://core.telegram.org/bots#3-how-do-i-create-a-bot)). Once you get a bot token for your new bot, open up a web browser and navigate the following URL filled in with the correct info. You should get a response 200 which means your bot is now configured to post any new messages it receives to your new webhook.

   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={NETLIFY_APP_URL}/api/bot
   ```
   
7.  In the Netlify Deploy settings, add the following environment variables taken from each of the services signed up for:
   
   ```
   OPENROUTESERVICE_KEY=''
   FAUNA_SECRET_KEY=''
   TELEGRAM_BOT_TOKEN=''
   CLOUDINARY_FOLDER=''
   CLOUDINARY_CLOUD_NAME=''
   CLOUDINARY_API_KEY=''
   CLOUDINARY_API_SECRET=''
   ```
   
8. Manually trigger a Netlify rebuild to initialize the bot with all the correct environment variables.

9. Send your bot the command `/chatid` and it will return you a unique ID of the chat you are having with the bot. On the Netlify console set environment variable `TELEGRAM_ADMIN_CHATID` with this ID. This will be used to ensure only your user can message the bot, nobody else.
   
10. At this point, you have fully configured the bot to add waypoints, tracks, and updates to the FaunaDB database by messaging the bot on Telegram. For the most fun, you will probably want to use this data on something (ie a map). If this map is a static site hosted on Netlify, you can configure caminoBot to trigger the build hook on the `/build` command and update your position in realtime.

    To do this, go to Netlify Deploy settings on your static site and generate a build hook url, and then add the URL as environment variable `NETLIFY_BUILD_HOOK` on caminoBot.
    
    