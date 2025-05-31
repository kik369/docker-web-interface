// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []); // Add takeRecords if needed by any code

  constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) {}

  // You might need to simulate intersection changes for specific tests,
  // but for just preventing the error, the methods above are enough.
  // Example method to simulate an intersection event:
  simulateIntersect(isIntersecting: boolean, target: Element) {
    const entry: Partial<IntersectionObserverEntry> = {
      isIntersecting,
      target,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: isIntersecting ? target.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0, toJSON: () => '' },
      rootBounds: null,
      time: Date.now(),
    };
    this.callback([entry as IntersectionObserverEntry], this);
  }
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});
