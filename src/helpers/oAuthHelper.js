import google from 'googleapis';

/**
 * This function is ready to establish oAuth2 authentication based on the input params.
 */
export function authorization({
  scopes,
  clientId,
  redirectUrl,
  clientSecret,
  tokenType: token_type,
  expiryDate: expiry_date,
  accessToken: access_token,
  refreshToken: refresh_token
}) {
  const { OAuth2 } = google.auth;
  const oAuth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  oAuth2Client.setCredentials({
    token_type, expiry_date, access_token, refresh_token
  });

  return oAuth2Client;
}
