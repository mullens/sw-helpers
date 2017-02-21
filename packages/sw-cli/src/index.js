/**
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
**/

'use strict';

const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const updateNotifier = require('update-notifier');
const swBuild = require('sw-build');

const logHelper = require('./lib/log-helper');
const pkg = require('../package.json');
const generateGlobPattern = require('./lib/generate-glob-pattern');

const askForRootOfWebApp = require('./lib/questions/ask-root-of-web-app');
const askForServiceWorkerName = require('./lib/questions/ask-sw-name');
const askSaveConfigFile = require('./lib/questions/ask-save-config');
const askForExtensionsToCache =
  require('./lib/questions/ask-extensions-to-cache');

/**
 * This class is a wrapper to make test easier. This is used by
 * ./bin/index.js to pass in the args when the CLI is used.
 */
class SWCli {
  /**
   * This is a helper method that allows the test framework to call argv with
   * arguments without worrying about running as an actual CLI.
   *
   * @private
   * @param {Object} argv The value passed in via process.argv.
   * @return {Promise} Promise is returned so testing framework knows when
   * handling the request has finished.
   */
  argv(argv) {
    updateNotifier({pkg}).notify();

    const cliArgs = minimist(argv);
    if (cliArgs._.length > 0) {
      // We have a command
      return this.handleCommand(cliArgs._[0], cliArgs._.splice(1), cliArgs)
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
    } else {
      // we have a flag only request
      return this.handleFlag(cliArgs)
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
    }
  }

  /**
   * Prints the help text to the terminal.
   */
  printHelpText() {
    const helpText = fs.readFileSync(
      path.join(__dirname, 'cli-help.txt'), 'utf8');
    logHelper.info(helpText);
  }

  /**
   * If there is no command given to the CLI then the flags will be passed
   * to this function in case a relevant action can be taken.
   * @param {object} flags The available flags = require(the command line.
   * @return {Promise} returns a promise once handled.
   */
  handleFlag(flags) {
    let handled = false;
    if (flags.h || flags.help) {
      this.printHelpText();
      handled = true;
    }

    if (flags.v || flags.version) {
      logHelper.info(pkg.version);
      handled = true;
    }

    if (handled) {
      return Promise.resolve();
    }

    // This is a fallback
    this.printHelpText();
    return Promise.reject();
  }

  /**
   * If a command is given in the command line args, this method will handle
   * the appropriate action.
   * @param {string} command The command name.
   * @param {object} args The arguments given to this command.
   * @param {object} flags The flags supplied with the command line.
   * @return {Promise} A promise for the provided task.
   */
  handleCommand(command, args, flags) {
    switch (command) {
      case 'generate-sw':
        return this._generateSW();
      case 'build-file-manifest':
        logHelper.error(`TODO: Implement.`);
        return Promise.reject();
      default:
        logHelper.error(`Invlaid command given '${command}'`);
        return Promise.reject();
    }
  }

  /**
   * This method will generate a working service worker with a file manifest.
   * @return {Promise} The promise returned here will be used to exit the
   * node process cleanly or not.
   */
  _generateSW() {
    let rootDirPath;
    let fileExtentionsToCache;
    let serviceWorkerName;

    return askForRootOfWebApp()
    .then((rDirectory) => {
      rootDirPath = rDirectory;
      return askForExtensionsToCache(rootDirPath);
    })
    .then((extensionsToCache) => {
      fileExtentionsToCache = extensionsToCache;
      return askForServiceWorkerName();
    })
    .then((swName) => {
      serviceWorkerName = swName;
      return askSaveConfigFile();
    })
    .then((sConfig) => {
      const globPattern = generateGlobPattern(
        rootDirPath, fileExtentionsToCache);

      return swBuild.generateSW({
        rootDirectory: rootDirPath,
        globPatterns: [
          globPattern,
        ],
        globIgnores: [
          path.join(rootDirPath, serviceWorkerName),
        ],
        serviceWorkerName,
      });
    });
  }
}

module.exports = SWCli;
