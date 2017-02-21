// This will be the logic that powers both module and CLI
const generateSW = require('./lib/generate-sw');
const getFileManifestEntries = require('./lib/get-file-manifest-entries');
const generateFileManifest = require('./lib/generate-file-manifest');

/**
 * # sw-build
 *
 * To get a list of url's and a corresponding revision details, call either
 * `generateFileManifest` or `getFileManifestEntries()`.
 *
 * `generateFileManifest()` will run globs over a directory of static assets
 * and write a JavaScript file containing URL's and revision details for those
 * files.
 *
 * If you'd rather receive the data as a JavaScript Array, use
 * `getFileManifestEntries()` instead.
 *
 * If you only need precaching of your static assets in your service
 * worker and nothing else, you can generate complete service worker
 * with `generateSW()`.
 *
 * @example <caption>Generate a build manifest file.</caption>
 * const swBuild = require('sw-build');
 *
 * swBuild.generateFileManifest({
 *   dest: './build/scripts/manifest.js',
 *   rootDirectory: './build/',
 *   globPatterns: ['**\/*.{html,js,css}'],
 *   globIgnores: ['admin.html']
 * })
 * .then(() => {
 *   console.log('Build file has been created.');
 * });
 *
 * @example <caption>Get a list of files with revision details.</caption>
 * const swBuild = require('sw-build');
 *
 * swBuild.getFileManifestEntries({
 *   rootDirectory: './build/',
 *   globPatterns: ['**\/*.{html,js,css}'],
 *   globIgnores: ['admin.html']
 * })
 * .then((fileDetails) => {
 *   // An array of file details include a `url` and `revision` parameter.
 * });
 *
 * * @example <caption>Generate a service worker for a project.</caption>
 * const swBuild = require('sw-build');
 *
 * swBuild.generateSW({
 *   rootDirectory: './build/',
 *   globPatterns: ['**\/*.{html,js,css}'],
 *   globIgnores: ['admin.html'],
 *   serviceWorkerName: 'sw.js'
 * })
 * .then(() => {
 *   console.log('Service worker generated.');
 * });
 *
 * @module sw-build
 */

module.exports = {
  generateSW,
  generateFileManifest,
  getFileManifestEntries,
};
