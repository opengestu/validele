// Lightweight Cypress/global test declarations for the editor
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function expect(actual: any): any;

declare const cy: any;
declare namespace Cypress { interface Chainable<T = any> {} }
