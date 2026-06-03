const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const withAndroidCleartext = (config) =>
  withAndroidManifest(config, (configWithManifest) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      configWithManifest.modResults,
    );

    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    return configWithManifest;
  });

module.exports = withAndroidCleartext;
