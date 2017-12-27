require('dotenv').config()

// Data vars
var steps = 0
var calories = 0

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
var GAuth = google.auth.OAuth2
var gClient = new GAuth(
  process.env.G_CLIENT_ID,
  process.env.G_CLIENT_SECRET,
  process.env.G_CALLBACK_URL
)

// redirect the user to the Fitbit authorization page
app.get('/gAuthorize', function (req, res) {
  // request access to the user's activity scope
  res.redirect(gClient.generateAuthUrl({scope: 'https://www.googleapis.com/auth/fitness.activity.read'}))
})

app.get('/gCallback', function (req, res) {
  gClient.getToken(res.code, function (err, tokens) {
    // Tokens contains an access_token and an optional refresh_token. Save them.
    if (!err) {
      gClient.setCredentials(tokens)

      var stepsBody = {
        aggregateBy: [{
          dataSourceId: 'com.google.step_count.delta'
        }],
        bucketByTime: {
          durationMillis: millisInADay
        },
        startTimeMillis: startTimeMillis,
        endTimeMillis: endTimeMillis
      }

      gFit.activity.read({
        userId: 'me',
        auth: gClient,
        body: stepsBody
      }, function (err, res) {
        if (!err) {
          steps = res.bucket[0].dataset[0].point[0].value[0].intVal
          console.log(steps)
        } else {
          console.error(err)
        }
      })

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

      gFit.activity.read({
        userId: 'me',
        auth: gClient,
        body: caloriesBody
      }, function (err, res) {
        if (!err) {
          var buckets = res.bucket
          for (var i = 0; i < buckets.length; ++i) {
            var activity = buckets[i].activity
            if (activity !== 3) { // https://developers.google.com/fit/rest/v1/reference/activity-types
              calories += buckets[i].dataset[0].point[0].value[0].fpVal
            }
          }
          console.log(calories)
          res.redirect(fbClient.getAuthorizeUrl('activity', process.env.FB_CALLBACK_URL))
        } else {
          console.error(err)
        }
      })
    }
  })
})

// redirect the user to the Fitbit authorization page
// app.get('/fbAuthorize', function (req, res) {
//   // request access to the user's activity scope
//   res.redirect(fbClient.getAuthorizeUrl('activity', process.env.FB_CALLBACK_URL))
// })

// handle the callback from the Fitbit authorization flow
app.get('/fbCallback', function (req, res) {
  // exchange the authorization code we just received for an access token
  fbClient.getAccessToken(req.query.code, process.env.CALLBACK_URL).then(function (result) {
    var stepsBody = {
      activityId: 90013, // https://dev.fitbit.com/reference/web-api/explore/#/Activity/activity6
      date: startTimeString,
      startTime: '00:00:00',
      durationMillis: millisInADay,
      steps: steps
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
      console.log(results[0])
    })
  }).catch(function (error) {
    res.send(error)
  })
})

// launch the server
app.listen(process.env.CALLBACK_PORT)
