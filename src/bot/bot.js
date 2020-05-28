const Telegraf = require("telegraf");
const Stage = require("telegraf/stage");
const Markup = require("telegraf/markup");
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

// TODO error handling on ORS requests

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const cloud = require("./cloudinary");
const ors = require("./ors");
const db = require("./db");

//
// Commands
//

bot.use(session());

bot.start((ctx) => {
  ctx.reply(["Bienvenidos!", "", "/subscribe", "/unsubscribe"].join("\n"));
});

bot.command("skobuffs", (ctx) => {
  ctx.reply("sko buffs!");
});

bot.command("chatid", (ctx) => {
  ctx.reply(`Chat ID: ${ctx.message.chat.id}`);
});

bot.command("subscribe", (ctx) => {
  let { type, id, ...subscriber } = ctx.message.chat;

  db.getSubscriberByChatId(id).then((resp) => {
    if (resp.length == 1) ctx.reply("You are already subscribed!");
    else
      db.addToCollection("subscribers", { chat_id: id, ...subscriber }).then(
        (resp) => {
          ctx.telegram.sendMessage(
            process.env.TELEGRAM_ADMIN_CHATID,
            `${subscriber.first_name} ${subscriber.last_name} (${subscriber.username}) has subscribed!`
          );

          ctx.reply(`Thank you for subscribing! <3\nBe in touch!`);
        }
      );
  });
});

bot.command("unsubscribe", (ctx) => {
  let { id: chat_id } = ctx.message.chat;

  db.getSubscriberByChatId(chat_id).then((resp) => {
    if (resp.length == 1)
      db.unsubscribeByRef(resp[0].ref).then((resp) => {
        ctx.reply("Unsubscribed!");
      });
    else ctx.reply("You haven't subscribed yet!");
  });
});

bot.command("test", (ctx) => {
  ctx.reply(
    "Confirm?",
    Markup.inlineKeyboard([
      [Markup.callbackButton("No", "No"), Markup.callbackButton("Yes", "No")],
    ])
      .resize()
      .extra()
  );
});
bot.command("test2", async (ctx) => {
  longitude = -15.81628;
  latitude = 28.004107;

  let prevUpdate = await db.getPrevUpdate();
  let waypoints = await db.getAllWaypointsAfterTime(prevUpdate.ts);
  let newUpdate = turfHelpers.point([longitude, latitude]);

  let route = await ors.calcHikingRoute(prevUpdate.data, newUpdate, waypoints);
  console.log(route);
});

//
// Process Update
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

      return ctx.wizard.next();
    },
    //
    // Calculate new route and ask for confirmation
    async (ctx) => {
      console.log("scene3");
      let state = ctx.wizard.state;

      state.newUpdate = turfHelpers.point([state.longitude, state.latitude]);
      state.prevUpdate = await db.getPrevUpdate();

      if (state.prevUpdate) {
        state.waypoints = await db.getAllWaypointsAfterTime(
          state.prevUpdate.ts
        );
        state.route = await ors.calcHikingRoute(
          state.prevUpdate.data,
          state.newUpdate,
          state.waypoints
        );

        ctx.reply(
          [`${state.route.properties.distance}m`, `Confirm?`].join("/n"),
          Markup.inlineKeyboard([
            Markup.callbackButton("No", "discard"),
            Markup.callbackButton("Yes", "confirm"),
          ])
            .oneTime()
            .extra()
        );

        return ctx.wizard.next();
      } else {
        // first update !
      }
    },
    //
    // Upload photo, update & track
    async (ctx) => {
      if (!("callback_query" in ctx)) {
        ctx.reply("Invalid response");
        return ctx.scene.leave();
      }

      ctx.reply(JSON.stringify(ctx));
      // TODO ctx.answerCbQUery();
      // TODO delete keyboard ::)

      let choice = ctx.callback_query.data; // discard/confirm

      // (1) Get photo and upload it to Cloudinary
      let tempPicLink = await bot.telegram.getFileLink(state.photo_id);
      let picLink = await cloud.uploadPhoto(tempPicLink);

      // (2) Create GeoJSON point with update info
      // use state variables as properties:{} for update geojson feature
      let { photo_id, longitude, latitude, ...updateProps } = ctx.wizard.state;
      let updateFeat = turfHelpers.point([longitude, latitude], {
        ...updateProps,
        date: new Date().toISOString(),
      });

      // (3) Add new update to updates collection
      db.addToCollection("updates", updateFeat).then(async (newUpdate) => {
        Promise.all([
          // (4a) Calculate new route between last update and this one
          db.getUpdateBeforeRef(newUpdate.ref).then(async (prevUpdate) => {
            let unsortWaypoints = await db.getAllWaypointsAfterTime(
              prevUpdate.ts
            );
          }),
          // (4b) Update all subscriber
          db.getAllSubscribers().then((subscribers) => {
            console.log(subscribers);
          }),
        ]).then(() => {
          ctx.reply("Sko buffs!");
        });
      });

      return ctx.scene.leave();
    }
  ),
]);

bot.use(updateStage.middleware());

//
// Capture all messages, trigger waypoints/updates
//

bot.on("message", async (ctx) => {
  let msg = ctx.update.message;

  //console.log("ctx.scene", ctx.scene);
  //console.log("ctx.scene.scenes", ctx.scene.scenes);

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
      let wayFeature = turfHelpers.point([longitude, latitude]);

      // add waypoints to DB
      db.addToCollection("waypoints", wayFeature)
        .then(() => {
          ctx.reply(`Added ${longitude}, ${latitude}`);
        })
        .catch((err) => {
          ctx.reply(`Error: ${err.message || err}`);
        });
    }
  }
});

//
// Netlify Lambda process webhook from Telegram API
//

exports.handler = async (event, context, callback) => {
  let body = JSON.parse(event.body);
  console.log(body);

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
