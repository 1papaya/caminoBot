const openrouteservice = require("openrouteservice-js");
const turfHelpers = require("@turf/helpers");
const request = require("request");

var Directions = new openrouteservice.Directions({
  api_key: process.env.OPENROUTESERVICE_KEY,
});

module.exports = {
  // openrouteservice-js doesn't yet support optimization API :(
  calcOptimalWaypoints: async (start, end, waypoints) => {
    return new Promise((res, rej) => {
      let optimizationReq = {
        jobs: waypoints.map((wp, idx) => {
          return { id: idx, location: wp.geometry.coordinates };
        }),
        vehicles: [
          {
            id: 1,
            profile: "foot-walking",
            start: start.geometry.coordinates,
            end: end.geometry.coordinates,
          },
        ],
      };

      request(
        {
          method: "POST",
          url: "https://api.openrouteservice.org/optimization",
          body: JSON.stringify(optimizationReq),
          headers: {
            Accept: "application/json, application/geo+json; charset=utf-8",
            Authorization: process.env.OPENROUTESERVICE_KEY,
            "Content-Type": "application/json; charset=utf-8",
          },
        },
        (error, response, body) => {
          // TODO error handling

          let wayptArray = JSON.parse(body).routes[0].steps.map(
            (s) => s.location
          );

          res(wayptArray);
        }
      );
    });
  },

  calcHikingRoute: async (start, end, waypoints) => {
    return new Promise(async (res, rej) => {
      module.exports
        .calcOptimalWaypoints(start, end, waypoints)
        .then((optimalWaypoints) => {
          Directions.calculate({
            coordinates: optimalWaypoints,
            profile: "foot-hiking",
            elevation: true,
            format: "geojson",
          })
            .then(function (json) {
              let feat = json.features[0];

              let hikingRoute = turfHelpers.feature(feat.geometry, {
                ascent: feat.properties.ascent,
                descent: feat.properties.descent,
                distance: feat.properties.summary.distance,
                duration: feat.properties.summary.duration,
              });

              res(hikingRoute);
            })
            .catch(function (err) {
              // TODO error handling !
              rej(err);
            });
        });
    });
  },
};
