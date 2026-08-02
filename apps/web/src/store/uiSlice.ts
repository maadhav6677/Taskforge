import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  createPanelOpen: boolean;
  selectedTaskId: string | null;
}

const initialState: UiState = { createPanelOpen: false, selectedTaskId: null };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setCreatePanelOpen: (state, action: PayloadAction<boolean>) => {
      state.createPanelOpen = action.payload;
    },
    setSelectedTaskId: (state, action: PayloadAction<string | null>) => {
      state.selectedTaskId = action.payload;
    },
  },
});

export const { setCreatePanelOpen, setSelectedTaskId } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
