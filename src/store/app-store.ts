import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppStore = {
  isProfileSetupComplete: boolean;
  phoneVerificationByUserId: Record<string, boolean>;
  otpPersistenceByUserId: Record<
    string,
    {
      persisted: boolean;
      reason?: string;
      at: number;
    }
  >;
  setProfileSetupComplete: (value: boolean) => void;
  setPhoneVerifiedForUser: (userId: string, verified: boolean) => void;
  setOtpPersistenceForUser: (
    userId: string,
    payload: { persisted: boolean; reason?: string; at?: number }
  ) => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      isProfileSetupComplete: false,
      phoneVerificationByUserId: {},
      otpPersistenceByUserId: {},
      setProfileSetupComplete: (value) => set({ isProfileSetupComplete: value }),
      setPhoneVerifiedForUser: (userId, verified) =>
        set((state) => ({
          phoneVerificationByUserId: {
            ...state.phoneVerificationByUserId,
            [userId]: verified,
          },
        })),
      setOtpPersistenceForUser: (userId, payload) =>
        set((state) => ({
          otpPersistenceByUserId: {
            ...state.otpPersistenceByUserId,
            [userId]: {
              persisted: payload.persisted,
              reason: payload.reason,
              at: payload.at ?? Date.now(),
            },
          },
        })),
    }),
    { name: "m4l-app-store" }
  )
);
