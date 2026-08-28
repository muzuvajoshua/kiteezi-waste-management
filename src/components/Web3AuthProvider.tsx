"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

export interface Web3AuthUser {
  email?: string;
  name?: string;
  profileImage?: string;
  aggregateVerifier?: string;
  verifier?: string;
  verifierId?: string;
  typeOfLogin?: string;
  idToken?: string;
}

interface Web3AuthContextValue {
  user: Web3AuthUser | null;
  isReady: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextValue | null>(null);

const clientId = process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID || "";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7",
  rpcTarget:
    process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.ankr.com/eth_sepolia",
  displayName: "Sepolia Testnet",
  blockExplorerURL: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://assets.web3auth.io/evm-chains/sepolia.png",
};

export function Web3AuthProvider({ children }: { children: ReactNode }) {
  const web3AuthRef = useRef<Web3Auth | null>(null);
  const initStartedRef = useRef(false);
  const [user, setUser] = useState<Web3AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  const syncUser = async (web3Auth: Web3Auth) => {
    const info = (await web3Auth.getUserInfo()) as Web3AuthUser;
    setUser(info);
    // Establish a server session: POST the Web3Auth ID token; the server
    // verifies it against the JWKS, upserts the user, and sets the session
    // cookie. Identity now lives in the cookie, not in localStorage.
    if (info.idToken) {
      try {
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: info.idToken }),
        });
      } catch (error) {
        console.error("Error establishing server session", error);
      }
    }
  };

  useEffect(() => {
    // StrictMode mounts effects twice in dev; guard so the SDK initialises once
    // and we don't leak modal listeners.
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const init = async () => {
      try {
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: { chainConfig },
        });
        const web3Auth = new Web3Auth({
          clientId,
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
          privateKeyProvider,
        });
        web3AuthRef.current = web3Auth;

        await web3Auth.initModal();
        setIsReady(true);

        if (web3Auth.connected) {
          await syncUser(web3Auth);
        }
      } catch (error) {
        console.error("Error initialising Web3Auth", error);
      }
    };

    init();
  }, []);

  const login = async () => {
    const web3Auth = web3AuthRef.current;
    if (!web3Auth || !isReady) {
      console.error("Web3Auth not ready yet. Please wait for initialization.");
      return;
    }
    try {
      await web3Auth.connect();
      await syncUser(web3Auth);
    } catch (error) {
      console.error("Error logging in", error);
    }
  };

  const logout = async () => {
    const web3Auth = web3AuthRef.current;
    if (!web3Auth) {
      console.error("Web3Auth not initialised");
      return;
    }
    try {
      await web3Auth.logout();
      setUser(null);
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (error) {
        console.error("Error clearing server session", error);
      }
    } catch (error) {
      console.error("Error logging out", error);
    }
  };

  return (
    <Web3AuthContext.Provider value={{ user, isReady, login, logout }}>
      {children}
    </Web3AuthContext.Provider>
  );
}

export function useWeb3Auth(): Web3AuthContextValue {
  const ctx = useContext(Web3AuthContext);
  if (!ctx) {
    throw new Error("useWeb3Auth must be used within a Web3AuthProvider");
  }
  return ctx;
}
