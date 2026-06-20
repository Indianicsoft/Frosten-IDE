/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: "com.frosten.ide",
  productName: "Frosten IDE",
  directories: {
    output: "release"
  },
  files: [
    "dist/**/*",
    "electron/**/*",
    "package.json"
  ],
  extraMetadata: {
    main: "electron/main.js"
  },
  npmRebuild: false,
  linux: {
    target: ["dir"],
    category: "Development"
  },
  mac: {
    target: ["dmg"]
  },
  win: {
    target: ["nsis"]
  }
};
