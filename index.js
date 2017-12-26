require('dotenv').config()

// initialize the express application
var express = require('express')
var app = express()

// initialize the Fitbit API client
var FitbitApiClient = require('fitbit-node')
var client = new FitbitApiClient(process.env.CLIENT_ID, process.env.CLIENT_SECRET)

// redirect the user to the Fitbit authorization page
app.get('/authorize', function (req, res) {
  // request access to the user's activity, heartrate, location, nutrion, profile, settings, sleep, social, and weight scopes
  res.redirect(client.getAuthorizeUrl('activity', process.env.CALLBACK_URL))
})

// handle the callback from the Fitbit authorization flow
app.get('/callback', function (req, res) {
  // exchange the authorization code we just received for an access token
  client.getAccessToken(req.query.code, process.env.CALLBACK_URL).then(function (result) {
    // use the access token to fetch the user's profile information
    client.get('/activities.json', result.access_token).then(function (results) {
      res.send(results[0])
    })
  }).catch(function (error) {
    res.send(error)
  })
})

// launch the server
app.listen(process.env.CALLBACK_PORT)
