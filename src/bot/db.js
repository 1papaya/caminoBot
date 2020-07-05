require("dotenv").config();
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
          // return array of GeoJSON features
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
          rej(err);
        });
    });
  },
  deleteLast: async (collection) => {
    return new Promise((res, rej) => {
      db.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection(collection)), {
            size: inf_,
          }),
          q.Lambda((ref) => q.Get(ref))
        )
      )
        .then((result) => {
          if (result.data.length == 0)
            rej({ message: "Updates database is empty" });
          else {
            let last = result.data[result.data.length - 1];
            db.query(q.Delete(last.ref)).then(res).catch(rej);
          }
        })
        .catch(rej);
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
  getPrevUpdate: async () => {
    return new Promise((res, rej) => {
      db.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection("updates")), {
            size: inf_,
          }),
          q.Lambda((ref) => q.Get(ref))
        )
      ).then((resp) => {
        // if is first update, return false
        if (resp.data.length === 0) res(false);
        else res(resp.data[resp.data.length - 1]);
      });
    });
  },
};
