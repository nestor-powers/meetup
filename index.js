var meetup = require('meetup-api')({key: process.env.NESTOR_MEETUP_KEY});
var moment = require('moment');
var iso3166 = require('iso3166-1');

var colors = [
  '#61bd4f',
  '#f2d600',
  '#ffab4a',
  '#eb5a46',
  '#c377e0',
  '#0079bf',
  '#00c2e0',
  '#51e898',
  '#ff80ce',
  '#4d4d4d',
  '#b6bbbf'
];

module.exports = function(robot) {
  robot.respond(/meetup topics/, { suggestions: ["meetup topics"] }, function(msg, done) {
    var meetupHash = robot.brain.get('meetup.com') || {};
    var topicNames = Object.keys(meetupHash);
    if(topicNames.length == 0) {
      msg.send("Looks like you haven't saved any topics. Start by saving a topic by saying `@nestorbot: meetup topic add aws`", done);
    } else {
      var results = ["Here are the topics you've saved:"];
      for(var t in meetupHash) {
        results = results.concat("* " + t + ", ID: " + meetupHash[t]);
      }
      msg.send(results, done);
    }
  });

  robot.respond(/meetup topic remove (.*)$/, { suggestions: ["meetup topic remove <topic>"] }, function(msg, done) {
    var meetupHash = robot.brain.get('meetup.com') || {};
    var topicNames = Object.keys(meetupHash);
    if(topicNames.length == 0) {
      msg.send("Looks like you haven't saved any topics. Start by saving a topic by saying `@nestorbot: meetup topic add aws`", done);
    } else {
      var topic = msg.match[1];
      if(meetupHash.hasOwnProperty(topic)) {
        delete(meetupHash[topic]);
        var length = Object.keys(meetupHash).length;
        if (length == 0) {
          msg.send("Removed topic '" + topic + "'. You have no more saved topics", done);
        } else {
          var results = ["Removed topic '" + topic + "'. Here are the topics you have saved:"];
          for(var t in meetupHash) {
            results = results.concat("* " + t + ", ID: " + meetupHash[t]);
          }
          msg.send(results, done);
        }
      } else {
        var results = ["Couldn't find that topic. Here are the ones you've saved:"];
        for(var t in meetupHash) {
          results = results.concat("* " + t + ", ID: " + meetupHash[t]);
        }
        msg.send(results, done);
      }
    };
  });

  robot.respond(/meetup topic add (.*)$/, { suggestions: ["meetup topic add <topic>"] }, function(msg, done) {
    var topic = msg.match[1];
    meetup.getTopics({
      name: topic
    }, function(err, resp) {
      if(err) {
        msg.send(msg.newRichResponse({
          title: "Oops, Meetup.com returned with an error",
          color: 'danger',
          fields: [
            {
              "title": "Details",
              "value": error.body.details,
              "short": true
            },
            {
              "title": "Code",
              "value": error.body.code,
              "short": true
            },
            {
              "title": "Problem",
              "value": error.body.problem,
              "short": true
            }
          ]
        }), done);
      } else {
        if (resp.results.length == 0) {
          msg.send("Oops, Couldn't find the topic '" + topic + "' on Meetup.com", done);
        } else {
          var meetupTopic = resp.results[0];
          var topicName = meetupTopic.name;
          var topicId = meetupTopic.id;

          var meetupHash = robot.brain.get('meetup.com') || {};
          meetupHash[topicName] = topicId;
          robot.brain.set('meetup.com', meetupHash);
          msg.send("Saved topic '" + topicName + "' + with ID '" + topicId + "' to search for", done);
        }
      }
    });
  });

  robot.respond(/meetup (?:events|list)(?:\s+in country (\w+))?/, { suggestions: ["meetup events [in country <country-code>]"] }, function(msg, done) {
    var meetupHash = robot.brain.get('meetup.com') || {};
    var topicNames = Object.keys(meetupHash);

    if(topicNames.length == 0) {
      msg.send("Looks like you haven't saved any topics to search for. Start by saving a topic by saying `@nestorbot: meetup topic add aws`", done);
    } else {
      var topicIds = topicNames.map(function(t) { return meetupHash[t]; });
      var countryCode = msg.match[1];

      opts = {
        topic_id: topicIds,
        upcoming_events: true,
        order: 'distance',
        radius: 'global'
      }

      if(countryCode) {
        if(iso3166.is2(countryCode) || iso3166.is3(countryCode)) {
          countryCode = iso3166.from(countryCode).to2();
        } else {
          countryCode = null;
        }
      }

      meetup.findGroups(opts, function(err, resp) {
        if(err) {
          msg.send(msg.newRichResponse({
            title: "Oops, Meetup.com returned with an error",
            color: 'danger',
            fields: [
              {
                "title": "Details",
                "value": error.body.details,
                "short": true
              },
              {
                "title": "Code",
                "value": error.body.code,
                "short": true
              },
              {
                "title": "Problem",
                "value": error.body.problem,
                "short": true
              }
            ]
          }), done);
        } else {
          resp = resp.filter(function(v) { return v.hasOwnProperty('next_event') });
          if (countryCode) {
            resp = resp.filter(function(v) { return v.country == countryCode; });
          }

          if(resp.length == 0) {
            msg.send("Oops, couldn't find any upcoming meetups for these topics: " + topicNames, done);
          } else {
            var results = [];
            var currentLocation = null;
            var colorIndex = -1;

            for(var i in resp) {
              var res = resp[i];
              var loc = res.city + ", " + res.localized_country_name;
              if (currentLocation != loc) {
                colorIndex = (colorIndex + 1) % colors.length;
              }
              currentLocation = loc;

              results = results.concat(msg.newRichResponse({
                title: res.name,
                title_link: res.link,
                fallback: res.name,
                color: colors[colorIndex],
                fields: [
                  {
                    "title": "Location",
                    "value": loc,
                    "short": true
                  },
                  {
                    "title": "Next Event",
                    "value": moment(res.next_event.time).utcOffset(res.next_event.utc_offset / (60 * 1000)).calendar(),
                    "short": true
                  }
                ]
              }));
            }
          }

          msg.send("I found " + resp.length + " meetups:").then(function() {
            msg.send(results, done);
          });
        }
      });
    }
  });
};
