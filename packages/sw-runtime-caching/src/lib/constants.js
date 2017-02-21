/*
 Copyright 2016 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * The default cache name, used by
 * {@link module:sw-runtime-caching.RequestWrapper|RequestWrapper} when there's
 * no name provided.
 *
 * It combines a constant prefix with the `registration.scope` value associated
 * with the current service worker, ensuring that multiple service workers used
 * on the same origin will have different default caches.
 *
 * @type {string}
 * @memberof module:sw-runtime-caching
 */
let cacheName = `sw-runtime-caching`;
 if (self && self.registration) {
   cacheName += `-${self.registration.scope}`;
 }
export const defaultCacheName = cacheName;

/**
 * A list of the callback method names that the RequestWrapper might trigger.
 *
 * @private
 * @type {Array.<string>}
 * @memberof module:sw-runtime-caching
 */
export const pluginCallbacks = [
  'cacheDidUpdate',
  'cacheWillMatch',
  'cacheWillUpdate',
  'fetchDidFail',
  'requestWillFetch',
];
