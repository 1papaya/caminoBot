require("dotenv").config();

const openrouteservice = require("openrouteservice-js");
const turfSimplify = require("@turf/simplify");
const turfHelpers = require("@turf/helpers");

var Directions = new openrouteservice.Directions({
  api_key: process.env.OPENROUTESERVICE_KEY,
});

module.exports = {
  calcHikingRoute: async (start, end, waypoints) => {
    let startCoords = start.geometry.coordinates;
    let wayptCoords = waypoints.map(waypt => {
      return waypt.geometry.coordinates;
    });
    let endCoords = end.geometry.coordinates;

    return new Promise(async (res, rej) => {
      Directions.calculate({
        coordinates: [].concat([startCoords], wayptCoords, [endCoords]),
        profile: "foot-hiking",
        elevation: true,
        format: "geojson",
      })
        .then(json => {
          console.log("directions json", json);
          let feat = json.features[0];

          let hikingRoute = turfHelpers.feature(feat.geometry, {
            ascent: feat.properties.ascent,
            descent: feat.properties.descent,
            distance: feat.properties.summary.distance,
            duration: feat.properties.summary.duration,
          });

          res(turfSimplify(hikingRoute, { tolerance: 0.00025 }));
        })
        .catch(err => {
          rej(err);
        });
    });
  },
};
