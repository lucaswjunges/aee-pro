import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, AuthResponse } from "@aee-pro/shared";
import { api } from "./api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (name: string, email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<User>("/auth/me")
      .then((res) => {
        if (res.success && res.data) {
          setUser(res.data);
        } else {
          api.setToken(null);
        }
      })
      .catch(() => {
        api.setToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res = await api.post<AuthResponse>("/auth/login", { email, password });
    if (res.success && res.data) {
      api.setToken(res.data.token);
      setUser(res.data.user);
      return null;
    }
    return res.error ?? "Erro ao fazer login";
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<string | null> => {
      const res = await api.post<AuthResponse>("/auth/register", { name, email, password });
      if (res.success && res.data) {
        api.setToken(res.data.token);
        setUser(res.data.user);
        return null;
      }
      return res.error ?? "Erro ao criar conta";
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout", {}).catch(() => {});
    api.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
