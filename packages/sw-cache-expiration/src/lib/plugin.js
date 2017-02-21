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

import idb from 'idb';
import assert from '../../../../lib/assert';
import {
  idbName,
  idbVersion,
  urlPropertyName,
  timestampPropertyName,
} from './constants';
import ErrorFactory from './error-factory';

/**
 * The cache expiration plugin allows you define an expiration and / or
 * limit on the responses cached.
 *
 * @example
 * const expirationPlugin = new goog.cacheExpiration.Plugin({
 *   maxEntries: 2,
 *   maxAgeSeconds: 10,
 * });
 *
 * @memberof module:sw-cache-expiration
 */
class Plugin {
  /**
   * Creates a new `Plugin` instance, which is used to remove entries from a
   * [`Cache`](https://developer.mozilla.org/en-US/docs/Web/API/Cache) once
   * certain criteria—maximum number of entries, age of entry, or both—is met.
   *
   * @param {Object} input
   * @param {Number} [input.maxEntries] The maximum size of the cache. Entries
   *        will be expired using a LRU policy once the cache reaches this size.
   * @param {Number} [input.maxAgeSeconds] The maximum age for fresh entries.
   */
  constructor({maxEntries, maxAgeSeconds} = {}) {
    if (!(maxEntries || maxAgeSeconds)) {
      throw ErrorFactory.createError('max-entries-or-age-required');
    }

    if (maxEntries && typeof maxEntries !== 'number') {
      throw ErrorFactory.createError('max-entries-must-be-number');
    }

    if (maxAgeSeconds && typeof maxAgeSeconds !== 'number') {
      throw ErrorFactory.createError('max-age-seconds-must-be-number');
    }

    this.maxEntries = maxEntries;
    this.maxAgeSeconds = maxAgeSeconds;

    // These are used to keep track of open IndexDB and Caches for a given name.
    this._dbs = new Map();
    this._caches = new Map();
  }

  /**
   * Returns a promise for the IndexedDB database used to keep track of state.
   *
   * @private
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @return {DB} An open DB instance.
   */
  async getDB({cacheName} = {}) {
    assert.isType({cacheName}, 'string');

    const idbId = `${idbName}-${cacheName}`;
    if (!this._dbs.has(idbId)) {
      const openDb = await idb.open(idbId, idbVersion, (upgradeDB) => {
        const objectStore = upgradeDB.createObjectStore(cacheName,
          {keyPath: urlPropertyName});
        objectStore.createIndex(timestampPropertyName, timestampPropertyName,
          {unique: false});
      });
      this._dbs.set(idbId, openDb);
    }

    return this._dbs.get(idbId);
  }

  /**
   * Returns a promise for an open Cache instance named `cacheName`.
   *
   * @private
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @return {Cache} An open Cache instance.
   */
  async getCache({cacheName} = {}) {
    assert.isType({cacheName}, 'string');

    if (!this._caches.has(cacheName)) {
      const openCache = await caches.open(cacheName);
      this._caches.set(cacheName, openCache);
    }

    return this._caches.get(cacheName);
  }

  /**
   * A "lifecycle" callback that will be triggered automatically by the
   * `goog.runtimeCaching` handlers when a `Response` is about to be returned
   * from a [Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache) to
   * the handler. It allows the `Response` to be inspected for freshness and
   * prevents it from being used if the `Response`'s `Date` header value is
   * older than the configured `maxAgeSeconds`.
   *
   * Developers who are not using `goog.runtimeCaching` would normally not call
   * this method directly; instead, use [`isResponseFresh`](#isResponseFresh)
   * to perform the same freshness check.
   *
   * @private
   * @param {Object} input
   * @param {Response} input.cachedResponse The `Response` object that's been
   *        read from a cache and whose freshness should be checked.
   * @param {Number} [input.now] A timestamp. Defaults to the current time.
   * @return {Response|null} Either the `cachedResponse`, if it's fresh, or
   *          `null` if the `Response` is older than `maxAgeSeconds`.
   */
  cacheWillMatch({cachedResponse, now} = {}) {
    if (this.isResponseFresh({cachedResponse, now})) {
      return cachedResponse;
    }

    return null;
  }

  /**
   * Checks whether a `Response` is fresh, based on the `Response`'s
   * `Date` header and the configured `maxAgeSeconds`.
   *
   * If `maxAgeSeconds` or the `Date` header is not set then it will
   * default to returning `true`.
   *
   * @param {Object} input
   * @param {Response} input.cachedResponse The `Response` object that's been
   *        read from a cache and whose freshness should be checked.
   * @param {Number} [input.now] A timestamp. Defaults to the current time.
   * @return {boolean} Either the `true`, if it's fresh, or `false` if the
   *          `Response` is older than `maxAgeSeconds`.
   *
   * @example
   * expirationPlugin.isResponseFresh({
   *   cachedResponse: responseFromCache
   * });
   */
  isResponseFresh({cachedResponse, now} = {}) {
    // Only bother checking for freshness if we have a valid response and if
    // maxAgeSeconds is set. Otherwise, skip the check and always return true.
    if (cachedResponse && this.maxAgeSeconds) {
      assert.isInstance({cachedResponse}, Response);

      const dateHeader = cachedResponse.headers.get('date');
      if (dateHeader) {
        if (typeof now === 'undefined') {
          now = Date.now();
        }

        const parsedDate = new Date(dateHeader);
        // If the Date header was invalid for some reason, parsedDate.getTime()
        // will return NaN, and the comparison will always be false. That means
        // that an invalid date will be treated as if the response is fresh.
        if ((parsedDate.getTime() + (this.maxAgeSeconds * 1000)) < now) {
          // Only return false if all the conditions are met.
          return false;
        }
      }
    }

    return true;
  }

  /**
   * A "lifecycle" callback that will be triggered automatically by the
   * `goog.runtimeCaching` handlers when an entry is added to a cache.
   *
   * Developers would normally not call this method directly; instead,
   * [`updateTimestamp`](#updateTimestamp) combined with
   * [`expireEntries`](#expireEntries) provides equivalent plugin.
   *
   * @private
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the responses belong to.
   * @param {Response} input.newResponse The new value in the cache.
   * @param {Number} [input.now] A timestamp. Defaults to the current time.
   */
  cacheDidUpdate({cacheName, newResponse, now} = {}) {
    assert.isType({cacheName}, 'string');
    assert.isInstance({newResponse}, Response);

    if (typeof now === 'undefined') {
      now = Date.now();
    }

    this.updateTimestamp({cacheName, now, url: newResponse.url}).then(() => {
      this.expireEntries({cacheName, now});
    });
  }

  /**
   * Updates the timestamp stored in IndexedDB for `url` to be equal to `now`.
   *
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @param {string} input.url The URL for the entry to update.
   * @param {Number} [input.now] A timestamp. Defaults to the current time.
   *
   * @example
   * expirationPlugin.updateTimestamp({
   *   cacheName: 'example-cache-name',
   *   url: '/example-url'
   * });
   */
  async updateTimestamp({cacheName, url, now} = {}) {
    assert.isType({url}, 'string');
    assert.isType({cacheName}, 'string');

    if (typeof now === 'undefined') {
      now = Date.now();
    }

    const db = await this.getDB({cacheName});
    const tx = db.transaction(cacheName, 'readwrite');
    tx.objectStore(cacheName).put({
      [timestampPropertyName]: now,
      [urlPropertyName]: url,
    });

    await tx.complete;
  }

  /**
   * Expires entries, both based on the the maximum age and the maximum number
   * of entries, depending on how this instance is configured.
   *
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @param {Number} [input.now] A timestamp. Defaults to the current time.
   * @return {Array<string>} A list of the URLs that were expired.
   *
   * @example
   * expirationPlugin.expireEntries({
   *   cacheName: 'example-cache-name'
   * });
   */
  async expireEntries({cacheName, now} = {}) {
    assert.isType({cacheName}, 'string');

    if (typeof now === 'undefined') {
      now = Date.now();
    }

    // First, expire old entries, if maxAgeSeconds is set.
    const oldEntries = this.maxAgeSeconds ?
      await this.findOldEntries({cacheName, now}) :
      [];

    // Once that's done, check for the maximum size.
    const extraEntries = this.maxEntries ?
      await this.findExtraEntries({cacheName}) :
      [];

    // Use a Set to remove any duplicates following the concatenation, then
    // convert back into an array.
    const urls = [...new Set(oldEntries.concat(extraEntries))];
    await this.deleteFromCacheAndIDB({cacheName, urls});

    return urls;
  }

  /**
   * Expires entries based on the the maximum age.
   *
   * @private
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @param {Number} [input.now] A timestamp.
   * @return {Array<string>} A list of the URLs that were expired.
   */
  async findOldEntries({cacheName, now} = {}) {
    assert.isType({cacheName}, 'string');
    assert.isType({now}, 'number');

    const expireOlderThan = now - (this.maxAgeSeconds * 1000);
    const urls = [];
    const db = await this.getDB({cacheName});
    const tx = db.transaction(cacheName, 'readonly');
    const store = tx.objectStore(cacheName);
    const timestampIndex = store.index(timestampPropertyName);

    timestampIndex.iterateCursor((cursor) => {
      if (!cursor) {
        return;
      }

      if (cursor.value[timestampPropertyName] < expireOlderThan) {
        urls.push(cursor.value[urlPropertyName]);
      }

      cursor.continue();
    });

    await tx.complete;
    return urls;
  }

  /**
   * Finds the URLs that should be expired as per the current state of IndexedDB
   * and the `maxEntries` configuration. A least-recently used policy is
   * enforced, so if `maxEntries` is `N`, and there are `N + M` URLs listed in
   * IndexedDB, then this function will return the least-recently used `M` URLs.
   *
   * @private
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @return {Array<string>} A list of the URLs that are candidates for
   *   expiration.
   */
  async findExtraEntries({cacheName} = {}) {
    assert.isType({cacheName}, 'string');

    const urls = [];
    const db = await this.getDB({cacheName});
    let tx = db.transaction(cacheName, 'readonly');
    let store = tx.objectStore(cacheName);
    let timestampIndex = store.index(timestampPropertyName);
    const initialCount = await timestampIndex.count();

    if (initialCount > this.maxEntries) {
      // We need to create a new transaction to make Firefox happy.
      tx = db.transaction(cacheName, 'readonly');
      store = tx.objectStore(cacheName);
      timestampIndex = store.index(timestampPropertyName);

      timestampIndex.iterateCursor((cursor) => {
        if (!cursor) {
          return;
        }

        urls.push(cursor.value[urlPropertyName]);

        if (initialCount - urls.length > this.maxEntries) {
          cursor.continue();
        }
      });
    }

    await tx.complete;
    return urls;
  }

  /**
   * Removes entries corresponding to each of the URLs from both the Cache
   * Storage API and from IndexedDB.
   *
   * @private
   * @param {Object} input
   * @param {string} input.cacheName Name of the cache the Responses belong to.
   * @param {Array<string>} urls The URLs to delete.
   */
  async deleteFromCacheAndIDB({cacheName, urls} = {}) {
    assert.isType({cacheName}, 'string');
    assert.isInstance({urls}, Array);

    if (urls.length > 0) {
      const cache = await this.getCache({cacheName});
      const db = await this.getDB({cacheName});

      await urls.forEach(async (url) => {
        await cache.delete(url);
        const tx = db.transaction(cacheName, 'readwrite');
        const store = tx.objectStore(cacheName);
        await store.delete(url);
        await tx.complete;
      });
    }
  }
}

export default Plugin;
