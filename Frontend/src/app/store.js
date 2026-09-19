import { configureStore } from '@reduxjs/toolkit'
import appReducer from './slices/appSlice'
import authReducer from './slices/authSlice'
import storeReducer from './slices/storeSlice'
import taxiReducer from './slices/taxiSlice'
import quickReducer from './slices/quickSlice'

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    food: storeReducer,
    taxi: taxiReducer,
    quick: quickReducer,
  },
})

export const getStoreState = () => store.getState()

export { useAuthStore } from '../core/auth/auth.store'
