import { makeStore } from '../src/store/store';
import { setCreatePanelOpen, setSelectedTaskId } from '../src/store/uiSlice';

describe('Redux store foundation', () => {
  it('initializes with a valid reducer without logging an error', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const store = makeStore();

      expect(store.getState()).toEqual({
        ui: { createPanelOpen: false, selectedTaskId: null },
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('stores only client-side workspace presentation state', () => {
    const store = makeStore();
    store.dispatch(setCreatePanelOpen(true));
    store.dispatch(setSelectedTaskId('4c47f2ba-cb9c-4d6a-a806-63c67c0d87da'));

    expect(store.getState().ui).toEqual({
      createPanelOpen: true,
      selectedTaskId: '4c47f2ba-cb9c-4d6a-a806-63c67c0d87da',
    });
  });
});
