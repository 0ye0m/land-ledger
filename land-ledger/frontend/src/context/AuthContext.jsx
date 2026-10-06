import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../services/api';
import { authService } from '../services';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!getToken()) {
        setInitializing(false);
        return;
      }
      try {
        const res = await authService.me();
        if (!cancelled) setUser(res.data.user);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    // Step 1 of sign-in: password check. The API answers with an MFA
    // challenge (challengeId) - never a token. Callers continue with
    // verifyOtp() + completeLogin().
    const res = await authService.login(credentials);
    return res.data; // { mfaRequired: true, challengeId, maskedEmail, ... }
  }, []);

  const verifyOtp = useCallback(async ({ challengeId, otp }) => {
    const res = await authService.verifyOtp({ challengeId, otp });
    return res.data; // { token, user }
  }, []);

  const resendOtp = useCallback((challengeId) => authService.resendOtp({ challengeId }), []);

  /** Step 2 finish: store the verified session. */
  const completeLogin = useCallback(({ token, user }) => {
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await authService.register(payload);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authService.me();
      setUser(res.data.user);
    } catch {
      /* keep current */
    }
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, verifyOtp, resendOtp, completeLogin, register, logout, refreshUser, isAuthenticated: Boolean(user) }),
    [user, initializing, login, verifyOtp, resendOtp, completeLogin, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { api };
