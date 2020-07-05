require("dotenv").config();

const request = require("request");
const Telegraf = require("telegraf");
const Stage = require("telegraf/stage");
const session = require("telegraf/session");
const turfHelpers = require("@turf/helpers");
const WizardScene = require("telegraf/scenes/wizard");

//
// process.env:
//   FAUNA_SECRET_KEY
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_ADMIN_CHATID
//   OPENROUTESERVICE_KEY
//   NETLIFY_BUILD_HOOK
//

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const cloud = require("./cloudinary");
const ors = require("./ors");
const db = require("./db");

//
// Commands
//

bot.use(session());

bot.start((ctx) => {
  ctx.reply(["Bienvenidos a geoDaveyBot!"].join("\n"));
});

bot.command("build", (ctx) => {
  if (
    parseInt(ctx.message.chat.id) ===
    parseInt(process.env.TELEGRAM_ADMIN_CHATID)
  )
    request.post(process.env.NETLIFY_BUILD_HOOK, () => {
      ctx.reply("Build Triggered!");
    });
});

bot.command("skobuffs", (ctx) => {
  ctx.reply("sko buffs!");
});

bot.command("chatid", (ctx) => {
  ctx.reply(`Chat ID: ${ctx.message.chat.id}`);
});

//
// Process Photo/Location Update
//

const updateStage = new Stage([
  new WizardScene(
    "update",
    //
    // Capture photo info
    async (ctx) => {
      console.log("scene1");
      // last pic in photo array is highest resolution
      ctx.wizard.state.photo_id =
        ctx.message.photo[ctx.message.photo.length - 1].file_id;
      ctx.wizard.state.caption = ctx.message.caption;

      return ctx.wizard.next();
    },
    //
    // Capture location info
    async (ctx) => {
      console.log("scene2");
      if (!("location" in ctx.message)) {
        ctx.reply("Error: Update photo must be followed by location");
        return ctx.scene.leave();
      }

      ctx.wizard.state.longitude = ctx.message.location.longitude;
      ctx.wizard.state.latitude = ctx.message.location.latitude;

      ctx.wizard.next();
      return ctx.wizard.steps[ctx.wizard.cursor](ctx);
    },
    //
    // Add update and calculate route and upload
    async (ctx) => {
      let state = ctx.wizard.state;

      // Upload Photo
      let tempPicLink = await bot.telegram.getFileLink(state.photo_id);
      let picLink = await cloud.uploadPhoto(tempPicLink);

      // Assemble geoJSON feature for new update
      let newUpdate = turfHelpers.point([state.longitude, state.latitude], {
        photo: picLink,
        caption: state.caption,
        date: new Date().toISOString(),
      });

      // Insert update to DB!
      db.addToCollection("updates", newUpdate)
        .then(() => {
          ctx.reply("Added Update!");
        })
        .catch((err) => {
          ctx.reply(`Update error: ${err.message || err}`);
        });

      // Get prev update from database. No need for track if first update
      let prevUpdate = await db.getPrevUpdate();
      if (!prevUpdate) return ctx.scene.leave();

      // If there is a previous update, calculate a route
      if (prevUpdate) {
        let waypoints = await db.getAllWaypointsAfterTime(prevUpdate.ts);

        ors
          .calcHikingRoute(prevUpdate.data, newUpdate, waypoints)
          .then((route) => {
            db.addToCollection("tracks", route).then(() => {
              ctx.reply("Added Update Track!");
              return ctx.scene.leave();
            });
          })
          .catch((err) => {
            // If the route isn't able to be calculated somehow
            // just add a route between the last waypoint and current one
            ctx.reply(`Track Error: ${err.message || err}`);

            let prevCoords = prevUpdate.data.geometry.coordinates;
            let newCoords = newUpdate.geometry.coordinates;

            let route = turfHelpers.feature(
              turfHelpers.lineString([[prevCoords, newCoords]]),
              {
                ascent: null,
                descent: null,
                distance: null,
                duration: null,
              }
            );

            db.addToCollection("tracks", route).then(() => {
              ctx.reply(`Added Simple Route`);
              
              return ctx.scene.leave();
            });
          });
      }
    }
  ),
]);

bot.use(updateStage.middleware());

//
// Capture all messages, trigger waypoints/updates
//

bot.on("message", async (ctx) => {
  let msg = ctx.update.message;

  // don't process commands here
  if ("text" in msg && msg.text.substr(0, 1) === "/") return;

  // only allow waypoints/updates for admin
  if (
    parseInt(ctx.message.chat.id) ===
    parseInt(process.env.TELEGRAM_ADMIN_CHATID)
  ) {
    // if a photo is sent by admin in no context, it's an update
    if ("photo" in msg) ctx.scene.enter("update");
    // if a location is sent in no context, it's waypoint
    else if ("location" in msg) {
      let { longitude, latitude } = msg.location;
      let wayFeature = turfHelpers.point([longitude, latitude]);

      // add waypoints to DB
      db.addToCollection("waypoints", wayFeature)
        .then(() => {
          ctx.reply(`Added ${longitude}, ${latitude}`);
        })
        .catch((err) => {
          ctx.reply(`Waypt error: ${err.message || err}`);
        });
    }
  }
});

//
// Netlify Lambda process webhook from Telegram API
//

exports.handler = async (event, context, callback) => {
  try {
    let bodyJson = JSON.parse(event.body);

    await bot.handleUpdate(bodyJson);

    callback(null, {
      statusCode: 200,
      body: "woot!",
    });
  } catch (e) {
    callback(e, {
      statusCode: 400,
      body: "error: for bots only",
    });
  }
};
