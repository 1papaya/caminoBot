const Telegraf = require("telegraf");
const Stage = require("telegraf/stage");
const Markup = require("telegraf/markup");
const session = require("telegraf/session");
const faunadb = require("faunadb"),
  q = faunadb.query;
const turfHelpers = require("@turf/helpers");
const WizardScene = require("telegraf/scenes/wizard");

const db = new faunadb.Client({ secret: process.env.FAUNA_SECRET_KEY });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const postcard = new WizardScene(
  "postcard",
  async (ctx) => {
    console.log(ctx);
    let picId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    console.log(picId);

    let info = await bot.telegram.getFileLink(picId);

    console.log(info);
    return ctx.scene.leave();

      



    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!("location" in ctx.message)) {
      ctx.reply("Error: Postcard must be followed by location");
      return ctx.scene.leave();
    }

    ctx.wizard.state.longitude = ctx.message.location.longitude;
    ctx.wizard.state.latitude = ctx.message.location.latitude;

    // (a) get last postcard record

    // (1) upload photo to cloudinary
    // (2)
  }
);

// Initialize bot with session & stage middleware
const stage = new Stage([postcard]);

bot.command("skobuffs", (ctx) => {
  ctx.reply("sko buffs!");
});

bot.use(session());
bot.use(stage.middleware());

bot.on("message", async (ctx) => {
  let msg = ctx.update.message;

  // don't process commands here
  if (("text" in msg) && msg.text.substr(0,1) === "/") return;
  // if a photo is sent not in a context, it's postcard update
  else if ("photo" in msg) ctx.scene.enter("postcard");
  // if a location is sent in no context, it's waypoint update
  else if ("location" in msg) {
    let { longitude, latitude } = msg.location;

    db.query(
      q.Create(q.Collection("hrpWaypoints"), {
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
});

// Netlify process webhook from Telegram API
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
