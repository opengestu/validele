// Minimal in-repo test/global typings to satisfy the editor without external @types
// This file provides lightweight declarations for describe/test/expect and Cypress `cy`.

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;
declare function expect(actual: any): any;

declare const cy: any;
declare const vi: any;
declare namespace Cypress { interface Chainable<T = any> { } }
