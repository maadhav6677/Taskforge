import { configureStore } from '@reduxjs/toolkit';

type FoundationState = Record<string, never>;

const initialState: FoundationState = {};

// Redux requires a real reducer before feature slices exist. Replace this with
// an explicit slice map when the first client-only global state is introduced.
const rootReducer = (state: FoundationState = initialState): FoundationState => state;

export const makeStore = () =>
  configureStore({
    reducer: rootReducer,
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
