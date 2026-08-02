import { makeStore } from '../src/store/store';

describe('Redux store foundation', () => {
  it('initializes with a valid reducer without logging an error', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const store = makeStore();

      expect(store.getState()).toEqual({});
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
