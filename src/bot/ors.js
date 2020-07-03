require("dotenv").config();

const openrouteservice = require("openrouteservice-js");
const turfSimplify = require("@turf/simplify");
const turfHelpers = require("@turf/helpers");
const request = require("request");

var Directions = new openrouteservice.Directions({
  api_key: process.env.OPENROUTESERVICE_KEY,
});

let simplifyTrack = (feat) => turfSimplify(feat, {options: 0.00025});

module.exports = {
  // openrouteservice-js doesn't yet support optimization API :(
  calcOptimalWaypoints: async (start, end, waypoints) => {
    return new Promise((res, rej) => {
      // if no waypoints, no optimization needed
      if (waypoints.length == 0) {
        res([start.geometry.coordinates, end.geometry.coordinates]);
        return;
      }

      // build optimization query
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

      // query api
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
        (error, response, bodyRaw) => {
          let body = JSON.parse(bodyRaw);

          if (error || "error" in body) rej(`Error: ${body.error}`);
          else {
            if ("routes" in body && "steps" in body.routes[0])
              res(body.routes[0].steps.map((s) => s.location));
            else rej("Error: Invalid optimalWaypoints response");
          }
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
            .then((json) => {
              let feat = json.features[0];

              let hikingRoute = turfHelpers.feature(feat.geometry, {
                ascent: feat.properties.ascent,
                descent: feat.properties.descent,
                distance: feat.properties.summary.distance,
                duration: feat.properties.summary.duration,
              });

              res(simplifyTrack(hikingRoute));
            })
            .catch((err) => {
              rej(err);
            });
        })
        // if optimal waypoints calculation breaks, just calculate from start to end
        .catch(() => {
          console.log(start);
          console.log(end);
          Directions.calculate({
            coordinates: [start.geometry.coordinates, end.geometry.coordinates],
            profile: "foot-hiking",
            elevation: true,
            format: "geojson",
          })
            .then((json) => {
              let feat = json.features[0];

              let hikingRoute = turfHelpers.feature(feat.geometry, {
                ascent: feat.properties.ascent,
                descent: feat.properties.descent,
                distance: feat.properties.summary.distance,
                duration: feat.properties.summary.duration,
              });

              res(simplifyTrack(hikingRoute));
            })
            .catch((err) => {
              rej(err);
            });
        });
    });
  },
};
