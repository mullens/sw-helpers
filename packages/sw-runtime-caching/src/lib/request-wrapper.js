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

import assert from '../../../../lib/assert';
import {pluginCallbacks, defaultCacheName} from './constants';
import ErrorFactory from './error-factory';

/**
 * This class is used by the various subclasses of `Handler` to configure the
 * cache name and any desired plugins, which is to say classes that implement
 * request lifecycle callbacks.
 *
 * It automatically triggers any registered callbacks at the appropriate time.
 * The current set of plugin callbacks, along with the parameters they're
 * given and when they're called, is:
 *
 *   - `cacheWillUpdate({request, response})`: Called prior to writing an entry
 *   to the cache, allowing the callback to decide whether or not the cache
 *   entry should be written.
 *   - `cacheDidUpdate({cacheName, oldResponse, newResponse})`: Called whenever
 *   an entry is written to the cache, giving the callback a chance to notify
 *   clients about the update or implement cache expiration.
 *   - `cacheWillMatch({cachedResponse})`: Called whenever a response is read
 *   from the cache and is about to be used, giving the callback a chance to
 *   perform validity/freshness checks.
 *   - `fetchDidFail({request})`: Called whenever a network request fails.
 *
 * @memberof module:sw-runtime-caching
 */
class RequestWrapper {
  /**
   * Constructor for RequestWrapper.
   * @param {Object} input
   * @param {string} [input.cacheName] The name of the cache to use for Handlers
   *        that involve caching. If none is provided, a default name that
   *        includes the current service worker scope will be used.
   * @param {Array.<Object>} [input.plugins] Any plugins that should be
   *        invoked.
   * @param {Object} [input.fetchOptions] Values passed along to the
   *        [`init`](https://developer.mozilla.org/en-US/docs/Web/API/GlobalFetch/fetch#Parameters)
   *        of all `fetch()` requests made by this wrapper.
   * @param {Object} [input.matchOptions] Values passed along to the
   *        [`options`](https://developer.mozilla.org/en-US/docs/Web/API/Cache/match#Parameters)
   *        of all cache `match()` requests made by this wrapper.
   */
  constructor({cacheName, plugins, fetchOptions, matchOptions} = {}) {
    if (cacheName) {
      assert.isType({cacheName}, 'string');
      this.cacheName = cacheName;
    } else {
      this.cacheName = defaultCacheName;
    }

    if (fetchOptions) {
      assert.isType({fetchOptions}, 'object');
      this.fetchOptions = fetchOptions;
    }

    if (matchOptions) {
      assert.isType({matchOptions}, 'object');
      this.matchOptions = matchOptions;
    }

    this.pluginCallbacks = {};

    if (plugins) {
      assert.isInstance({plugins}, Array);

      plugins.forEach((plugin) => {
        for (let callbackName of pluginCallbacks) {
          if (typeof plugin[callbackName] === 'function') {
            if (!this.pluginCallbacks[callbackName]) {
              this.pluginCallbacks[callbackName] = [];
            }
            this.pluginCallbacks[callbackName].push(
              plugin[callbackName].bind(plugin));
          }
        }
      });
    }

    if (this.pluginCallbacks.cacheWillUpdate) {
      if (this.pluginCallbacks.cacheWillUpdate.length !== 1) {
        throw ErrorFactory.createError('multiple-cache-will-update-plugins');
      }
    }

    if (this.pluginCallbacks.cacheWillMatch) {
      if (this.pluginCallbacks.cacheWillMatch.length !== 1) {
        throw ErrorFactory.createError('multiple-cache-will-match-plugins');
      }
    }
  }

  /**
   * Opens a cache and maintains a reference to that cache
   * for future use.
   *
   * @example
   * requestWrapper.getCache()
   * .then((openCache) => {
   *    ...
   * });
   *
   * @return {Promise<Cache>} An open `Cache` instance based on the configured
   * `cacheName`.
   */
  async getCache() {
    if (!this._cache) {
      this._cache = await caches.open(this.cacheName);
    }
    return this._cache;
  }

  /**
   * Wraps `cache.match()`, using the previously configured cache name and match
   * options.
   *
   * @example
   * requestWrapper.match({event.request})
   * .then((response) => {
   *   if (!response) {
   *     // No response in cache.
   *     return;
   *   }
   *   ...
   * });
   *
   * @param {Object} input
   * @param {Request|string} input.request The key for the cache lookup.
   * @return {Promise.<Response>} The cached response.
   */
  async match({request}) {
    assert.atLeastOne({request});

    const cache = await this.getCache();
    let cachedResponse = await cache.match(request, this.matchOptions);

    if (this.pluginCallbacks.cacheWillMatch) {
      cachedResponse = this.pluginCallbacks.cacheWillMatch[0](
        {cachedResponse});
    }

    return cachedResponse;
  }

  /**
   * Wraps `fetch()`, calls all `requestWillFetch` before making the network
   * request, and calls any `fetchDidFail` callbacks from the
   * registered plugins if the request fails.
   *
   * @example
   * requestWrapper.fetch({
   *   request: event.request
   * })
   * .then((response) => {
   *  ...
   * })
   * .catch((err) => {
   *   ...
   * });
   *
   * @param {Object} input
   * @param {Request|string} input.request The request or URL to be fetched.
   * @return {Promise.<Response>} The network response.
   */
  async fetch({request}) {
    assert.atLeastOne({request});

    if (this.pluginCallbacks.requestWillFetch) {
      for (let callback of this.pluginCallbacks.requestWillFetch) {
        const returnedPromise = callback({request});
        assert.isInstance({returnedPromise}, Promise);
        const returnedRequest = await returnedPromise;
        assert.isInstance({returnedRequest}, Request);
        request = returnedRequest;
      }
    }

    try {
      return await fetch(request, this.fetchOptions);
    } catch (err) {
      if (this.pluginCallbacks.fetchDidFail) {
        for (let callback of this.pluginCallbacks.fetchDidFail) {
          callback({request});
        }
      }

      throw err;
    }
  }

  /**
   * Combines both fetching and caching using the previously configured options
   * and calling the appropriate plugins.
   *
   * By default, responses with a status of [2xx](https://fetch.spec.whatwg.org/#ok-status)
   * will be considered valid and cacheable, but this could be overridden by
   * configuring one or more plugins that implement the `cacheWillUpdate`
   * lifecycle callback.
   *
   * @example
   * requestWrapper.fetchAndCache({
   *   request: event.request
   * })
   * .then((response) => {
   *  ...
   * })
   * .catch((err) => {
   *   ...
   * });
   *
   * @param {Object} input
   * @param {Request} input.request The request to fetch.
   * @param {boolean} [input.waitOnCache] `true` means the method should wait
   *        for the cache.put() to complete before returning. The default value
   *        of `false` means return without waiting. It this value is true
   *        and the response can't be cached, an error will be thrown.
   * @param {Request} [input.cacheKey] Supply a cacheKey if you wish to cache
   *        the response against an alternative request to the `request`
   *        argument.
   * @return {Promise.<Response>} The network response.
   */
  async fetchAndCache({request, waitOnCache, cacheKey}) {
    assert.atLeastOne({request});

    let cachingComplete;
    const response = await this.fetch({request});

    // response.ok is true if the response status is 2xx.
    // That's the default condition.
    let cacheable = response.ok;
    if (this.pluginCallbacks.cacheWillUpdate) {
      cacheable = this.pluginCallbacks.cacheWillUpdate[0](
        {request, response});
    }

    if (cacheable) {
      const newResponse = response.clone();

      // cacheDelay is a promise that may or may not be used to delay the
      // completion of this method, depending on the value of `waitOnCache`.
      cachingComplete = this.getCache().then(async (cache) => {
        let oldResponse;

        // Only bother getting the old response if the new response isn't opaque
        // and there's at least one cacheDidUpdateCallbacks. Otherwise, we don't
        // need it.
        if (response.type !== 'opaque' &&
          this.pluginCallbacks.cacheDidUpdate) {
          oldResponse = await this.match({request});
        }

        // Regardless of whether or not we'll end up invoking
        // cacheDidUpdateCallbacks, wait until the cache is updated.
        const cacheRequest = cacheKey || request;
        await cache.put(cacheRequest, newResponse);

        for (let callback of (this.pluginCallbacks.cacheDidUpdate || [])) {
          callback({cacheName: this.cacheName, oldResponse, newResponse});
        }
      });
    } else if (!cacheable && waitOnCache) {
      // If the developer request to wait on the cache but the response
      // isn't cacheable, throw an error.
      throw ErrorFactory.createError('invalid-reponse-for-caching');
    }

    // Only conditionally await the caching completion, giving developers the
    // option of returning early for, e.g., read-through-caching scenarios.
    if (waitOnCache && cachingComplete) {
      await cachingComplete;
    }

    return response;
  }
}

export default RequestWrapper;
