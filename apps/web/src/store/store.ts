import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
  reducer: {
    // Placeholder reducer map. Feature reducers are intentionally added in later phases.
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
