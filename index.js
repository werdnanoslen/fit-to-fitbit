require('dotenv').config()
var request = require('request')

// Data vars
var steps = 0
var calories = 0
var distance = 0

// Time vars
var millisInADay = 86400000
var startTime = new Date()
startTime.setMilliseconds(0)
startTime.setSeconds(0)
startTime.setMinutes(0)
startTime.setHours(0)
startTime.setTime(startTime - millisInADay)
var endTime = new Date(startTime.valueOf() + millisInADay)
var startTimeMillis = startTime.valueOf()
var endTimeMillis = endTime.valueOf()
var startTimeString = startTime.getFullYear() + '-' + (startTime.getMonth() + 1) + '-' + startTime.getDate()

// initialize the express application
var express = require('express')
var app = express()

// initialize the Fitbit API client
var FitbitApiClient = require('fitbit-node')
var fbClient = new FitbitApiClient(process.env.FB_CLIENT_ID, process.env.FB_CLIENT_SECRET)

// initialize the Google API client
var google = require('googleapis')
var gFit = google.fitness('v1')
var scopes = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.location.read'
]
var gUrl = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate'
var GAuth = google.auth.OAuth2
var gClient = new GAuth(
  process.env.G_CLIENT_ID,
  process.env.G_CLIENT_SECRET,
  '/gCallback'
)

// redirect the user to the Fitbit authorization page
app.get('/', function (req, res) {
  // request access to the user's activity scope
  res.redirect(gClient.generateAuthUrl({scope: scopes}))
})

app.get('/gCallback', function (req, res) {
  gClient.getToken(req.query.code, function (err, tokens) {
    // Tokens contains an access_token and an optional refresh_token. Save them.
    if (err) {
      return console.error('token failed:', err);
    }
    gClient.credentials = tokens
    var auth = {
      'bearer': tokens.access_token
    }
    var stepsBody = {
      aggregateBy: [{
        dataTypeName: 'com.google.step_count.delta'
      }],
      bucketByTime: {
        durationMillis: millisInADay
      },
      startTimeMillis: startTimeMillis,
      endTimeMillis: endTimeMillis
    }
    request.post({url: gUrl, auth: auth, json: stepsBody}, function (err, httpResponse, body) {
      if (err) {
        return console.error('steps failed:', err);
      }
      steps = body.bucket[0].dataset[0].point[0].value[0].intVal
      console.log('steps: ', steps)

      var caloriesBody = {
        aggregateBy: [{
          dataTypeName: 'com.google.calories.expended'
        }],
        bucketByActivityType: {
          minDurationMillis: 0
        },
        startTimeMillis: startTimeMillis,
        endTimeMillis: endTimeMillis
      }

      request.post({url: gUrl, auth: auth, json: caloriesBody}, function (err, httpResponse, body) {
        if (err) {
          return console.error('calories failed:', err);
        }

        var buckets = body.bucket
        for (var i = 0; i < buckets.length; ++i) {
          var activity = buckets[i].activity
          if (activity !== 3) { // https://developers.google.com/fit/rest/v1/reference/activity-types
            calories += buckets[i].dataset[0].point[0].value[0].fpVal
          }
        }
        console.log('calories: ', calories)

        var distanceBody = {
          aggregateBy: [{
            dataTypeName: 'com.google.distance.delta'
          }],
          bucketByActivityType: {
            minDurationMillis: 0
          },
          startTimeMillis: startTimeMillis,
          endTimeMillis: endTimeMillis
        }

        request.post({url: gUrl, auth: auth, json: distanceBody}, function (err, httpResponse, body) {
          if (err) {
            return console.error('distance failed:', err);
          }
          var buckets = body.bucket
          for (var i = 0; i < buckets.length; ++i) {
            var activity = buckets[i].activity
            if (activity !== 3) { // https://developers.google.com/fit/rest/v1/reference/activity-types
              distance += buckets[i].dataset[0].point[0].value[0].fpVal
            }
          }
          distance *= 0.000621371192 //convert to miles
          console.log('distance: ', distance)

          res.redirect(fbClient.getAuthorizeUrl('activity', '/fbCallback'))
        })
      })
    })
  })
})

// handle the callback from the Fitbit authorization flow
app.get('/fbCallback', function (req, res) {
  // exchange the authorization code we just received for an access token
  fbClient.getAccessToken(req.query.code, '/fbCallback').then(function (result) {
    var stepsBody = {
      activityId: 17190, // https://dev.fitbit.com/reference/web-api/explore/#/Activity/activity6
      date: startTimeString,
      startTime: '00:00:00',
      durationMillis: millisInADay,
      steps: steps,
      distance: distance,
      manualCalories: parseInt(calories)
    }
    // var nameBody = {
    //   activityName: 'Google Fit Activity', // https://dev.fitbit.com/reference/web-api/activity
    //   date: startTimeString,
    //   startTime: '00:00:00',
    //   durationMillis: millisInADay,
    //   manualCalories: calories
    // }
    fbClient.post('/activities.json', result.access_token, stepsBody).then(function (results) {
      res.send(results[0])
    })
  }).catch(function (error) {
    res.send(error)
  })
})

// launch the server
app.listen(process.env.PORT)
