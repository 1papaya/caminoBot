const Telegraf = require("telegraf");
const Stage = require("telegraf/stage");
const Markup = require("telegraf/markup");
const session = require("telegraf/session");
const faunadb = require("faunadb"),
  q = faunadb.query;
const WizardScene = require("telegraf/scenes/wizard");

const db = new faunadb.Client({ secret: process.env.FAUNA_SECRET_KEY });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

//
// update Loc
//

const updateLoc = new WizardScene(
  "update_loc",
  // Ask for location
  (ctx) => {
    // List of collections to be added to
    ctx.wizard.state.collections = ["now", "pyrenees"];

    // Only allow to be updated from admin chat
    if (
      parseInt(ctx.message.chat.id) ===
      parseInt(process.env.TELEGRAM_ADMIN_CHATID)
    ) {
      ctx.reply("Where ya at?");
      return ctx.wizard.next();
    } else {
      ctx.reply("Sorry bud, admins only!");
      return ctx.scene.leave();
    }
  },
  // Validate location
  (ctx) => {
    if (typeof ctx.message.location === "undefined") ctx.wizard.back();
    else ctx.wizard.next();

    return ctx.wizard.steps[ctx.wizard.cursor](ctx);
  },
  // Ask for location name
  (ctx) => {
    ctx.wizard.state.longitude = ctx.message.location.longitude;
    ctx.wizard.state.latitude = ctx.message.location.latitude;

    ctx.reply("What is the location name?");
    return ctx.wizard.next();
  },
  // Validate location name
  (ctx) => {
    ctx.wizard.state.name = ctx.message.text.trim();

    ctx.wizard.next();
    return ctx.wizard.steps[ctx.wizard.cursor](ctx);
  },
  // Ask for collection
  (ctx) => {
    let state = ctx.wizard.state;

    ctx.reply(
      "What collection?",
      Markup.keyboard(
        state.collections.map(col => {
          return Markup.button(col);
        })
      ).oneTime().extra()
    );
    return ctx.wizard.next();
  },
  // Validate collection name
  (ctx) => {
    if (!ctx.wizard.state.collections.includes(ctx.message.text))
      ctx.wizard.back();
    else ctx.wizard.next();

    return ctx.wizard.steps[ctx.wizard.cursor](ctx);
  },
  // Ask for verification
  (ctx) => {
    ctx.wizard.state.collection = ctx.message.text;
    let state = ctx.wizard.state;

    ctx.reply(
      `Is this OK?\n` +
        `LOC: ${state.longitude}, ${state.latitude}\n` +
        `NAM: ${state.name}\n` +
        `COL: ${state.collection}`,
      Markup.keyboard([Markup.button("Yes"), Markup.button("No")])
        .oneTime()
        .extra()
    );

    return ctx.wizard.next();
  },
  // Handle full form response
  (ctx) => {
    let state = ctx.wizard.state;

    if (ctx.message.text == "Yes") {
      // Add to FaunaDB
      db.query(
        q.Create(q.Collection(state.collection), {
          data: {
            longitude: state.longitude,
            latitude: state.latitude,
            name: state.name,
          },
        })
      )
        .then((resp) => {
          console.log(resp);
          console.dir(resp);
        })
        .catch((err) => {
          ctx.reply("Error! Sorry, bud");
          return ctx.scene.leave();
        });

      // Trigger rebuild

      ctx.reply("Saved!");
      console.log(state);
    } else {
      ctx.reply("(discarded)");
    }

    return ctx.scene.leave();
  }
);

// Initialize bot with session & stage middleware
const stage = new Stage([updateLoc]);

bot.use(session());
bot.use(stage.middleware());

// Add commands
bot.start((ctx) => {
  ctx.reply(`Bienvenidos al geodaveyBot!`);
});

bot.command("update_loc", (ctx) => {
  ctx.scene.enter("update_loc");
});

bot.command("chat_id", (ctx) => {
  ctx.reply(`Chat ID: ${ctx.update.message.chat.id}`);
});

// Netlify process webhook from Telegram API
exports.handler = async (event, context, callback) => {
  try {
    let body = event.body == "" ? {} : JSON.parse(event.body);
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
