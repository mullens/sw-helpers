/*
 Copyright 2017 Google Inc. All Rights Reserved.
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
 * # sw-image-helper
 *
 * @module sw-image-helper
 */

class ImageHelper {
  constructor(event) {
    this.event = event;
    this.url = this.event.request.url;
  }

  addWebPSupport(find = ['.jpg', '.png'], replaceWith = '.webp') {
    if (this._isInAcceptHeader('image/webp')) {
      this.replace(find, replaceWith);
    }
  }

  addJPGXRSupport(find = ['.jpg', '.png'], replaceWith = '.jxr') {
    if (this._isInAcceptHeader('image/jxr')) {
      this.replace(find, replaceWith);
    }
  }

  addDPRSupport(find = '2x') {
    // Create a promise to let getResponse wait for this
    this.dprPromise = new Promise((resolveDprPromise, rejectDprPromise) => {
      // TODO(mullens): Don't do this for every request
      const dbOpenRequest = indexedDB.open('image-helper', 1);
      return new Promise((resolve, reject) => {
        dbOpenRequest.onerror = () => rejectDprPromise();
        dbOpenRequest.onsuccess = () => resolve(dbOpenRequest.result);
      }).then((result) => {
        let transaction = result.transaction(['info'], 'readwrite');
        let objectStore = transaction.objectStore('info');
        let objectStoreRequest = objectStore.get('dpr');
        objectStoreRequest.onerror = () => rejectDprPromise();
        objectStoreRequest.onsuccess = () => {
          let dpr = objectStoreRequest.result.value + 'x';
          this.replace(find, dpr);
          resolveDprPromise();
        }
      });
    });
  }

  getResponse() {
    // Wait for addDPRSupport to finish
    if (this.dprPromise) {
      // We load whatever URL we have, regardless if no DPR was in IDB
      return this.dprPromise.then(() => fetch(this.url), () => fetch(this.url));
    } else {
      return fetch(this.url);
    }
  }

  replace(find, replaceWith) {
    if (typeof find === 'string' || find instanceof RegExp) {
      find = [find];
    }

    find.forEach(
      (pattern) => this.url = this.url.replace(pattern, replaceWith));
  }

  _isInAcceptHeader(str) {
    return (this.event.request.headers.get('accept') &&
      this.event.request.headers.get('accept').includes(str));
  }
}