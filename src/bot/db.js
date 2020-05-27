const faunadb = require("faunadb"),
  q = faunadb.query;

const db = new faunadb.Client({ secret: process.env.FAUNA_SECRET_KEY });
const inf_ = 9999;

module.exports = {
  addToCollection: async (collection, data) => {
    return new Promise((res, rej) => {
      db.query(
        q.Create(q.Collection(collection), {
          data: data,
        })
      )
        .then(res)
        .catch(rej);
    });
  },
  getAllWaypointsAfterTime: async (afterTime) => {
    return new Promise((res, rej) => {
      db.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection("waypoints")), {
            size: inf_,
          }),
          q.Lambda((ref) => q.Get(ref))
        )
      )
        .then((resp) => {
          // get array of GeoJSON features
          let afterWaypoints = resp.data
            .filter((wp) => {
              return wp.ts >= afterTime;
            })
            .map((wp) => {
              return wp.data;
            });

          res(afterWaypoints);
        })
        .catch((err) => {
          console.log(err);
          rej(err);
        });
    });
  },
  getSubscribers: async () => {
    return new Promise((res, rej) => {
      db.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection("subscribers")), {
            size: inf_,
          }),
          q.Lambda((ref) => q.Get(ref))
        )
      )
        .then(res)
        .catch(rej);
    });
  },
  getSubscriberByChatId: async (chat_id) => {
    return new Promise((res, rej) => {
      module.exports.getSubscribers().then((subscribers) => {
        let subRecord = subscribers.data.filter((subRec) => {
          return parseInt(subRec.data.chat_id) === parseInt(chat_id);
        });
        res(subRecord);
      });
    });
  },
  unsubscribeByRef: async (ref) => {
    return new Promise((res, rej) => {
      db.query(q.Delete(ref)).then(res).catch(rej);
    });
  },
  getUpdateBeforeRef: async (beforeRef) => {
    // Return the previous update
    return new Promise((res, rej) => {
      db.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection("updates")), {
            size: 1,
            before: [beforeRef],
          }),
          q.Lambda((ref) => q.Get(ref))
        )
      )
        .then((resp) => {
          res(resp.data[0]);
        })
        .catch((err) => {
          // if there is no last update...
          if (err.message === "instance not found") res(false);
          else {
            console.log("getUpdateBefore Error", err);
            rej(err);
          }
        });
    });
  },
};
