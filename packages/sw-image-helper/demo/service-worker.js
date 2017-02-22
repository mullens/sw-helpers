/* eslint-env worker, serviceworker */
/* global goog */

// Import the helper libraries into our service worker's global scope.
importScripts(
  '../src/index.js'
);

// Have the service worker take control as soon as possible.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());


self.addEventListener('fetch', function(event) {
  let imageHelper = new ImageHelper(event);

  imageHelper.addWebPSupport();
  imageHelper.addDPRSupport();

  event.respondWith(imageHelper.getResponse());
});
