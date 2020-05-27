const Telegraf = require("telegraf");
const Stage = require("telegraf/stage");
const session = require("telegraf/session");
const faunadb = require("faunadb"),
  q = faunadb.query;
const turfHelpers = require("@turf/helpers");
const WizardScene = require("telegraf/scenes/wizard");

//
// process.env:
//   FAUNA_SECRET_KEY
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_ADMIN_CHATID
//   OPENROUTESERVICE_KEY
//

const db = new faunadb.Client({ secret: process.env.FAUNA_SECRET_KEY });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

//
// Commands
//

bot.use(session());

bot.start((ctx) => {
  ctx.reply(
    [
      "Bienvenidos!",
      "",
      "/subscribe - subscribe to updates",
      "/unsubscribe - unsubscribe",
    ].join("\n")
  );
});

bot.command("skobuffs", (ctx) => {
  ctx.reply("sko buffs!");
});

bot.command("chatid", (ctx) => {});
bot.command("subscribe", (ctx) => {});
bot.command("unsubscribe", (ctx) => {});
bot.command("whereami", (ctx) => {});

//
// Process update
//

const updateStage = new Stage([
  new WizardScene(
    "update",
    (ctx) => {
      ctx.reply("skoooo!!!");
      return ctx.scene.leave();
    },
    // Capture photo info
    async (ctx) => {
      let msg = ctx.message;

      // last pic in photo array is highest resolution
      ctx.wizard.state.photo_id = msg.photo[msg.photo.length - 1].file_id;
      ctx.wizard.state.caption = msg.caption;

      return ctx.wizard.next();
    },
    // Capture location info
    async (ctx) => {
      if (!("location" in ctx.message)) {
        ctx.reply("Error: Postcard must be followed by location");
        return ctx.scene.leave();
      }

      ctx.wizard.state.longitude = ctx.message.location.longitude;
      ctx.wizard.state.latitude = ctx.message.location.latitude;

      return ctx.wizard.next();
    },
    // Process full update
    async (ctx) => {
      let updateInfo = ctx.wizard.state;

      let picLink = await bot.telegram.getFileLink(updateInfo.photo_id);
    }
  ),
]);

bot.use(updateStage.middleware());

//
// Process updates & waypoints
//

bot.on("message", async (ctx) => {
  let msg = ctx.update.message;

  // don't process commands here
  if ("text" in msg && msg.text.substr(0, 1) === "/") return;
  // only allow waypoints/updates for admin
  else if (
    parseInt(ctx.message.chat.id) ===
    parseInt(process.env.TELEGRAM_ADMIN_CHATID)
  ) {
    // if a photo is sent by admin in no context, it's an update
    if ("photo" in msg) ctx.scene.enter("update");
    // if a location is sent in no context, it's waypoint
    else if ("location" in msg) {
      let { longitude, latitude } = msg.location;

      db.query(
        q.Create(q.Collection("waypoints"), {
          data: turfHelpers.point([longitude, latitude]),
        })
      )
        .then((resp) => {
          ctx.reply(`Updated: ${longitude}, ${latitude}`);
        })
        .catch((err) => {
          ctx.reply(`Error: ${err}`);
        });
    }
  }
});

//
// Netlify Lambda process webhook from Telegram API
//

exports.handler = async (event, context, callback) => {
  let body = JSON.parse(event.body);
  console.log(JSON.stringify(body, null, 2));

  try {
    await bot.handleUpdate(body);
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
