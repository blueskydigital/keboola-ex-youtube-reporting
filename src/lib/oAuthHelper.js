var google = require('googleapis')

module.exports = function(config) {
  var clientId = config.get('parameters:#clientId')
  var clientSecret = config.get('parameters:#clientSecret')
  var redirectUrl = config.get('parameters:redirectUrl')
  var scopes = config.get('parameters:scopes')
  var OAuth2 = google.auth.OAuth2
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl)  

  oauth2Client.setCredentials({
    refresh_token: config.get('parameters:#refresh_token'),
    access_token: config.get('parameters:#access_token'),
    token_type: config.get('parameters:token_type') || 'Bearer',
    expiry_date: config.get('parameters:expiry_date') || 1447278755869
  })

  return oauth2Client
}