// Local testing in Expo Go without an Expo account: run with LOCAL_TEST=1 and the team owner and EAS project id
// (which Expo Go would check against your login) are left out. Builds (eas build) do not set it and use app.json as is.
module.exports = ({ config }) => {
  if (process.env.LOCAL_TEST !== '1') return config;
  const { owner, extra, ...rest } = config;
  const { eas, ...otherExtra } = extra || {};
  return { ...rest, extra: otherExtra };
};
