importScripts(
  '/node_modules/mocha/mocha.js',
  '/node_modules/chai/chai.js',
  '/node_modules/sw-testing-helpers/build/browser/mocha-utils.js',
  '/packages/sw-routing/build/sw-routing.min.js'
);

const expect = self.chai.expect;
mocha.setup({
  ui: 'bdd',
  reporter: null,
});

const exportedClasses = [
  'ExpressRoute',
  'RegExpRoute',
  'Route',
  'Router',
];

describe('Test Library Surface', function() {
  it('should be accessible via goog.routing', function() {
    expect(goog.routing).to.exist;
  });

  exportedClasses.forEach((exportedClass) => {
    it(`should expose ${exportedClass} via goog.routing`, function() {
      expect(goog.routing[exportedClass]).to.exist;
    });
  });
});
